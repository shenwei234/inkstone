package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type SystemHandler struct {
	settings *service.SettingsService
	updates  *service.UpdateRunner
}

func NewSystemHandler(settings *service.SettingsService, updates *service.UpdateRunner) *SystemHandler {
	return &SystemHandler{settings: settings, updates: updates}
}

// Info handles GET /api/v1/system/info.
func (h *SystemHandler) Info(c *gin.Context) {
	name, err := h.settings.Get(service.SettingSiteName)
	if err != nil {
		name = "Blog 平台"
	}
	c.JSON(http.StatusOK, gin.H{"info": service.BuildSystemInfo(name)})
}

// Changelog handles GET /admin/updates — current version + changelog.
func (h *SystemHandler) Changelog(c *gin.Context) {
	manifestURL, _ := h.settings.Get(service.SettingUpdateManifest)
	c.JSON(http.StatusOK, gin.H{
		"current":      service.AppVersion,
		"changelog":    service.ChangelogList(),
		"manifest_url": manifestURL,
		"version":      service.AppVersion,
	})
}

// CheckUpdates handles POST /admin/updates/check.
func (h *SystemHandler) CheckUpdates(c *gin.Context) {
	manifestURL, _ := h.settings.Get(service.SettingUpdateManifest)
	result, err := service.CheckUpdates(manifestURL)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

type saveManifestRequest struct {
	ManifestURL string `json:"manifest_url" binding:"required"`
}

// SaveManifestURL handles PUT /admin/updates/manifest.
func (h *SystemHandler) SaveManifestURL(c *gin.Context) {
	var req saveManifestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写更新清单地址"})
		return
	}
	if err := h.settings.Update(map[string]any{
		service.SettingUpdateManifest: req.ManifestURL,
	}); err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "更新源已保存"})
}

// ———— 一键更新 ————

// UpdateStatus handles GET /admin/updates/status — current update state & live logs.
func (h *SystemHandler) UpdateStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": h.updates.Status()})
}

// ApplyUpdate handles POST /admin/updates/apply — trigger the server update script.
func (h *SystemHandler) ApplyUpdate(c *gin.Context) {
	if err := h.updates.Start(); err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": h.updates.Status(), "message": "已开始更新"})
}

// UpdateScript handles GET /admin/updates/script — the recommended script template.
func (h *SystemHandler) UpdateScript(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"script": service.UpdateScriptTemplate,
		"path":   h.updates.Status().ScriptPath,
	})
}

type saveUpdateConfigRequest struct {
	ScriptPath  string `json:"script_path"`
	AutoRestart *bool  `json:"auto_restart"`
}

// SaveUpdateConfig handles PUT /admin/updates/config — script path & auto-restart toggle.
func (h *SystemHandler) SaveUpdateConfig(c *gin.Context) {
	var req saveUpdateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}
	payload := map[string]any{}
	if req.ScriptPath != "" {
		payload[service.SettingUpdateScriptPath] = req.ScriptPath
	}
	if req.AutoRestart != nil {
		val := "false"
		if *req.AutoRestart {
			val = "true"
		}
		payload[service.SettingUpdateAutoRestart] = val
	}
	if len(payload) > 0 {
		if err := h.settings.Update(payload); err != nil {
			errorResponse(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": h.updates.Status(), "message": "更新配置已保存"})
}
