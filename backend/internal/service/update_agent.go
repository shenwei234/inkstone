package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// 更新运行状态
type UpdatePhase string

const (
	UpdateIdle    UpdatePhase = "idle"    // 空闲
	UpdateRunning UpdatePhase = "running" // 正在执行更新（git + docker）
	UpdateSuccess UpdatePhase = "success" // 更新成功
	UpdateFailed  UpdatePhase = "failed"  // 更新失败
)

// updatePollInterval 是轮询「更新推送后台」的间隔。
// 推送后台发布新版本后，实例最迟在此间隔内自动开始更新（无需人工点击）。
const updatePollInterval = 15 * time.Second

// updateHTTPTimeout 单次与推送后台通信的超时。
const updateHTTPTimeout = 15 * time.Second

// maxUpdateLogs 内存中保留的最大日志行数。
const maxUpdateLogs = 200

// UpdateTask 是推送后台下发的更新任务描述。
type UpdateTask struct {
	Version     string `json:"version"`
	Notes       string `json:"notes"`
	RepoURL     string `json:"repo_url"`
	Branch      string `json:"branch"`
	TarName     string `json:"tar_name"`
	ComposeFile string `json:"compose_file"`
}

// UpdateConfig 是「系统更新」页展示的配置视图（令牌只回传是否已设置）。
type UpdateConfig struct {
	ServerURL   string   `json:"server_url"`
	TokenSet    bool     `json:"token_set"`
	Auto        bool     `json:"auto"`
	RepoDir     string   `json:"repo_dir"`
	ComposeFile string   `json:"compose_file"`
	MirrorURLs  []string `json:"mirror_urls"`
	Configured  bool     `json:"configured"` // 服务地址与令牌是否都已填写
}

// UpdateConfigInput 是保存配置的入参（令牌留空表示保持原值不变）。
type UpdateConfigInput struct {
	ServerURL   string `json:"server_url"`
	Token       string `json:"token"`
	Auto        bool   `json:"auto"`
	RepoDir     string `json:"repo_dir"`
	ComposeFile string `json:"compose_file"`
	MirrorURLs  string `json:"mirror_urls"` // 分号分隔的备用仓库地址
}

// UpdateStatus 描述一次（或最近一次）更新的进度，前端据此渲染状态与日志。
type UpdateStatus struct {
	Phase       UpdatePhase `json:"phase"`
	Running     bool        `json:"running"`
	Configured  bool        `json:"configured"`
	Online      bool        `json:"online"` // 最近一次轮询推送后台是否成功
	Message     string      `json:"message"`
	Task        *UpdateTask `json:"task"` // 待执行/正在执行的更新任务
	Logs        []string    `json:"logs"`
	StartedAt   string      `json:"started_at,omitempty"`
	FinishedAt  string      `json:"finished_at,omitempty"`
	LastCheckAt string      `json:"last_check_at,omitempty"`
	LastError   string      `json:"last_error,omitempty"`
}

// UpdateAgent 负责博客实例侧的自动更新：
//  1. 定时轮询「更新推送后台」（D:\Update 部署的服务）并上报心跳；
//  2. 收到新版本任务后，git 拉取镜像包仓库 → docker load 新镜像 → docker compose 替换部署；
//  3. 全过程记录内存日志，并向推送后台上报 running/success/failed 进度。
//
// 设计要点：
//   - 更新过程中 backend 容器会被自身重建，进程可能中途被杀，属于预期行为；
//     推送后台会在实例重启后的下次轮询时根据实际上报版本自动纠正状态。
//   - 未配置服务地址/令牌时轮询自动跳过，不影响主服务运行。
type UpdateAgent struct {
	settings    *SettingsService
	frontendURL string
	dataDir     string // 持久化目录（放更新验证状态文件，随 uploads 卷保留）

	mu        sync.Mutex
	phase     UpdatePhase
	logs      []string
	task      *UpdateTask
	started   time.Time
	finished  time.Time
	lastCheck time.Time
	online    bool
	lastError string
	running   bool

	stopCh chan struct{}
	client *http.Client
}

// 更新验证状态文件名（<dataDir>/update-verify.json）。
// 记录「更新前打好的回滚 tag 与期望版本」，供更新重启后的首次启动自检/回滚。
const pendingVerifyFile = "update-verify.json"

