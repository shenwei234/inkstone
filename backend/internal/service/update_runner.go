package service

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

// 更新运行状态
type UpdatePhase string

const (
	UpdateIdle    UpdatePhase = "idle"    // 空闲，可更新
	UpdateRunning UpdatePhase = "running" // 正在执行更新脚本
	UpdateSuccess UpdatePhase = "success" // 更新成功
	UpdateFailed  UpdatePhase = "failed"  // 更新失败
)

// UpdateStatus 描述一次（或最近一次）更新的进度。
// 长连接/轮询时据此渲染进度条与日志。
type UpdateStatus struct {
	Phase        UpdatePhase `json:"phase"`
	Running      bool        `json:"running"`
	ScriptPath   string      `json:"script_path"`
	AutoRestart  bool        `json:"auto_restart"`
	ScriptExists bool        `json:"script_exists"`
	Message      string      `json:"message"`
	Logs         []string    `json:"logs"` // 最近最多 200 行
	StartedAt    string      `json:"started_at,omitempty"`
	FinishedAt   string      `json:"finished_at,omitempty"`
	ExitCode     int         `json:"exit_code"`
}

// UpdateRunner 负责「一键更新」的编排：调用服务器上预置的更新脚本并在内存中
// 跟踪状态与日志。设计上不把构建/部署逻辑写死在后端里，而是执行一个可随
// 环境定制的脚本（脚本路径通过设置项配置），这既安全又灵活：
//   - 服务器端只需放一个脚本，如 /usr/local/bin/inkstone-update.sh；
//   - 适配离线镜像部署：脚本负责 docker load 新镜像并 docker compose up -d 重启。
type UpdateRunner struct {
	settings *SettingsService

	mu       sync.Mutex
	running  bool
	phase    UpdatePhase
	logs     []string
	started  time.Time
	finished time.Time
	exitCode int
	cmd      *exec.Cmd
}

const maxUpdateLogs = 200

// UpdateScriptTemplate 是「立即更新」脚本的推荐模板，管理员可把它安装到服务器。
// 适配「离线镜像」部署：小内存服务器无需在线编译，先本地打包镜像 → 上传 tar，
// 本脚本负责加载镜像并重启服务。
const UpdateScriptTemplate = `#!/usr/bin/env bash
# InkStone 一键更新脚本（由更新后台生成，离线镜像版）
# 部署目录要改成你服务器上 docker-compose.offline.yml 所在的真实路径：
DEPLOY_DIR="/opt/inkstone"
# 镜像包路径（本机 docker save -o 后 scp 上传到 VPS 的路径）：
IMAGE_TAR="$DEPLOY_DIR/inkstone-images.tar"

set -e

echo "[1/3] 加载最新镜像..."
cd "$DEPLOY_DIR"
if [ -f "$IMAGE_TAR" ]; then
  docker load -i "$IMAGE_TAR"
else
  echo "未找到镜像包 $IMAGE_TAR，跳过后台加载（可手动 docker load）"
fi

echo "[2/3] 使用离线编排重启服务..."
# 注意：离线部署用 offline 编排（image: 引用，不做 build）
docker compose -f docker-compose.offline.yml up -d

echo "[3/3] 更新完成"
docker compose -f docker-compose.offline.yml ps backend frontend
`

func NewUpdateRunner(settings *SettingsService) *UpdateRunner {
	return &UpdateRunner{settings: settings, phase: UpdateIdle, logs: make([]string, 0, 16)}
}

func (r *UpdateRunner) scriptPath() string {
	if r.settings != nil {
		if p, _ := r.settings.Get(SettingUpdateScriptPath); p != "" {
			return p
		}
	}
	return "/usr/local/bin/inkstone-update.sh"
}

func (r *UpdateRunner) autoRestart() bool {
	if r.settings != nil {
		return r.settings.BoolValue(SettingUpdateAutoRestart, true)
	}
	return true
}

// Status 返回当前更新状态（幂等，可反复轮询）。
func (r *UpdateRunner) Status() UpdateStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	path := r.scriptPath()
	exists := fileExists(path)
	return UpdateStatus{
		Phase:        r.phase,
		Running:      r.running,
		ScriptPath:   path,
		AutoRestart:  r.autoRestart(),
		ScriptExists: exists,
		Message:      statusMessage(r.phase, exists),
		Logs:         append([]string(nil), r.logs...),
		StartedAt:    formatTime(r.started),
		FinishedAt:   formatTime(r.finished),
		ExitCode:     r.exitCode,
	}
}

