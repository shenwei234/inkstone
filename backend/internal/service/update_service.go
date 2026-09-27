package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"hash"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"gorm.io/gorm"
)

// 自动更新相关常量。
const (
	// DefaultUpdateRepo 发布仓库（更新推送后台把版本清单与镜像包发布到这里）
	DefaultUpdateRepo = "shenwei234/inkstone"

	// manifestPath 版本清单在仓库中的相对路径
	manifestPath = "releases/latest.json"

	// 内置 GitHub 加速源（国内直连 GitHub 慢/超时时的镜像代理，实例端会自动测速排序）
	defaultMirror1 = "https://ghfast.top/"
	defaultMirror2 = "https://gh-proxy.com/"
	defaultMirror3 = "https://ghproxy.net/"
	defaultMirror4 = "https://ghproxy.cn/"
	defaultMirror5 = "https://mirror.ghproxy.com/"

	// 下载与探测超时
	probeTimeout  = 12 * time.Second
	updateTempDir = "/tmp/inkstone-update"
	// downloadBufferSize / loadBufferSize 大文件 IO buffer（默认 32KB 太小，
	// 512KB 可显著降低 syscall 次数、提升下载与 docker load 吞吐）
	downloadBufferSize = 512 << 10
	loadBufferSize     = 512 << 10

	// fetchManifestTotalTimeout 清单探测总时限（多源并行，最坏等待）
	fetchManifestTotalTimeout = 20 * time.Second

	// 镜像包体积上限（GitHub Release 单资产上限 2GB）
	maxAssetSize = int64(2) << 30

	// agent 容器名（一次性更新代理，负责容器替换与失败回滚）
	agentContainerName = "inkstone-update-agent"

	// 远程清单缓存时间
	remoteCacheTTL = 5 * time.Minute

	// dockerEnvCacheTTL Docker 环境探测结果缓存（轮询友好）
	dockerEnvCacheTTL = 10 * time.Second
)

// UpdateManifest 是发布仓库 releases/latest.json 的结构。
type UpdateManifest struct {
	Version    string          `json:"version"`
	ReleasedAt string          `json:"released_at"`
	MinVersion string          `json:"min_version"`
	Notes      string          `json:"notes"`
	Images     []ManifestImage `json:"images"`
	Asset      ManifestAsset   `json:"asset"`
}

// ManifestImage 镜像包内的单个镜像（load 后按此部署到对应 compose 服务容器）。
type ManifestImage struct {
	Repo    string `json:"repo"`    // 镜像名，如 inkstone-backend
	Tag     string `json:"tag"`     // 标签，通常 latest
	Service string `json:"service"` // compose 服务名，如 backend
}

// ManifestAsset 镜像包资产（GitHub Release 附件）。
type ManifestAsset struct {
	Name   string `json:"name"`   // inkstone-images.tar
	URL    string `json:"url"`    // 下载地址（GitHub Release）
	SHA256 string `json:"sha256"` // 完整性校验值
	Size   int64  `json:"size"`   // 字节数
}

// imageRef 返回 repo:tag。
func (img ManifestImage) imageRef() string {
	if img.Tag == "" {
		return img.Repo
	}
	return img.Repo + ":" + img.Tag
}

// ---------- 对外状态结构 ----------

// DockerEnv 描述 Docker 环境可用性。
type DockerEnv struct {
	Available bool   `json:"available"`
	Socket    string `json:"socket"`
	Message   string `json:"message"`
}

// UpdateSettings 更新相关设置（管理员视图）。
type UpdateSettings struct {
	AutoUpdate   bool     `json:"auto_update"`   // 自动更新开关
	IntervalMins int      `json:"interval_mins"` // 检查间隔（分钟）
	Repo         string   `json:"repo"`          // 发布仓库
	Mirrors      []string `json:"mirrors"`       // 加速源
}

// RemoteVersion 远端发布的最新版本信息。
type RemoteVersion struct {
	Version    string `json:"version"`
	ReleasedAt string `json:"released_at"`
	Notes      string `json:"notes"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256"`
	AssetURL   string `json:"asset_url"`
	Mirror     string `json:"mirror"` // 获取清单实际使用的源
	MinVersion string `json:"min_version"`
}

// UpdateState 更新后台首页所需的全部状态。
type UpdateState struct {
	Docker    DockerEnv            `json:"docker"`
	Current   string               `json:"current_version"`
	Settings  UpdateSettings       `json:"settings"`
	Remote    *RemoteVersion       `json:"remote"`
	CheckedAt *time.Time           `json:"checked_at"`
	HasUpdate bool                 `json:"has_update"`
	LastError string               `json:"last_error"`
	Task      *model.UpdateRecord  `json:"task"` // 进行中的任务
	History   []model.UpdateRecord `json:"history"`
	Rollback  string               `json:"rollback_tag"` // 可回滚的 tag（空=不可回滚）
}

