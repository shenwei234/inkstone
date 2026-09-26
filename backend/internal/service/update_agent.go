package service

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
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
const updatePollInterval = 60 * time.Second

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
	ServerURL   string `json:"server_url"`
	TokenSet    bool   `json:"token_set"`
	Auto        bool   `json:"auto"`
	RepoDir     string `json:"repo_dir"`
	ComposeFile string `json:"compose_file"`
	Configured  bool   `json:"configured"` // 服务地址与令牌是否都已填写
}

// UpdateConfigInput 是保存配置的入参（令牌留空表示保持原值不变）。
type UpdateConfigInput struct {
	ServerURL   string `json:"server_url"`
	Token       string `json:"token"`
	Auto        bool   `json:"auto"`
	RepoDir     string `json:"repo_dir"`
	ComposeFile string `json:"compose_file"`
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

func NewUpdateAgent(settings *SettingsService, frontendURL string) *UpdateAgent {
	return &UpdateAgent{
		settings:    settings,
		frontendURL: frontendURL,
		phase:       UpdateIdle,
		logs:        make([]string, 0, 16),
		stopCh:      make(chan struct{}),
		client:      &http.Client{Timeout: updateHTTPTimeout},
	}
}

// Start 启动后台轮询协程（幂等调用安全，重复 Start 只会有一个循环）。
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
		Configured:  serverURL != "" && strings.TrimSpace(token) != "",
	}
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

// runUpdateSteps 依次执行：仓库同步（clone/pull）→ docker load → docker compose up -d。
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

	// 1. git 同步镜像包仓库
	if _, err := os.Stat(filepath.Join(repoDir, ".git")); err != nil {
		a.appendLog(fmt.Sprintf("[1/3] 首次克隆镜像仓库 → %s", repoDir))
		if err := os.MkdirAll(filepath.Dir(repoDir), 0o755); err != nil {
			return fmt.Errorf("创建仓库目录失败: %w", err)
		}
		if err := a.runCommand("", "git", "clone", "--depth", "1", "--branch", branch, task.RepoURL, repoDir); err != nil {
			return fmt.Errorf("git clone 失败: %w", err)
		}
	} else {
		a.appendLog(fmt.Sprintf("[1/3] 拉取镜像仓库最新提交（分支 %s）", branch))
		if err := a.runCommand(repoDir, "git", "fetch", "--depth", "1", "origin", branch); err != nil {
			return fmt.Errorf("git fetch 失败: %w", err)
		}
		// reset --hard 不影响未跟踪文件（如服务器本地维护的 .env）
		if err := a.runCommand(repoDir, "git", "reset", "--hard", "FETCH_HEAD"); err != nil {
			return fmt.Errorf("git reset 失败: %w", err)
		}
	}

	// 2/3. docker load 与 compose up -d 必须由「一次性 sibling 容器」执行：
	// compose up -d 会 stop 本容器（backend 自身），若这些命令跑在本容器内，
	// 进程会随容器停止一起被杀，导致新容器来不及创建。sibling 是独立容器，
	// 本容器被替换时它继续完成部署。
	a.appendLog(fmt.Sprintf("[2/3] 启动一次性部署容器 %s（docker load + compose up -d）...", updateSiblingName))
	_ = a.runCommand("", "docker", "rm", "-f", updateSiblingName)
	deployCmd := fmt.Sprintf(
		"cd %s && docker load -i %s && docker compose -f %s up -d",
		repoDir, tarPath, composeFile,
	)
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
	a.appendLog("[3/3] 替换部署已下发，服务将自动重启...")
	return nil
}

// updateSiblingName 是执行 docker load / compose up -d 的一次性容器名。
// 它必须是独立容器而非本容器内的进程，否则 compose stop backend 时会同杀部署进程。
const updateSiblingName = "inkstone-updater"

// runCommand 执行外部命令并将输出逐行写入更新日志。
func (a *UpdateAgent) runCommand(dir string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Env = os.Environ()
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("命令启动失败（%s %s）：%w", name, strings.Join(args, " "), err)
	}
	var wg sync.WaitGroup
	wg.Add(2)
	scan := func(rc io.ReadCloser) {
		defer wg.Done()
		defer rc.Close()
		sc := bufio.NewScanner(rc)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			if line := strings.TrimSpace(sc.Text()); line != "" {
				a.appendLog("  " + line)
			}
		}
	}
	go scan(stdout)
	go scan(stderr)

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case runErr := <-done:
		wg.Wait()
		return runErr
	case <-time.After(30 * time.Minute):
		_ = cmd.Process.Kill()
		<-done
		wg.Wait()
		return fmt.Errorf("命令执行超时（30 分钟），已强制终止")
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
