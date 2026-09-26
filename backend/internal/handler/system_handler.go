package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type SystemHandler struct {
	settings *service.SettingsService
	updates  *service.UpdateAgent
	logs     *service.LogService
}

func NewSystemHandler(settings *service.SettingsService, updates *service.UpdateAgent, logs *service.LogService) *SystemHandler {
	return &SystemHandler{settings: settings, updates: updates, logs: logs}
}

// Info handles GET /api/v1/system/info.
func (h *SystemHandler) Info(c *gin.Context) {
	name, err := h.settings.Get(service.SettingSiteName)
	if err != nil {
		name = "Blog 平台"
	}
	c.JSON(http.StatusOK, gin.H{"info": service.BuildSystemInfo(name)})
}

// Changelog handles GET /admin/updates — current version + changelog + push config & status.
func (h *SystemHandler) Changelog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"current":   service.AppVersion,
		"changelog": service.ChangelogList(),
		"version":   service.AppVersion,
		"config":    h.updates.Config(),
		"status":    h.updates.Status(),
	})
}

// UpdateStatus handles GET /admin/updates/status — current update state & live logs.
func (h *SystemHandler) UpdateStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": h.updates.Status()})
}

type saveUpdateConfigRequest struct {
	ServerURL   string `json:"server_url"`
	Token       string `json:"token"`
	Auto        bool   `json:"auto"`
	RepoDir     string `json:"repo_dir"`
	ComposeFile string `json:"compose_file"`
	MirrorURLs  string `json:"mirror_urls"`
}

// SaveUpdateConfig handles PUT /admin/updates/config — push server URL/token/paths.
func (h *SystemHandler) SaveUpdateConfig(c *gin.Context) {
	var req saveUpdateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}
	if err := h.updates.SaveConfig(service.UpdateConfigInput{
		ServerURL:   req.ServerURL,
		Token:       req.Token,
		Auto:        req.Auto,
		RepoDir:     req.RepoDir,
		ComposeFile: req.ComposeFile,
		MirrorURLs:  req.MirrorURLs,
	}); err != nil {
		recordOp(h.logs, c, model.LogCategorySystem, "保存更新配置", "服务地址 "+req.ServerURL, false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategorySystem, "保存更新配置",
		fmt.Sprintf("服务地址 %s（自动更新：%t）", req.ServerURL, req.Auto), true)
	c.JSON(http.StatusOK, gin.H{"config": h.updates.Config(), "message": "更新配置已保存"})
}

// CheckUpdates handles POST /admin/updates/check — poll the push server once.
func (h *SystemHandler) CheckUpdates(c *gin.Context) {
	if h.updates.Status().Running {
		c.JSON(http.StatusConflict, gin.H{"error": "正在更新中，请稍候"})
		return
	}
	task, err := h.updates.CheckOnce()
	if err != nil {
		errorResponse(c, err)
		return
	}
	if task == nil {
		c.JSON(http.StatusOK, gin.H{"task": nil, "message": "当前已是最新版本"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"task": task, "message": "发现新版本 " + task.Version + "，可执行更新"})
}

// ApplyUpdate handles POST /admin/updates/apply — poll and run the update task.
func (h *SystemHandler) ApplyUpdate(c *gin.Context) {
	if h.updates.Status().Running {
		c.JSON(http.StatusConflict, gin.H{"error": "已有更新正在执行，请稍候"})
		return
	}
	if err := h.updates.ApplyNow(); err != nil {
		recordOp(h.logs, c, model.LogCategorySystem, "执行系统更新", err.Error(), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategorySystem, "执行系统更新", "已开始拉取镜像并替换部署", true)
	c.JSON(http.StatusOK, gin.H{"status": h.updates.Status(), "message": "已开始更新"})
}