// UpdateService 负责从 GitHub 拉取系统更新并自动完成 Docker 部署。
type UpdateService struct {
	db       *gorm.DB
	repo     *repository.UpdateRepository
	settings *SettingsService
	logs     *LogService
	docker   *DockerClient

	mu         sync.Mutex // 保护 remote 缓存与 running 标志
	remote     *UpdateManifest
	remoteAt   time.Time
	remoteFrom string
	remoteErr  string

	// updateMu 保证同一进程内同时只有一个更新/回滚任务（FindRunning 判重之外的双保险）
	updateMu sync.Mutex
	updating bool

	// dockerEnv 缓存（10s）：高频轮询下避免重复探测 socket
	dockerEnv   DockerEnv
	dockerEnvAt time.Time

	stopCh   chan struct{}
	stopOnce sync.Once
}

// NewUpdateService 创建更新服务。settings/logs 可为 nil（agent 模式不需要）。
func NewUpdateService(db *gorm.DB, repo *repository.UpdateRepository, settings *SettingsService, logs *LogService, socketPath string) *UpdateService {
	return &UpdateService{
		db:       db,
		repo:     repo,
		settings: settings,
		logs:     logs,
		docker:   NewDockerClient(socketPath),
	}
}

// ---------- 设置读取 ----------

// repoFromSettings 读取发布仓库 owner/repo（库中脏数据回退默认值）。
func (s *UpdateService) repoFromSettings() string {
	if s.settings != nil {
		if v, err := s.settings.Get(SettingUpdateRepo); err == nil {
			if v = strings.TrimSpace(v); repoPattern.MatchString(v) {
				return v
			}
		}
	}
	return DefaultUpdateRepo
}

// mirrorURLs 返回去重后的加速源列表（含设置项 + 内置默认）。
func (s *UpdateService) mirrorURLs() []string {
	var out []string
	seen := map[string]bool{}
	add := func(u string) {
		u = strings.TrimSpace(u)
		if u == "" || seen[u] {
			return
		}
		// 只接受 http(s) 链接，防库中脏数据拼出奇怪 URL
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			return
		}
		seen[u] = true
		out = append(out, u)
	}
	if s.settings != nil {
		if v, err := s.settings.Get(SettingUpdateMirrorURLs); err == nil && strings.TrimSpace(v) != "" {
			var list []string
			if json.Unmarshal([]byte(v), &list) == nil {
				for _, u := range list {
					add(u)
				}
			}
		}
	}
	// 设置被清空时回退内置源，保证「零配置可用」
	for _, u := range []string{defaultMirror1, defaultMirror2, defaultMirror3, defaultMirror4, defaultMirror5} {
		add(u)
	}
	return out
}

// autoUpdateEnabled 是否开启自动更新（默认 true，全自动体验）。
func (s *UpdateService) autoUpdateEnabled() bool {
	if s.settings == nil {
		return true
	}
	return s.settings.BoolValue(SettingUpdateEnabled, true)
}

// checkInterval 检查间隔（默认 15 分钟）。
func (s *UpdateService) checkInterval() time.Duration {
	mins := 15
	if s.settings != nil {
		mins = s.settings.IntValue(SettingUpdateCheckInterval, 15)
	}
	if mins < 1 {
		mins = 1
	}
	if mins > 24*60 {
		mins = 24 * 60
	}
	return time.Duration(mins) * time.Minute
}

// ApplySettings 保存更新相关设置（handler 层委托），含输入校验。
func (s *UpdateService) ApplySettings(payload map[string]any) error {
	if s.settings == nil {
		return NewValidationError("更新服务未初始化")
	}
	if err := validateUpdateSettings(payload); err != nil {
		return err
	}
	return s.settings.Update(payload)
}

// validateUpdateSettings 校验更新设置：仓库名、间隔、加速源 URL，防畸形值拼进下载链接。
func validateUpdateSettings(payload map[string]any) error {
	if raw, ok := payload[SettingUpdateRepo]; ok {
		repo, _ := raw.(string)
		if !repoPattern.MatchString(strings.TrimSpace(repo)) {
			return NewValidationError("发布仓库格式应为 owner/repo（仅限字母、数字、点、下划线、连字符）")
		}
	}
	if raw, ok := payload[SettingUpdateCheckInterval]; ok {
		switch v := raw.(type) {
		case float64:
			if v < 1 || v > 1440 {
				return NewValidationError("检查间隔必须在 1-1440 分钟之间")
			}
		case string:
			n, err := strconv.Atoi(strings.TrimSpace(v))
			if err != nil || n < 1 || n > 1440 {
				return NewValidationError("检查间隔必须在 1-1440 分钟之间")
			}
		}
	}
	if raw, ok := payload[SettingUpdateMirrorURLs]; ok {
		list, _ := raw.([]any)
		for _, item := range list {
			u, _ := item.(string)
			if strings.TrimSpace(u) == "" {
				continue
			}
			if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
				return NewValidationError("加速源必须以 http:// 或 https:// 开头：" + u)
			}
			if _, err := url.ParseRequestURI(u); err != nil {
				return NewValidationError("加速源不是合法 URL：" + u)
			}
		}
	}
	return nil
}

