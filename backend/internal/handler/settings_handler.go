package handler

import (
	"net/http"

	"github.com/blog-platform/backend/internal/service"
	"github.com/blog-platform/backend/pkg/mailer"
	"github.com/gin-gonic/gin"
)

type SettingsHandler struct {
	settings *service.SettingsService
	mailer   *mailer.Mailer
}

func NewSettingsHandler(settings *service.SettingsService, mailer *mailer.Mailer) *SettingsHandler {
	return &SettingsHandler{settings: settings, mailer: mailer}
}

// SiteConfig handles GET /api/v1/site-config — non-sensitive settings for
// the frontend (registration switch, site name, etc).
func (h *SettingsHandler) SiteConfig(c *gin.Context) {
	out, err := h.settings.Public()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// Get handles GET /admin/settings.
func (h *SettingsHandler) Get(c *gin.Context) {
	out, err := h.settings.AdminView()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// Update handles PUT /admin/settings with a JSON object of key/value pairs.
func (h *SettingsHandler) Update(c *gin.Context) {
	var payload map[string]any
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}
	if err := h.settings.Update(payload); err != nil {
		errorResponse(c, err)
		return
	}
	out, err := h.settings.AdminView()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

type testMailRequest struct {
	To string `json:"to" binding:"required"`
}

// TestMail handles POST /admin/settings/test-mail — verifies SMTP settings.
func (h *SettingsHandler) TestMail(c *gin.Context) {
	var req testMailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供收件邮箱"})
		return
	}
	if err := h.mailer.Send(req.To, "Blog 平台测试邮件", "这是一封测试邮件，收到即说明 SMTP 配置正确。"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "测试邮件已发送，请查收"})
}
