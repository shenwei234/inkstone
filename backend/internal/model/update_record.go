package model

import "time"

// 系统更新记录：一次「检查 → 下载 → 校验 → 加载 → 部署」的完整生命周期。
// running 状态的记录若因部署中断残留（容器被杀），实例重启后会自动回滚并标记失败。
const (
	// UpdateTypeUpdate 正常版本更新；UpdateTypeRollback 回滚到上一版本
	UpdateTypeUpdate   = "update"
	UpdateTypeRollback = "rollback"

	// UpdateStatusRunning 进行中；UpdateStatusSuccess 成功；UpdateStatusFailed 失败
	UpdateStatusRunning = "running"
	UpdateStatusSuccess = "success"
	UpdateStatusFailed  = "failed"

	// UpdatePhaseXxx 更新阶段，前端按阶段展示进度
	UpdatePhaseChecking    = "checking"
	UpdatePhaseDownloading = "downloading"
	UpdatePhaseVerifying   = "verifying"
	UpdatePhaseLoading     = "loading"
	UpdatePhaseDeploying   = "deploying"
	UpdatePhaseDone        = "done"
)

// TriggeredBy 取值：auto（调度自动）/ manual（管理员手动）/ rollback
type UpdateRecord struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	Type        string     `gorm:"size:16;index" json:"type"` // update / rollback
	FromVersion string     `gorm:"size:32" json:"from_version"`
	ToVersion   string     `gorm:"size:32" json:"to_version"`
	Status      string     `gorm:"size:16;index" json:"status"` // running / success / failed
	Phase       string     `gorm:"size:32" json:"phase"`        // checking/downloading/verifying/loading/deploying
	Progress    int        `gorm:"default:0" json:"progress"`   // 下载进度 0-100
	Mirror      string     `gorm:"size:128" json:"mirror"`      // 实际使用的加速源
	SHA256      string     `gorm:"size:64" json:"sha256"`       // 镜像包校验值
	RollbackTag string     `gorm:"size:64" json:"rollback_tag"` // 回滚镜像 tag（两个镜像同名后缀）
	TriggeredBy string     `gorm:"size:16" json:"triggered_by"` // auto / manual / rollback
	Detail      string     `gorm:"size:1000" json:"detail"`     // 过程说明或错误原因（中文）
	StartedAt   time.Time  `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