// 已部署 commit 记录文件名（<dataDir>/deployed-commit.json），
// 用于「同一 commit 已部署过 → 幂等跳过」判定（防重复更新）。
const deployedCommitFile = "deployed-commit.json"

// versionPattern 限制版本号字符集，防止注入 shell / docker tag。
var versionPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// pendingVerification 是落盘的待验证更新。
type pendingVerification struct {
	Version     string    `json:"version"`      // 期望运行版本（= 推送后台发布的版本号）
	RollbackTag string    `json:"rollback_tag"` // 更新前镜像打的回滚 tag
	RepoDir     string    `json:"repo_dir"`     // 检出目录
	ComposeFile string    `json:"compose_file"` // 编排文件名
	CreatedAt   time.Time `json:"created_at"`   // 更新发起时间
}

func NewUpdateAgent(settings *SettingsService, frontendURL, dataDir string) *UpdateAgent {
	return &UpdateAgent{
		settings:    settings,
		frontendURL: frontendURL,
		dataDir:     dataDir,
		phase:       UpdateIdle,
		logs:        make([]string, 0, 16),
		stopCh:      make(chan struct{}),
		client:      &http.Client{Timeout: updateHTTPTimeout},
	}
}

// Start 启动后台轮询协程（幂等调用安全，重复 Start 只会有一个循环）。
// 同时启动「更新后自检」：若上次更新留下了待验证状态，校验运行版本或自动回滚。
func (a *UpdateAgent) Start() {
	go func() {
		ticker := time.NewTicker(updatePollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-a.stopCh:
				return
			case <-ticker.C:
				a.tick()
			}
		}
	}()
	// 延迟几秒等服务就绪（数据库/HTTP 监听完成）后再自检
	go func() {
		time.Sleep(5 * time.Second)
		a.VerifyPendingUpdate()
	}()
}

// Stop 停止轮询（测试用）。
func (a *UpdateAgent) Stop() {
	select {
	case <-a.stopCh:
	default:
		close(a.stopCh)
	}
}

// tick 是单次轮询：配置缺失时跳过；收到任务后按「自动更新」开关决定执行还是挂起待手动。
func (a *UpdateAgent) tick() {
	cfg := a.Config()
	if !cfg.Configured {
		return
	}
	task, err := a.poll()
	a.mu.Lock()
	a.lastCheck = time.Now()
	if err != nil {
		a.online = false
		a.lastError = err.Error()
		a.mu.Unlock()
		return
	}
	a.online = true
	a.lastError = ""
	auto := a.settings.BoolValue(SettingUpdateAuto, true)
	if task != nil && !a.running {
		if auto {
			a.mu.Unlock()
			a.appendLog(fmt.Sprintf("收到推送版本 %s，自动更新已启动（无需人工操作）", task.Version))
			a.execute(*task)
			return
		}
		a.task = task
		a.appendLog(fmt.Sprintf("发现新版本 %s，自动更新已关闭，请在「系统更新」页手动执行", task.Version))
	}
	a.mu.Unlock()
}

// Config 读取当前更新配置（视图）。
func (a *UpdateAgent) Config() UpdateConfig {
	serverURL, _ := a.settings.Get(SettingUpdateServerURL)
	token, _ := a.settings.Get(SettingUpdateToken)
	repoDir, _ := a.settings.Get(SettingUpdateRepoDir)
	composeFile, _ := a.settings.Get(SettingUpdateComposeFile)
	mirrorURLs, _ := a.settings.Get(SettingUpdateMirrorURLs)
	if repoDir == "" {
		repoDir = "/opt/inkstone-images"
	}
	if composeFile == "" {
		composeFile = "docker-compose.offline.yml"
	}
	serverURL = strings.TrimRight(strings.TrimSpace(serverURL), "/")
	return UpdateConfig{
		ServerURL:   serverURL,
		TokenSet:    strings.TrimSpace(token) != "",
		Auto:        a.settings.BoolValue(SettingUpdateAuto, true),
		RepoDir:     repoDir,
		ComposeFile: composeFile,
		MirrorURLs:  splitMirrorURLs(mirrorURLs),
		Configured:  serverURL != "" && strings.TrimSpace(token) != "",
	}
}

