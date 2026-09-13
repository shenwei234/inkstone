package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type CaptchaHandler struct {
	captcha *service.CaptchaService
}

func NewCaptchaHandler(captcha *service.CaptchaService) *CaptchaHandler {
	return &CaptchaHandler{captcha: captcha}
}

// Challenge handles GET /captcha/challenge — issues a signed arithmetic
// challenge. It is the primary widget for the built-in provider, and also
// serves as the graceful fallback when an external provider (GeeTest)
// fails to load in the visitor's browser.
func (h *CaptchaHandler) Challenge(c *gin.Context) {
	provider := h.captcha.Provider()
	if provider == service.CaptchaProviderNone {
		c.JSON(http.StatusOK, gin.H{"provider": provider, "enabled": false})
		return
	}
	question, token, err := h.captcha.NewChallenge()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"provider": service.CaptchaProviderBuiltin,
		"enabled":  true,
		"fallback": provider != service.CaptchaProviderBuiltin,
		"question": question,
		"token":    token,
	})
}