// repoPattern 校验 owner/repo 形式（防 URL 路径注入）。
var repoPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$`)

// ---------- 状态查询 ----------

// DockerEnvInfo 返回 Docker 环境可用性（10s 缓存，避免高频轮询重复探测 socket）。
func (s *UpdateService) DockerEnvInfo() DockerEnv {
	s.mu.Lock()
	if !s.dockerEnvAt.IsZero() && time.Since(s.dockerEnvAt) < dockerEnvCacheTTL {
		cached := s.dockerEnv
		s.mu.Unlock()
		return cached
	}
	s.mu.Unlock()

	env := DockerEnv{Available: false, Message: "未知"}
	if err := s.docker.Available(); err != nil {
		env.Message = err.Error()
	} else {
		env.Available = true
		env.Message = "Docker 已连接"
	}
	s.mu.Lock()
	s.dockerEnv = env
	s.dockerEnvAt = time.Now()
	s.mu.Unlock()
	return env
}

// State 汇总更新后台首页状态。
func (s *UpdateService) State() UpdateState {
	st := UpdateState{
		Docker:  s.DockerEnvInfo(),
		Current: AppVersion,
	}
	st.Settings = UpdateSettings{
		AutoUpdate:   s.autoUpdateEnabled(),
		IntervalMins: int(s.checkInterval().Minutes()),
		Repo:         s.repoFromSettings(),
		Mirrors:      s.mirrorURLs(),
	}
	// 一次查询拿最近记录，从中推导 task / rollback / history（避免 3 次往返）
	history, err := s.repo.List(20)
	if err == nil {
		st.History = history
		for i := range history {
			rec := &history[i]
			if st.Task == nil && rec.Status == model.UpdateStatusRunning {
				st.Task = rec
			}
			if st.Rollback == "" && rec.Type == model.UpdateTypeUpdate && rec.RollbackTag != "" {
				st.Rollback = rec.RollbackTag
			}
		}
		if len(history) > 10 {
			st.History = history[:10]
		}
	}

	s.mu.Lock()
	if s.remote != nil && time.Since(s.remoteAt) < remoteCacheTTL {
		st.Remote = manifestToRemote(s.remote, s.remoteFrom)
		st.CheckedAt = &s.remoteAt
	}
	st.LastError = s.remoteErr
	if st.Remote != nil && compareVersion(st.Remote.Version, AppVersion) > 0 {
		st.HasUpdate = true
	}
	s.mu.Unlock()
	return st
}

func manifestToRemote(m *UpdateManifest, from string) *RemoteVersion {
	return &RemoteVersion{
		Version:    m.Version,
		ReleasedAt: m.ReleasedAt,
		Notes:      m.Notes,
		Size:       m.Asset.Size,
		SHA256:     m.Asset.SHA256,
		AssetURL:   m.Asset.URL,
		Mirror:     from,
		MinVersion: m.MinVersion,
	}
}

// ---------- 调度器 ----------

// StartScheduler 启动自动检查循环（立即检查一次，之后按设置间隔检查；
// 发现新版本且开启自动更新时自动执行更新——全程无需人工干预）。
func (s *UpdateService) StartScheduler() {
	s.stopCh = make(chan struct{})
	go s.schedLoop()
}

// StopScheduler 停止调度。
func (s *UpdateService) StopScheduler() {
	s.stopOnce.Do(func() {
		if s.stopCh != nil {
			close(s.stopCh)
		}
	})
}

func (s *UpdateService) schedLoop() {
	// 启动 10 秒后才开始检查，等 DB/网络就绪
	select {
	case <-time.After(10 * time.Second):
	case <-s.stopCh:
		return
	}
	s.checkAndMaybeUpdate(true)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
		}
		if time.Since(s.lastCheck()) < s.checkInterval() {
			continue
		}
		s.checkAndMaybeUpdate(false)
	}
}

func (s *UpdateService) lastCheck() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.remoteAt
}

// checkAndMaybeUpdate 检查远端版本；有新版且开启自动更新时自动触发。
func (s *UpdateService) checkAndMaybeUpdate(force bool) {
	m, from, err := s.fetchRemote(force)
	if err != nil {
		s.setRemoteError(err.Error())
		return
	}
	s.setRemoteError("")
	if compareVersion(m.Version, AppVersion) <= 0 {
		return
	}
	// 版本过低无法自动更新时只提示，不动作
	if m.MinVersion != "" && compareVersion(AppVersion, m.MinVersion) < 0 {
		return
	}
	if !s.autoUpdateEnabled() {
		return
	}
	if _, busy := s.repo.FindRunning(); busy {
		return
	}
	// 复用刚拉到的清单直接启动，无需二次请求
	if err := s.beginUpdate(m, from, "auto"); err != nil {
		s.setRemoteError(err.Error())
	}
}

func (s *UpdateService) setRemoteError(msg string) {
	s.mu.Lock()
	s.remoteErr = msg
	s.mu.Unlock()
}

// ---------- 加速源测速 ----------

// MirrorLatency 单个加速源的探测结果。
type MirrorLatency struct {
	URL     string `json:"url"`
	Latency int64  `json:"latency_ms"` // 毫秒；-1 表示不可用
	Direct  bool   `json:"direct"`     // true = 直连（非加速源）
	From    string `json:"from"`       // manifest / asset 探测目标
}

// TestMirrors 并发探测各加速源延迟（以版本清单为探测目标），按延迟升序返回。
// 纯探测不下载，供后台「更新设置 → 测试延迟」展示。
func (s *UpdateService) TestMirrors() []MirrorLatency {
	repo := s.repoFromSettings()
	direct := fmt.Sprintf("https://raw.githubusercontent.com/%s/main/%s", repo, manifestPath)

	type probe struct {
		url     string
		latency int64
	}
	targets := []string{direct}
	for _, m := range s.mirrorURLs() {
		targets = append(targets, joinMirror(m, direct))
	}

	results := make([]MirrorLatency, len(targets))
	var wg sync.WaitGroup
	var mu sync.Mutex
	probeOne := func(i int, url string) {
		defer wg.Done()
		latency := probeLatency(url, probeTimeout)
		mu.Lock()
		defer mu.Unlock()
		results[i] = MirrorLatency{
			URL:     url,
			Latency: latency,
			Direct:  i == 0,
			From:    "latest.json",
		}
	}
	for i, u := range targets {
		wg.Add(1)
		go probeOne(i, u)
	}
	wg.Wait()

	// 可用源按延迟升序，不可用（-1）排最后
	for i := 1; i < len(results); i++ {
		for j := i; j > 0; j-- {
			a, b := results[j-1], results[j]
			if b.Latency < 0 {
				break
			}
			if a.Latency < 0 || b.Latency < a.Latency {
				results[j-1], results[j] = b, a
				continue
			}
			break
		}
	}
	return results
}

// probeLatency 探测单个 URL 的响应延迟（毫秒）；失败返回 -1。
// 只取前 2KB（Range 头），避免为测速拉全量内容。
func probeLatency(url string, timeout time.Duration) int64 {
	client := &http.Client{Timeout: timeout}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return -1
	}
	req.Header.Set("User-Agent", "inkstone-updater")
	req.Header.Set("Range", "bytes=0-2047")
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return -1
	}
	io.Copy(io.Discard, io.LimitReader(resp.Body, 2048))
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusMethodNotAllowed {
		return -1
	}
	return time.Since(start).Milliseconds()
}

// ---------- 远端清单获取（多源 + 加速） ----------

// manifestURLs 生成版本清单的候选地址（直连 + jsDelivr + 各加速源）。
func (s *UpdateService) manifestURLs() []string {
	repo := s.repoFromSettings()
	direct := fmt.Sprintf("https://raw.githubusercontent.com/%s/main/%s", repo, manifestPath)
	jsdelivr := fmt.Sprintf("https://cdn.jsdelivr.net/gh/%s@main/%s", repo, manifestPath)
	urls := []string{direct, jsdelivr}
	for _, m := range s.mirrorURLs() {
		urls = append(urls, joinMirror(m, direct))
	}
	return urls
}

// joinMirror 把加速源前缀拼到目标 URL（保留完整 https:// 协议，
// ghproxy 系代理的用法即 mirror + "/" + 完整 URL）。
func joinMirror(mirror, target string) string {
	mirror = strings.TrimRight(mirror, "/")
	return mirror + "/" + target
}

// fetchRemote 获取远端版本清单：并发探测全部候选源，取第一个成功响应。
// 结果缓存 5 分钟；force=true 时跳过缓存。
func (s *UpdateService) fetchRemote(force bool) (*UpdateManifest, string, error) {
	if !force {
		s.mu.Lock()
		cached, at := s.remote, s.remoteAt
		s.mu.Unlock()
		if cached != nil && time.Since(at) < remoteCacheTTL {
			return cached, s.remoteFrom, nil
		}
	}

	urls := s.manifestURLs()
	type result struct {
		manifest *UpdateManifest
		from     string
		err      error
	}
	ch := make(chan result, len(urls))
	// ctx 在第一个源成功返回时取消其余请求，避免 goroutine/连接空跑
	ctx, cancel := context.WithTimeout(context.Background(), fetchManifestTotalTimeout)
	defer cancel()
	for _, u := range urls {
		go func(u string) {
			m, err := fetchManifestURLWithCtx(ctx, u)
			ch <- result{manifest: m, from: u, err: err}
		}(u)
	}

	// 总探测时限：所有源并行，最坏也不超过 manifestTotalTimeout
	deadline := time.NewTimer(fetchManifestTotalTimeout)
	defer deadline.Stop()

	var lastErr error
	for i := 0; i < len(urls); i++ {
		select {
		case r := <-ch:
			if r.err == nil && r.manifest != nil {
				s.mu.Lock()
				s.remote = r.manifest
				s.remoteAt = time.Now()
				s.remoteFrom = r.from
				s.mu.Unlock()
				return r.manifest, r.from, nil
			}
			if r.err != nil {
				lastErr = r.err
			}
		case <-deadline.C:
			return nil, "", fmt.Errorf("获取版本清单超时（%d 秒内所有源均未响应）", int(fetchManifestTotalTimeout.Seconds()))
		}
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("无法获取版本清单（所有源均不可用）")
	}
	return nil, "", lastErr
}

// updateProbeClient 探测与清单获取共用（http.Client 内部连接池复用，
// 避免每个源新建 client 重复 TCP/TLS 握手）。
var updateProbeClient = &http.Client{Timeout: probeTimeout}

// fetchManifestURL 拉取并解析一个版本清单地址。
func fetchManifestURL(url string) (*UpdateManifest, error) {
	return fetchManifestURLWithCtx(context.Background(), url)
}

// fetchManifestURLWithCtx 同 fetchManifestURL，ctx 取消时会中断未完成的请求。
func fetchManifestURLWithCtx(ctx context.Context, url string) (*UpdateManifest, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "inkstone-updater")
	resp, err := updateProbeClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("源返回 %d", resp.StatusCode)
	}
	var m UpdateManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("清单解析失败")
	}
	if m.Version == "" || m.Asset.URL == "" {
		return nil, fmt.Errorf("清单缺少 version/asset")
	}
	return &m, nil
}

// ---------- 镜像包下载（加速源测速 + 失败切换） ----------

// rankedSource 测速后的候选源。
type rankedSource struct {
	url     string
	latency time.Duration
	failed  bool
}

// rankSources 并发探测候选源可用性与延迟，按延迟升序返回（探测失败的排最后）。
func rankSources(urls []string, timeout time.Duration) []rankedSource {
	client := &http.Client{Timeout: timeout}
	out := make([]rankedSource, len(urls))
	var wg sync.WaitGroup
	var mu sync.Mutex
	for i, u := range urls {
		wg.Add(1)
		go func(i int, u string) {
			defer wg.Done()
			start := time.Now()
			req, err := http.NewRequest("HEAD", u, nil)
			if err != nil {
				mu.Lock()
				out[i] = rankedSource{url: u, failed: true}
				mu.Unlock()
				return
			}
			req.Header.Set("User-Agent", "inkstone-updater")
			resp, err := client.Do(req)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				out[i] = rankedSource{url: u, failed: true}
				return
			}
			resp.Body.Close()
			// 405（不允许 HEAD）也视为源可用
			if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusMethodNotAllowed {
				out[i] = rankedSource{url: u, failed: true}
				return
			}
			out[i] = rankedSource{url: u, latency: time.Since(start)}
		}(i, u)
	}
	wg.Wait()
	// 稳定排序：可用（未失败）按延迟升序，失败源按原顺序排最后
	for i := 1; i < len(out); i++ {
		for j := i; j > 0; j-- {
			a, b := out[j-1], out[j]
			if b.failed {
				break
			}
			if a.failed || b.latency < a.latency {
				out[j-1], out[j] = b, a
				continue
			}
			break
		}
	}
	return out
}

// assetCandidates 生成镜像包下载候选地址（直连 + 加速源）。
func (s *UpdateService) assetCandidates(direct string) []string {
	urls := []string{direct}
	for _, m := range s.mirrorURLs() {
		urls = append(urls, joinMirror(m, direct))
	}
	return urls
}

// downloadAsset 下载镜像包：先对候选源测速排序，再顺序尝试，失败自动切换下一个。
// onProgress 接收 0-100 的整数进度。
func (s *UpdateService) downloadAsset(asset ManifestAsset, onProgress func(int)) (path, mirror, sha string, err error) {
	if asset.Size > maxAssetSize {
		return "", "", "", fmt.Errorf("镜像包超过 2GB 上限，拒绝下载")
	}
	if err := os.MkdirAll(updateTempDir, 0o755); err != nil {
		return "", "", "", fmt.Errorf("创建临时目录失败：%v", err)
	}
	dest := filepath.Join(updateTempDir, asset.Name)

	ranked := rankSources(s.assetCandidates(asset.URL), probeTimeout)
	// 即使全部探测失败也尝试一遍（有些源禁 HEAD）
	var lastErr error
	tried := 0
	for _, src := range ranked {
		tried++
		sha, err = downloadFile(src.url, dest, asset.Size, onProgress)
		if err == nil {
			return dest, src.url, sha, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("没有可用的下载源")
	}
	_ = os.Remove(dest)
	return "", "", "", lastErr
}

// downloadFile 流式下载单个 URL，边下边算 SHA256 并回调进度。
// 支持断点续传：dest 已有内容时带 Range 头续拉，失败换源也不必从头再下。
func downloadFile(url, dest string, total int64, onProgress func(int)) (sha string, err error) {
	client := &http.Client{
		Transport: &http.Transport{
			DialContext:           (&net.Dialer{Timeout: 15 * time.Second}).DialContext,
			TLSHandshakeTimeout:   15 * time.Second,
			ResponseHeaderTimeout: 60 * time.Second, // 首包 60s 内必须到，防永久挂起
			IdleConnTimeout:       90 * time.Second,
			MaxIdleConns:          4,
		},
	}

	hasher := sha256.New()
	counter := &progressWriter{total: total, onProgress: onProgress}

	// 已下载字节（断点续传起点）
	var resumeFrom int64
	if st, statErr := os.Stat(dest); statErr == nil && st.Size() > 0 {
		resumeFrom = st.Size()
	}

	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if resumeFrom > 0 {
		// 先尝试 Range 续传；服务端不支持则从头重下
		resp, reqErr := doDownload(client, url, total, resumeFrom)
		if reqErr != nil {
			return "", reqErr
		}
		if resp.StatusCode == http.StatusPartialContent {
			// 旧内容喂给 hasher，保证最终 SHA256 覆盖全文件
			if old, openErr := os.Open(dest); openErr == nil {
				io.Copy(hasher, old)
				old.Close()
			}
			if _, err := f.Seek(resumeFrom, io.SeekStart); err != nil {
				resp.Body.Close()
				return "", err
			}
			sha, err = pump(resp.Body, f, hasher, counter, total, resumeFrom)
			resp.Body.Close()
			return sha, err
		}
		// 服务端忽略了 Range（返回 200）：丢弃连接，从头下载
		resp.Body.Close()
		if err := f.Truncate(0); err != nil {
			return "", err
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return "", err
		}
		hasher.Reset()
		counter.written = 0
		counter.lastPct = 0
	}

	resp, err := doDownload(client, url, total, 0)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	sha, err = pump(resp.Body, f, hasher, counter, total, 0)
	return sha, err
}

// doDownload 发起下载请求（resumeFrom>0 时带 Range 头）。
func doDownload(client *http.Client, url string, total, resumeFrom int64) (*http.Response, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "inkstone-updater")
	if resumeFrom > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", resumeFrom))
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		resp.Body.Close()
		return nil, fmt.Errorf("下载返回 %d", resp.StatusCode)
	}
	if total > 0 {
		want := total
		if resp.StatusCode == http.StatusPartialContent {
			want = total - resumeFrom
		}
		if resp.ContentLength > 0 && resp.ContentLength != want {
			resp.Body.Close()
			return nil, fmt.Errorf("文件大小与清单不符")
		}
	}
	return resp, nil
}

// pump 大 buffer 拷贝并同步算哈希/进度（512KB buffer 降低 syscall 次数）。
func pump(src io.Reader, dst io.Writer, hasher hash.Hash, counter *progressWriter, total, base int64) (string, error) {
	counter.total = total
	counter.base = base
	if _, err := io.CopyBuffer(io.MultiWriter(dst, hasher, counter), src, make([]byte, downloadBufferSize)); err != nil {
		return "", err
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// progressWriter 按比例回调下载进度（节流到每 1% 一次）。
type progressWriter struct {
	total      int64
	written    int64
	base       int64 // 续传时的已下载基数
	lastPct    int
	onProgress func(int)
}

func (w *progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	w.written += int64(n)
	if w.onProgress != nil && w.total > 0 {
		pct := int((w.base + w.written) * 100 / w.total)
		if pct > w.lastPct {
			w.lastPct = pct
			w.onProgress(pct)
		}
	}
	return n, nil
}

// ---------- 更新主流程 ----------

// CheckNow 立即检查远端版本（绕过缓存）。
func (s *UpdateService) CheckNow() (*RemoteVersion, error) {
	m, from, err := s.fetchRemote(true)
	if err != nil {
		return nil, err
	}
	rv := manifestToRemote(m, from)
	return rv, nil
}

// StartUpdate 启动一次更新（异步执行，立即返回）。
// triggeredBy: auto（调度）/ manual（管理员手动）。
func (s *UpdateService) StartUpdate(triggeredBy string) error {
	if _, busy := s.repo.FindRunning(); busy {
		return NewValidationError("已有更新任务正在进行，请稍候")
	}
	if err := s.docker.Available(); err != nil {
		return NewValidationError("Docker 环境不可用：" + err.Error())
	}
	m, from, err := s.fetchRemote(true)
	if err != nil {
		return NewValidationError("检查更新失败：" + err.Error())
	}
	if compareVersion(m.Version, AppVersion) <= 0 {
		return NewValidationError("当前已是最新版本")
	}
	if m.MinVersion != "" && compareVersion(AppVersion, m.MinVersion) < 0 {
		return NewValidationError("当前版本过低，无法自动更新到 " + m.Version + "，请手动部署")
	}
	return s.beginUpdate(m, from, triggeredBy)
}

// beginUpdate 创建更新记录并异步执行（调用方需已完成版本校验）。
func (s *UpdateService) beginUpdate(m *UpdateManifest, from, triggeredBy string) error {
	if !s.tryBeginUpdate() {
		return NewValidationError("已有更新任务正在进行，请稍候")
	}
	now := time.Now()
	rec := &model.UpdateRecord{
		Type:        model.UpdateTypeUpdate,
		FromVersion: AppVersion,
		ToVersion:   m.Version,
		Status:      model.UpdateStatusRunning,
		Phase:       model.UpdatePhaseChecking,
		Mirror:      from,
		TriggeredBy: triggeredBy,
		StartedAt:   now,
	}
	if err := s.repo.Create(rec); err != nil {
		s.endUpdate()
		return err
	}
	go s.performUpdate(rec, m, from)
	return nil
}

// tryBeginUpdate 进程内互斥：同一时刻只允许一个更新/回滚任务。
func (s *UpdateService) tryBeginUpdate() bool {
	s.updateMu.Lock()
	defer s.updateMu.Unlock()
	if s.updating {
		return false
	}
	s.updating = true
	return true
}

func (s *UpdateService) endUpdate() {
	s.updateMu.Lock()
	s.updating = false
	s.updateMu.Unlock()
}

// performUpdate 完整更新流程：下载 → 校验 → 加载 → 防呆比对 → 打回滚 tag → agent 接管部署。
func (s *UpdateService) performUpdate(rec *model.UpdateRecord, m *UpdateManifest, mirror string) {
	defer func() {
		s.endUpdate()
		if r := recover(); r != nil {
			s.failRecord(rec, fmt.Sprintf("更新过程异常：%v", r))
		}
	}()

	// 1. 下载镜像包（加速源自动选择）
	rec.Phase = model.UpdatePhaseDownloading
	s.saveRecord(rec)
	path, usedMirror, sha, err := s.downloadAsset(m.Asset, func(pct int) {
		if pct%5 == 0 || pct == 100 {
			rec.Progress = pct
			s.saveRecord(rec)
		}
	})
	if err != nil {
		s.failRecord(rec, "下载镜像包失败："+err.Error())
		return
	}
	defer os.Remove(path)
	rec.Mirror = usedMirror
	rec.SHA256 = sha

	// 2. 完整性校验
	rec.Phase = model.UpdatePhaseVerifying
	s.saveRecord(rec)
	if expected := strings.ToLower(strings.TrimSpace(m.Asset.SHA256)); expected != "" && sha != expected {
		s.failRecord(rec, "镜像包校验失败（SHA256 不匹配），已终止更新")
		return
	}

	// 3. 记录旧镜像 ID（防假更新 + 打回滚 tag 用）
	rec.Phase = model.UpdatePhaseLoading
	s.saveRecord(rec)
	oldIDs := map[string]string{}
	for _, img := range m.Images {
		if id, err := s.docker.ImageID(img.imageRef()); err == nil {
			oldIDs[img.Repo] = id
		}
	}
	if err := s.docker.LoadImage(path, func(log string) {
		_ = log
	}); err != nil {
		s.failRecord(rec, "加载镜像失败："+err.Error())
		return
	}

	// 4. 防呆：镜像 ID 必须发生变化
	for _, img := range m.Images {
		newID, err := s.docker.ImageID(img.imageRef())
		if err != nil {
			s.failRecord(rec, "校验新镜像失败："+err.Error())
			return
		}
		if newID == "" {
			s.failRecord(rec, "镜像包中未找到 "+img.imageRef()+"，请检查版本清单")
			return
		}
		if oldIDs[img.Repo] != "" && newID == oldIDs[img.Repo] {
			s.failRecord(rec, "新镜像与当前运行镜像一致（疑似假更新），已终止")
			return
		}
	}

	// 5. 打回滚 tag：把「旧镜像」按 ID tag 成 rollback-<recordID>
	rollbackTag := fmt.Sprintf("rollback-%d", rec.ID)
	tagged := 0
	for _, img := range m.Images {
		if oldID := oldIDs[img.Repo]; oldID != "" {
			if err := s.docker.TagImage(oldID, img.Repo, rollbackTag); err == nil {
				tagged++
			}
		}
	}
	if tagged == 0 {
		rec.Detail = "本地未找到旧镜像，本次更新不可回滚"
	} else {
		rec.RollbackTag = rollbackTag
	}

	// 6. 派发一次性更新代理（agent），由它完成容器替换/健康检查/失败回滚。
	//    agent 使用「当前运行镜像」创建，命令由 daemon 守护，backend 停掉后仍能执行。
	if err := s.spawnAgent(rec, m, "deploy"); err != nil {
		s.failRecord(rec, "启动更新代理失败："+err.Error())
		return
	}

	// 7. 交接：记录部署中状态，随后停止自身容器，由 agent 拉起着新版本容器。
	rec.Phase = model.UpdatePhaseDeploying
	rec.Progress = 100
	rec.Detail = "更新代理已接管，正在替换容器并重启服务…"
	s.saveRecord(rec)

	// 停止自身（30 秒优雅退出）。返回前进程可能已被终止，属预期行为。
	_ = s.docker.StopContainer(s.docker.SelfContainerID(), 30)
}

// saveRecord 静默保存记录（更新失败不阻断主流程）。
func (s *UpdateService) saveRecord(rec *model.UpdateRecord) {
	if err := s.repo.Update(rec); err != nil {
		fmt.Printf("[update] 保存记录失败：%v\n", err)
	}
}

// failRecord 标记记录失败并写原因。
func (s *UpdateService) failRecord(rec *model.UpdateRecord, detail string) {
	now := time.Now()
	rec.Status = model.UpdateStatusFailed
	rec.Phase = model.UpdatePhaseDone
	rec.Detail = detail
	rec.FinishedAt = &now
	s.saveRecord(rec)
}

// ---------- 回滚 ----------

// StartRollback 回滚到上一次更新前的版本（异步，agent 接管）。
func (s *UpdateService) StartRollback() error {
	if !s.tryBeginUpdate() {
		return NewValidationError("已有更新任务正在进行，请稍候")
	}
	fail := func(err error) error {
		s.endUpdate()
		return err
	}
	if _, busy := s.repo.FindRunning(); busy {
		return fail(NewValidationError("已有更新任务正在进行，请稍候"))
	}
	if err := s.docker.Available(); err != nil {
		return fail(NewValidationError("Docker 环境不可用：" + err.Error()))
	}
	target, err := s.repo.LatestRollbackable()
	if err != nil || target.RollbackTag == "" {
		return fail(NewValidationError("没有可回滚的版本"))
	}
	now := time.Now()
	rec := &model.UpdateRecord{
		Type:        model.UpdateTypeRollback,
		FromVersion: AppVersion,
		ToVersion:   target.ToVersion,
		Status:      model.UpdateStatusRunning,
		Phase:       model.UpdatePhaseDeploying,
		TriggeredBy: "rollback",
		RollbackTag: target.RollbackTag,
		Detail:      "正在回滚到 " + target.ToVersion,
		StartedAt:   now,
	}
	if err := s.repo.Create(rec); err != nil {
		return fail(err)
	}
	if err := s.spawnAgent(rec, nil, "rollback"); err != nil {
		s.failRecord(rec, "启动回滚代理失败："+err.Error())
		s.endUpdate()
		return err
	}
	rec.Detail = "回滚代理已接管，正在替换容器…"
	s.saveRecord(rec)
	// 停止自身，agent 完成容器替换后拉起着旧版本容器
	_ = s.docker.StopContainer(s.docker.SelfContainerID(), 30)
	// 注意：此处不释放 updating——进程即将被 agent 重建
	return nil
}

// RecoverInterruptedUpdate 实例重启自检：上次更新若非正常结束（留下 running 记录），
// 自动回滚到旧镜像，避免坏版本常驻。启动 30 秒后调用一次。
func (s *UpdateService) RecoverInterruptedUpdate() {
	// 3 分钟窗口：正常部署（agent 收尾）远快于此；超过即视为 goroutine 已死
	rec, ok := s.repo.FindInterrupted(time.Now().Add(-3 * time.Minute))
	if !ok {
		return
	}
	if err := s.docker.Available(); err != nil {
		// Docker 不可用（如本地开发未挂 socket）：无法回滚，仅标记失败释放状态
		s.failRecord(rec, "更新中断且 Docker 环境不可用（"+err.Error()+"），已标记失败，请手动检查")
		return
	}
	if rec.Type == model.UpdateTypeRollback {
		// 回滚本身被中断：标记失败即可（此时运行的已是回滚后镜像）
		s.failRecord(rec, "回滚过程中实例重启，请检查当前运行版本")
		return
	}
	// 更新部署被中断：自动回滚
	if rec.RollbackTag == "" {
		s.failRecord(rec, "更新部署过程中实例重启（未打回滚 tag，已保持当前版本，请手动检查）")
		return
	}
	fmt.Printf("[update] 检测到中断的更新（#%d → %s），自动回滚\n", rec.ID, rec.ToVersion)
	s.agentRollback(rec, "更新部署过程中实例重启，已自动回滚", nil, "")
}

// ---------- 版本号比较 ----------

// compareVersion 比较版本号：>0 表示 a 更新，<0 表示 b 更新，0 表示相同。
// 提取数字段逐段比较（Beta1.14 > Beta1.9；v1.2.10 > v1.2.9）。
func compareVersion(a, b string) int {
	na, nb := versionNumbers(a), versionNumbers(b)
	n := len(na)
	if len(nb) > n {
		n = len(nb)
	}
	for i := 0; i < n; i++ {
		x, y := 0, 0
		if i < len(na) {
			x = na[i]
		}
		if i < len(nb) {
			y = nb[i]
		}
		if x != y {
			if x > y {
				return 1
			}
			return -1
		}
	}
	return 0
}

// versionNumbers 提取版本号中的全部数字段。
func versionNumbers(v string) []int {
	var out []int
	cur := 0
	inNum := false
	for _, ch := range v {
		if ch >= '0' && ch <= '9' {
			cur = cur*10 + int(ch-'0')
			inNum = true
			continue
		}
		if inNum {
			out = append(out, cur)
			cur, inNum = 0, false
		}
	}
	if inNum {
		out = append(out, cur)
	}
	return out
}
