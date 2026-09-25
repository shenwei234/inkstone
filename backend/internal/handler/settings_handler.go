package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
	"github.com/shenwei/inkstone/backend/pkg/mailer"
)

type SettingsHandler struct {
	settings  *service.SettingsService
	mailer    *mailer.Mailer
	emailCode *service.EmailCodeService
}

func NewSettingsHandler(settings *service.SettingsService, mailClient *mailer.Mailer, emailCode *service.EmailCodeService) *SettingsHandler {
	return &SettingsHandler{settings: settings, mailer: mailClient, emailCode: emailCode}
}

// Get handles GET /admin/settings.
func (h *SettingsHandler) Get(c *gin.Context) {
	out, err := h.settings.AdminView()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"settings": out})
}

type updateSettingsRequest struct {
	Settings map[string]any `json:"settings" binding:"required"`
}

// Update handles PUT /admin/settings with a JSON object of key/value pairs.
func (h *SettingsHandler) Update(c *gin.Context) {
	var wrapper struct {
		Settings map[string]any `json:"settings" binding:"required"`
	}
	if err := c.ShouldBindJSON(&wrapper); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}
	if err := h.settings.Update(wrapper.Settings); err != nil {
		errorResponse(c, err)
		return
	}
	out, err := h.settings.AdminView()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"settings": out})
}

// SiteConfig handles GET /api/v1/site-config — non-sensitive settings for
// the frontend (registration switch, site name, etc).
func (h *SettingsHandler) SiteConfig(c *gin.Context) {
	out, err := h.settings.Public()
	if err != nil {
		errorResponse(c, err)
		return
	}
	if h.emailCode != nil {
		out["email_code"] = h.emailCode.PublicConfig()
	}
	c.JSON(http.StatusOK, out)
}

type testMailRequest struct {
	To string `json:"to" binding:"required"`
}

// TestMail handles POST /admin/settings/test-mail.
func (h *SettingsHandler) TestMail(c *gin.Context) {
	var req testMailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写收件邮箱"})
		return
	}
	err := h.mailer.Send(req.To, "InkStone 测试邮件", "这是一封测试邮件，收到即说明 SMTP 配置成功。")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "测试邮件已发送，请查收"})
}
