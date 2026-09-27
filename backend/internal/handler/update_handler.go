package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type UpdateHandler struct {
	updates *service.UpdateService
	logs    *service.LogService
}

func NewUpdateHandler(updates *service.UpdateService, logs *service.LogService) *UpdateHandler {
	return &UpdateHandler{updates: updates, logs: logs}
}

// Status handles GET /admin/updates/status — 更新后台首页状态。
func (h *UpdateHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"update": h.updates.State()})
}

// Check handles POST /admin/updates/check — 立即检查远端版本。
func (h *UpdateHandler) Check(c *gin.Context) {
	rv, err := h.updates.CheckNow()
	if err != nil {
		recordOp(h.logs, c, "system", "检查更新", "失败："+err.Error(), false)
		errorResponse(c, err)
		return
	}
	detail := "当前已是最新版本"
	if rv.Version != service.AppVersion {
		detail = "发现新版本 " + rv.Version
	}
	recordOp(h.logs, c, "system", "检查更新", detail, true)
	c.JSON(http.StatusOK, gin.H{"remote": rv})
}

// Run handles POST /admin/updates/run — 立即执行更新（异步，进度经 status 轮询）。
func (h *UpdateHandler) Run(c *gin.Context) {
	if err := h.updates.StartUpdate("manual"); err != nil {
		recordOp(h.logs, c, "system", "系统更新", "启动失败："+err.Error(), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, "system", "系统更新", "管理员触发更新", true)
	c.JSON(http.StatusAccepted, gin.H{"message": "更新已启动"})
}

// Rollback handles POST /admin/updates/rollback — 回滚到上一次更新前的版本。
func (h *UpdateHandler) Rollback(c *gin.Context) {
	if err := h.updates.StartRollback(); err != nil {
		recordOp(h.logs, c, "system", "系统回滚", "启动失败："+err.Error(), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, "system", "系统回滚", "管理员触发回滚", true)
	c.JSON(http.StatusAccepted, gin.H{"message": "回滚已启动"})
}

// MirrorTest handles POST /admin/updates/mirror-test — 并发探测加速源延迟。
func (h *UpdateHandler) MirrorTest(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"mirrors": h.updates.TestMirrors()})
}

// UpdateSettings handles PUT /admin/updates/settings — 保存更新设置。
func (h *UpdateHandler) UpdateSettings(c *gin.Context) {
	var req struct {
		AutoUpdate   *bool    `json:"auto_update"`
		IntervalMins *int     `json:"interval_mins"`
		Repo         *string  `json:"repo"`
		Mirrors      []string `json:"mirrors"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	payload := map[string]any{}
	if req.AutoUpdate != nil {
		payload[service.SettingUpdateEnabled] = *req.AutoUpdate
	}
	if req.IntervalMins != nil {
		payload[service.SettingUpdateCheckInterval] = *req.IntervalMins
	}
	if req.Repo != nil {
		payload[service.SettingUpdateRepo] = *req.Repo
	}
	if req.Mirrors != nil {
		payload[service.SettingUpdateMirrorURLs] = req.Mirrors
	}
	if len(payload) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有需要保存的设置"})
		return
	}
	if err := h.updates.ApplySettings(payload); err != nil {
		recordOp(h.logs, c, "system", "更新设置", "保存失败", false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, "system", "更新设置", "更新系统设置", true)
	c.JSON(http.StatusOK, gin.H{"message": "设置已保存"})
}