// Start 触发一次更新。若当前已在更新则返回错误。运行异步执行，不阻塞请求。
// update.sh 由系统管理员预先放到服务器上（返回的模板可参考并安装）。
func (r *UpdateRunner) Start() error {
	r.mu.Lock()
	if r.running {
		r.mu.Unlock()
		return NewValidationError("已有更新正在执行，请稍候")
	}
	path := r.scriptPath()
	if !fileExists(path) {
		r.mu.Unlock()
		return NewValidationError("未检测到更新脚本：" + path + "，请先在「部署引导」安装")
	}
	r.running = true
	r.phase = UpdateRunning
	r.exitCode = 0
	r.started = time.Now()
	r.finished = time.Time{}
	r.logs = r.logs[:0]
	r.mu.Unlock()

	go r.execute(path)
	return nil
}

func (r *UpdateRunner) execute(path string) {
	logPrefix := time.Now().Format("15:04:05")
	r.appendLog(fmt.Sprintf("%s 开始执行更新脚本：%s", logPrefix, path))

	// macOS/Linux 用 bash；Windows 上若没有 bash（测试环境）会快速失败退出。
	bin := "/bin/bash"
	args := []string{path}
	if runtime.GOOS == "windows" {
		bin = "sh"
	}
	cmd := exec.Command(bin, args...)
	cmd.Env = os.Environ()
	// 容器/服务重启场景下避免子进程无限挂起：最多执行 30 分钟。
	contextTimeout := 30 * time.Minute

	r.mu.Lock()
	r.cmd = cmd
	r.mu.Unlock()

	stdout, err := cmd.StdoutPipe()
	if err == nil {
		go r.scanLines(stdout)
	} else {
		r.appendLog("无法读取脚本输出：" + err.Error())
	}
	stderr, err := cmd.StderrPipe()
	if err == nil {
		go r.scanLines(stderr)
	} else {
		r.appendLog("无法读取脚本错误输出：" + err.Error())
	}

	runErr := cmd.Start()
	if runErr == nil {
		done := make(chan struct{})
		go func() {
			runErr = cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
			// 正常结束
		case <-time.After(contextTimeout):
			_ = cmd.Process.Kill()
			<-done
			runErr = fmt.Errorf("更新脚本执行超时（%s），已强制终止", contextTimeout)
		}
	}

	r.appendLog(fmt.Sprintf("%s 更新脚本执行结束", time.Now().Format("15:04:05")))

	r.mu.Lock()
	r.running = false
	if runErr != nil {
		r.phase = UpdateFailed
		if cmd.ProcessState != nil {
			r.exitCode = cmd.ProcessState.ExitCode()
		}
	} else {
		r.phase = UpdateSuccess
	}
	r.finished = time.Now()
	r.cmd = nil
	r.mu.Unlock()

	if runErr != nil {
		r.appendLog("更新失败：" + runErr.Error())
	} else if !r.autoRestart() {
		r.appendLog("注：auto_restart 已关闭，未自动重启服务")
	}
}

func (r *UpdateRunner) scanLines(rc io.ReadCloser) {
	defer rc.Close()
	sc := bufio.NewScanner(rc)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if strings.TrimSpace(line) != "" {
			r.appendLog(line)
		}
	}
}

func (r *UpdateRunner) appendLog(line string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.logs = append(r.logs, line)
	if n := len(r.logs); n > maxUpdateLogs {
		r.logs = append([]string(nil), r.logs[n-maxUpdateLogs:]...)
	}
}

func fileExists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && !fi.IsDir()
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

func statusMessage(phase UpdatePhase, scriptExists bool) string {
	switch phase {
	case UpdateRunning:
		return "正在更新中，请勿关闭页面..."
	case UpdateSuccess:
		return "更新已完成"
	case UpdateFailed:
		return "更新失败，请查看下方日志"
	default: // idle
		if !scriptExists {
			return "尚未安装更新脚本"
		}
		return "就绪，可立即更新"
	}
}