// splitMirrorURLs 解析备用仓库地址（分号/逗号分隔，去空去重）。
func splitMirrorURLs(raw string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool { return r == ';' || r == ',' || r == '\n' }) {
		u := strings.TrimSpace(part)
		if u != "" && !seen[u] {
			seen[u] = true
			out = append(out, u)
		}
	}
	return out
}

// SaveConfig 保存更新配置。令牌为空字符串表示保持原值不变（脱敏字段保护）。
func (a *UpdateAgent) SaveConfig(input UpdateConfigInput) error {
	payload, err := buildUpdateConfigPayload(input)
	if err != nil {
		return err
	}
	if err := a.settings.Update(payload); err != nil {
		return err
	}
	a.appendLog("更新配置已保存，将按新配置连接推送后台")
	return nil
}

// buildUpdateConfigPayload 校验并构建设置项写入内容（纯函数，便于测试）。
// 令牌为空字符串不下发，由 settings 的敏感字段机制保持原值不变。
func buildUpdateConfigPayload(input UpdateConfigInput) (map[string]any, error) {
	serverURL := strings.TrimRight(strings.TrimSpace(input.ServerURL), "/")
	if serverURL != "" && !strings.HasPrefix(serverURL, "http") {
		return nil, NewValidationError("服务地址必须以 http:// 或 https:// 开头")
	}
	repoDir := strings.TrimSpace(input.RepoDir)
	if repoDir == "" {
		return nil, NewValidationError("请填写镜像包仓库的检出目录")
	}
	composeFile := strings.TrimSpace(input.ComposeFile)
	if composeFile == "" {
		composeFile = "docker-compose.offline.yml"
	}
	payload := map[string]any{
		SettingUpdateServerURL:   serverURL,
		SettingUpdateAuto:        input.Auto,
		SettingUpdateRepoDir:     repoDir,
		SettingUpdateComposeFile: composeFile,
		SettingUpdateMirrorURLs:  strings.TrimSpace(input.MirrorURLs),
	}
	if token := strings.TrimSpace(input.Token); token != "" {
		payload[SettingUpdateToken] = token
	}
	return payload, nil
}

// Status 返回当前更新状态（幂等，可反复轮询）。
func (a *UpdateAgent) Status() UpdateStatus {
	a.mu.Lock()
	defer a.mu.Unlock()
	cfg := a.Config()
	msg := statusMessage(a.phase, a.running, a.lastError)
	return UpdateStatus{
		Phase:       a.phase,
		Running:     a.running,
		Configured:  cfg.Configured,
		Online:      a.online,
		Message:     msg,
		Task:        a.task,
		Logs:        append([]string(nil), a.logs...),
		StartedAt:   formatUpdateTime(a.started),
		FinishedAt:  formatUpdateTime(a.finished),
		LastCheckAt: formatUpdateTime(a.lastCheck),
		LastError:   a.lastError,
	}
}

// CheckOnce 立即轮询一次推送后台，返回待更新任务（不执行）。
func (a *UpdateAgent) CheckOnce() (*UpdateTask, error) {
	cfg := a.Config()
	if !cfg.Configured {
		return nil, NewValidationError("尚未配置推送后台地址或访问令牌，请先保存配置")
	}
	task, err := a.poll()
	a.mu.Lock()
	a.lastCheck = time.Now()
	if err != nil {
		a.online = false
		a.lastError = err.Error()
		a.mu.Unlock()
		return nil, err
	}
	a.online = true
	a.lastError = ""
	if task != nil && !a.running {
		a.task = task
	}
	current := a.task
	a.mu.Unlock()
	return current, nil
}

// ApplyNow 立即轮询并执行更新。没有可用更新时返回校验错误。
func (a *UpdateAgent) ApplyNow() error {
	task, err := a.CheckOnce()
	if err != nil {
		return err
	}
	if task == nil {
		return NewValidationError("当前没有可用的更新")
	}
	a.execute(*task)
	return nil
}

// ———— 与推送后台通信 ————

type pollRequest struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	Version string `json:"version"`
	Phase   string `json:"phase"`
}

