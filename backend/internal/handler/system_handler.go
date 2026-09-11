package handler

import (
	"net/http"

	"github.com/blog-platform/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type SystemHandler struct {
	settings *service.SettingsService
}

func NewSystemHandler(settings *service.SettingsService) *SystemHandler {
	return &SystemHandler{settings: settings}
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