type pollResponse struct {
	HasUpdate bool        `json:"has_update"`
	Task      *UpdateTask `json:"task"`
	Message   string      `json:"message"`
}

// poll 上报心跳并获取待更新任务（无任务返回 nil）。
func (a *UpdateAgent) poll() (*UpdateTask, error) {
	cfg := a.Config()
	if !cfg.Configured {
		return nil, NewValidationError("尚未配置推送后台地址或访问令牌")
	}
	token, _ := a.settings.Get(SettingUpdateToken)
	name, _ := a.settings.Get(SettingSiteName)

	a.mu.Lock()
	phase := string(a.phase)
	a.mu.Unlock()

	body, _ := json.Marshal(pollRequest{
		Name:    name,
		URL:     a.frontendURL,
		Version: AppVersion,
		Phase:   phase,
	})
	req, err := http.NewRequest(http.MethodPost, cfg.ServerURL+"/api/client/poll", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("请求创建失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接更新推送后台 %s: %w", cfg.ServerURL, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("更新推送后台拒绝了访问（%d）：%s", resp.StatusCode, extractError(raw))
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("更新推送后台返回异常状态 %d：%s", resp.StatusCode, extractError(raw))
	}
	var result pollResponse
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("推送后台响应解析失败: %w", err)
	}
	if result.HasUpdate && result.Task == nil {
		return nil, fmt.Errorf("推送后台未返回任务详情，请检查后台版本配置")
	}
	return result.Task, nil
}

type reportRequest struct {
	Phase   string `json:"phase"`
	Message string `json:"message"`
	Version string `json:"version"`
}

// report 向推送后台上报进度（失败只记日志，不影响本地流程）。
func (a *UpdateAgent) report(phase, message string) {
	cfg := a.Config()
	if !cfg.Configured {
		return
	}
	token, _ := a.settings.Get(SettingUpdateToken)
	body, _ := json.Marshal(reportRequest{Phase: phase, Message: message, Version: AppVersion})
	req, err := http.NewRequest(http.MethodPost, cfg.ServerURL+"/api/client/report", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
	resp, err := a.client.Do(req)
	if err != nil {
		a.appendLog("向推送后台上报进度失败（不影响更新）：" + err.Error())
		return
	}
	defer resp.Body.Close()
}

// ———— 更新执行：git → docker load → compose up -d ————

// execute 执行一次更新任务。同步阻塞直至完成或失败。
// 注意：最后一步 docker compose up -d 会重建 backend 容器，当前进程可能被终止，
// 无法保证 success 上报成功；推送后台会在实例重启后的下次轮询时自动纠正。
func (a *UpdateAgent) execute(task UpdateTask) {
	a.mu.Lock()
	if a.running {
		a.mu.Unlock()
		return
	}
	a.running = true
	a.phase = UpdateRunning
	a.task = &task
	a.started = time.Now()
	a.finished = time.Time{}
	a.lastError = ""
	a.logs = a.logs[:0]
	a.mu.Unlock()

	a.appendLog(fmt.Sprintf("开始更新到 %s（镜像仓库：%s）", task.Version, task.RepoURL))
	a.report("running", "开始更新到 "+task.Version)

	cfg := a.Config()
	if err := a.runUpdateSteps(cfg, task); err != nil {
		a.mu.Lock()
		a.running = false
		a.phase = UpdateFailed
		a.finished = time.Now()
		a.lastError = err.Error()
		a.mu.Unlock()
		a.appendLog("更新失败：" + err.Error())
		a.report("failed", err.Error())
		return
	}
	a.mu.Lock()
	a.running = false
	a.phase = UpdateSuccess
	a.finished = time.Now()
	a.mu.Unlock()
	a.appendLog(fmt.Sprintf("更新完成：%s 已加载并替换部署（如服务未自动重启，请手动 docker compose up -d）", task.Version))
	a.report("success", "更新完成 "+task.Version)
}

// runUpdateSteps 依次执行：仓库同步（多源回退）→ 镜像包校验 → docker load（含新旧对比）
// → 打回滚点 + 落盘待验证 → sibling 容器 compose up -d。
//
// docker load 在本容器内执行（不会杀掉自身），只有最后的 compose up -d 交给
// 一次性 sibling 容器——它会 stop 本容器（backend 自身），不能跑在本进程里。
func (a *UpdateAgent) runUpdateSteps(cfg UpdateConfig, task UpdateTask) error {
	branch := task.Branch
	if branch == "" {
		branch = "main"
	}
	tarName := task.TarName
	if tarName == "" {
		tarName = "inkstone-images.tar"
	}
	composeFile := task.ComposeFile
	if composeFile == "" {
		composeFile = cfg.ComposeFile
	}
	repoDir := cfg.RepoDir
	tarPath := filepath.Join(repoDir, tarName)

	// 版本号仅允许安全字符（用于回滚 tag 与命令拼接，防注入）
	if task.Version != "" && !versionPattern.MatchString(task.Version) {
		return fmt.Errorf("版本号包含非法字符: %q", task.Version)
	}

	// 1/5. git 同步镜像包仓库（origin 失败时按备用地址回退）
	headSHA, err := a.syncRepo(cfg, task.RepoURL, branch)
	if err != nil {
		return err
	}

	// 2/5. 校验镜像包存在并计算摘要
	tarSHA, err := sha256File(tarPath)
	if err != nil {
		return fmt.Errorf("镜像包不可用（%s）：%w", tarPath, err)
	}
	a.appendLog(fmt.Sprintf("  镜像包 %s sha256=%s（%d 字节）", tarName, shortSHA(tarSHA), statFileSize(tarPath)))

	// 3/5. docker load（本进程执行，可对比镜像 ID 变化）
	beforeBackend := dockerImageID("inkstone-backend:latest")
	beforeFrontend := dockerImageID("inkstone-frontend:latest")
	if err := a.runCommand("", "docker", "load", "-i", tarPath); err != nil {
		return fmt.Errorf("docker load 失败: %w", err)
	}
	afterBackend := dockerImageID("inkstone-backend:latest")
	afterFrontend := dockerImageID("inkstone-frontend:latest")
	if beforeBackend == afterBackend && beforeFrontend == afterFrontend {
		// 同一 commit 已部署过（如更新成功后、新版本上报前的重复任务）→ 视为已是最新
		if deployed := a.readDeployedCommit(); deployed != "" && deployed == headSHA {
			a.appendLog(fmt.Sprintf("commit %s 已部署且正在运行，无需重复更新", shortSHA(headSHA)))
			return nil
		}
		return fmt.Errorf("镜像包内容与当前运行版本一致（commit %s），疑似未包含 %s 的新镜像，已终止部署", shortSHA(headSHA), task.Version)
	}
	a.appendLog(fmt.Sprintf("  镜像已更新：backend %s→%s，frontend %s→%s",
		shortID(beforeBackend), shortID(afterBackend), shortID(beforeFrontend), shortID(afterFrontend)))

	// 4/5. 打回滚点 + 落盘待验证状态（供更新重启后自检/自动回滚）
	rollbackTag := "rollback-" + time.Now().Format("20060102-150405")
	for _, img := range []string{"inkstone-backend:latest", "inkstone-frontend:latest"} {
		if err := a.runCommand("", "docker", "tag", img, tagWithSuffix(img, rollbackTag)); err != nil {
			return fmt.Errorf("创建回滚镜像失败: %w", err)
		}
	}
	pending := pendingVerification{
		Version:     task.Version,
		RollbackTag: rollbackTag,
		RepoDir:     repoDir,
		ComposeFile: composeFile,
		CreatedAt:   time.Now(),
	}
	if err := writePendingVerification(a.dataDir, pending); err != nil {
		// 写失败不阻断更新，但失去自动回滚能力，需显式告知
		a.appendLog("警告：更新验证状态写入失败，自动回滚不可用：" + err.Error())
	}
	// 记录本次部署的 commit：自治模式据此判断「已部署」；fail 时不写，下次仍会触发
	if err := a.writeDeployedCommit(headSHA); err != nil {
		a.appendLog("警告：已部署 commit 记录失败，自治模式可能重复触发：" + err.Error())
	}

	// 5/5. compose up -d 交给一次性 sibling 容器执行：
	// 它会 stop 本容器（backend 自身），若跑在本进程内会连同部署进程一起被杀。
	a.appendLog(fmt.Sprintf("[5/5] 启动一次性部署容器 %s（docker compose up -d）...", updateSiblingName))
	_ = a.runCommand("", "docker", "rm", "-f", updateSiblingName)
	deployCmd := fmt.Sprintf("cd %s && docker compose -f %s up -d", repoDir, composeFile)
	if err := a.runCommand("", "docker", "run", "--rm", "--name", updateSiblingName,
		"--entrypoint", "/bin/sh", // 覆盖镜像 ENTRYPOINT（/app/server），否则参数会被当 server 参数
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", "/opt/inkstone-images:/app/inkstone-images",
		// compose 插件挂到 CLI 默认查找路径（设 DOCKER_CLI_PLUGINS_DIR 在部分环境不生效）
		"-v", "/usr/libexec/docker/cli-plugins:/usr/lib/docker/cli-plugins:ro",
		"inkstone-backend:latest",
		"-c", deployCmd,
	); err != nil {
		return fmt.Errorf("部署容器执行失败: %w", err)
	}
	a.appendLog("替换部署已下发，服务将自动重启。更新结果将在重启后自动校验（失败将自动回滚）")
	return nil
}

// syncRepo 同步镜像包 git 仓库，返回同步后的 HEAD commit sha。
// 检出目录的 origin 可能是容器内路径（file:///opt/repo.git），宿主机不可用；
// 因此 fetch 按 [origin, 备用地址...] 依次尝试，任一成功即继续。
func (a *UpdateAgent) syncRepo(cfg UpdateConfig, repoURL, branch string) (string, error) {
	sources := append([]string{"origin"}, cfg.MirrorURLs...)
	if isGitRepo(cfg.RepoDir) {
		a.appendLog(fmt.Sprintf("[1/5] 同步镜像仓库（分支 %s，回退源 %d 个）", branch, len(sources)-1))
		var lastErr error
		for _, src := range sources {
			if err := a.runCommand(cfg.RepoDir, "git", "fetch", "--depth", "1", src, branch); err != nil {
				a.appendLog(fmt.Sprintf("  源 %s 不可用，尝试下一个", src))
				lastErr = err
				continue
			}
			// reset --hard 不影响未跟踪文件（如服务器本地维护的 .env）
			if err := a.runCommand(cfg.RepoDir, "git", "reset", "--hard", "FETCH_HEAD"); err != nil {
				return "", fmt.Errorf("git reset 失败: %w", err)
			}
			sha := repoHeadSHA(cfg.RepoDir)
			a.appendLog(fmt.Sprintf("  同步完成（源 %s），HEAD=%s", src, shortSHA(sha)))
			return sha, nil
		}
		return "", fmt.Errorf("git fetch 失败（已尝试 %d 个源）：%w", len(sources), lastErr)
	}

	a.appendLog(fmt.Sprintf("[1/5] 首次克隆镜像仓库 → %s（%s）", cfg.RepoDir, repoURL))
	if err := os.MkdirAll(filepath.Dir(cfg.RepoDir), 0o755); err != nil {
		return "", fmt.Errorf("创建仓库目录失败: %w", err)
	}
	if err := a.runCommand("", "git", "clone", "--depth", "1", "--branch", branch, repoURL, cfg.RepoDir); err != nil {
		return "", fmt.Errorf("git clone 失败: %w", err)
	}
	sha := repoHeadSHA(cfg.RepoDir)
	a.appendLog(fmt.Sprintf("  克隆完成，HEAD=%s", shortSHA(sha)))
	return sha, nil
}

// VerifyPendingUpdate 在服务启动时校验上次更新的结果：
//   - 运行版本（AppVersion）与期望版本一致 → 清除待验证状态，视为更新成功；
//   - 不一致（典型原因：打包时漏改 AppVersion，镜像版本与发布版本不符）→ 自动回滚到
//     更新前打好的 rollback tag 并重新部署，同时向推送后台上报失败。
//
// 无待验证状态时直接返回。更新成功后新容器拉起时会自动完成校验与上报。
func (a *UpdateAgent) VerifyPendingUpdate() {
	pending, err := readPendingVerification(a.dataDir)
	if err != nil {
		a.appendLog("读取更新验证状态失败（跳过自检）：" + err.Error())
		return
	}
	if pending == nil {
		return
	}

	if AppVersion == pending.Version {
		a.appendLog(fmt.Sprintf("更新自检通过：运行版本 %s 与发布版本一致", AppVersion))
		if err := clearPendingVerification(a.dataDir); err != nil {
			a.appendLog("清理更新验证状态失败：" + err.Error())
		}
		a.report("success", fmt.Sprintf("更新完成并已验证 %s", AppVersion))
		return
	}

	a.appendLog(fmt.Sprintf("更新自检失败：期望版本 %s，实际运行 %s（镜像内版本与发布版本不符）",
		pending.Version, AppVersion))
	a.appendLog(fmt.Sprintf("开始自动回滚到 %s ...", pending.RollbackTag))

	for _, img := range []string{"inkstone-backend:latest", "inkstone-frontend:latest"} {
		if err := a.runCommand("", "docker", "tag", tagWithSuffix(img, pending.RollbackTag), img); err != nil {
			a.appendLog("回滚失败：" + err.Error())
			a.report("failed", fmt.Sprintf("更新到 %s 后自检失败，自动回滚也未成功：%v", pending.Version, err))
			return
		}
	}
	deployCmd := fmt.Sprintf("cd %s && docker compose -f %s up -d", pending.RepoDir, pending.ComposeFile)
	if err := a.runCommand("", "docker", "run", "--rm", "--name", updateSiblingName,
		"--entrypoint", "/bin/sh",
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", "/opt/inkstone-images:/app/inkstone-images",
		"-v", "/usr/libexec/docker/cli-plugins:/usr/lib/docker/cli-plugins:ro",
		"inkstone-backend:latest",
		"-c", deployCmd,
	); err != nil {
		a.appendLog("回滚部署执行失败：" + err.Error())
		a.report("failed", fmt.Sprintf("更新到 %s 后自检失败，回滚部署失败：%v", pending.Version, err))
		return
	}
	if err := clearPendingVerification(a.dataDir); err != nil {
		a.appendLog("清理更新验证状态失败：" + err.Error())
	}
	a.appendLog(fmt.Sprintf("已回滚到 %s 并重新部署。请检查打包流程：镜像内 AppVersion 必须与发布版本一致", pending.RollbackTag))
	a.report("failed", fmt.Sprintf("更新到 %s 后自检失败（版本不符），已自动回滚", pending.Version))
}

// ———— 更新辅助函数 ————

func isGitRepo(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil && (info.IsDir() || info.Mode().IsRegular())
}

// repoHeadSHA 取仓库当前 HEAD 的 commit sha（失败返回空串）。
func repoHeadSHA(dir string) string {
	out, err := runCommandCapture(dir, "git", "rev-parse", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// sha256File 计算文件 sha256。
func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// statFileSize 返回文件大小（不存在返回 0）。
func statFileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

// shortSHA / shortID 截断哈希便于日志展示。
func shortSHA(s string) string {
	if len(s) > 12 {
		return s[:12]
	}
	return s
}

func shortID(s string) string {
	s = strings.TrimPrefix(s, "sha256:")
	if len(s) > 12 {
		return s[:12]
	}
	return s
}

// tagWithSuffix 把 latest tag 换成 rollback tag（inkstone-backend:latest → inkstone-backend:rollback-xxx）。
func tagWithSuffix(image, tag string) string {
	repo := image
	if i := strings.Index(image, ":"); i >= 0 {
		repo = image[:i]
	}
	return repo + ":" + tag
}

// dockerImageID 取镜像 ID（完整 sha256: 前缀；镜像不存在返回空串）。
func dockerImageID(image string) string {
	out, err := runCommandCapture("", "docker", "images", "--no-trunc", "--format", "{{.ID}}", image)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) == 0 {
		return ""
	}
	return strings.TrimSpace(lines[0])
}

// writePendingVerification / readPendingVerification / clearPendingVerification
// 管理「待验证更新」状态文件。文件不存在时 read 返回 (nil, nil)。
func pendingVerificationPath(dataDir string) string {
	dir := dataDir
	if dir == "" {
		dir = "/app/data"
	}
	return filepath.Join(dir, pendingVerifyFile)
}

func writePendingVerification(dataDir string, p pendingVerification) error {
	if err := os.MkdirAll(filepath.Dir(pendingVerificationPath(dataDir)), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(pendingVerificationPath(dataDir), raw, 0o644)
}

func readPendingVerification(dataDir string) (*pendingVerification, error) {
	raw, err := os.ReadFile(pendingVerificationPath(dataDir))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var p pendingVerification
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func clearPendingVerification(dataDir string) error {
	err := os.Remove(pendingVerificationPath(dataDir))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// deployedCommitPath / readDeployedCommit / writeDeployedCommit
// 管理「已部署 commit」记录（自治模式的核心状态）。
type deployedCommit struct {
	Commit    string    `json:"commit"`
	UpdatedAt time.Time `json:"updated_at"`
}

func deployedCommitPath(dataDir string) string {
	dir := dataDir
	if dir == "" {
		dir = "/app/data"
	}
	return filepath.Join(dir, deployedCommitFile)
}

func (a *UpdateAgent) readDeployedCommit() string {
	raw, err := os.ReadFile(deployedCommitPath(a.dataDir))
	if err != nil {
		return ""
	}
	var d deployedCommit
	if err := json.Unmarshal(raw, &d); err != nil {
		return ""
	}
	return strings.TrimSpace(d.Commit)
}

func (a *UpdateAgent) writeDeployedCommit(sha string) error {
	if strings.TrimSpace(sha) == "" {
		return fmt.Errorf("commit sha 为空")
	}
	path := deployedCommitPath(a.dataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(deployedCommit{Commit: sha, UpdatedAt: time.Now()}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}

// updateSiblingName 是执行 docker load / compose up -d 的一次性容器名。
// 它必须是独立容器而非本容器内的进程，否则 compose stop backend 时会同杀部署进程。
const updateSiblingName = "inkstone-updater"

// runCommand 执行外部命令并将输出逐行写入更新日志。
func (a *UpdateAgent) runCommand(dir string, name string, args ...string) error {
	stdout, err := runCommandCapture(dir, name, args...)
	if err != nil {
		a.appendLog(fmt.Sprintf("  命令执行失败：%s %s", name, strings.Join(args, " ")))
		return fmt.Errorf("%w", err)
	}
	for _, line := range strings.Split(stdout, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			a.appendLog("  " + line)
		}
	}
	return nil
}

// runCommandCapture 执行外部命令，返回 stdout 全文；失败时错误信息附带 stderr/stdout 尾部。
// 30 分钟超时强制终止，防止 git/docker 卡死拖住更新协程。
func runCommandCapture(dir string, name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Env = os.Environ()
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("命令启动失败（%s %s）：%w", name, strings.Join(args, " "), err)
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case runErr := <-done:
		if runErr != nil {
			msg := strings.TrimSpace(stderr.String())
			if msg == "" {
				msg = strings.TrimSpace(stdout.String())
			}
			if msg != "" {
				return stdout.String(), fmt.Errorf("%w: %s", runErr, msg)
			}
			return stdout.String(), runErr
		}
		return stdout.String(), nil
	case <-time.After(30 * time.Minute):
		_ = cmd.Process.Kill()
		<-done
		return "", fmt.Errorf("命令执行超时（30 分钟），已强制终止")
	}
}

func (a *UpdateAgent) appendLog(line string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.logs = append(a.logs, fmt.Sprintf("%s %s", time.Now().Format("15:04:05"), line))
	if n := len(a.logs); n > maxUpdateLogs {
		a.logs = append([]string(nil), a.logs[n-maxUpdateLogs:]...)
	}
}

func formatUpdateTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

func statusMessage(phase UpdatePhase, running bool, lastError string) string {
	switch phase {
	case UpdateRunning:
		return "正在更新中，请勿关闭页面..."
	case UpdateSuccess:
		return "更新已完成"
	case UpdateFailed:
		msg := "更新失败，请查看下方日志"
		if lastError != "" {
			msg += "：" + lastError
		}
		return msg
	default:
		return "就绪"
	}
}

// extractError 从推送后台的错误响应中提取中文错误信息。
func extractError(raw []byte) string {
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &payload); err == nil && payload.Error != "" {
		return payload.Error
	}
	return strings.TrimSpace(string(raw))
}
