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
// challenge when the built-in provider is active.
func (h *CaptchaHandler) Challenge(c *gin.Context) {
	if h.captcha.Provider() != service.CaptchaProviderBuiltin {
		c.JSON(http.StatusOK, gin.H{"provider": h.captcha.Provider(), "enabled": false})
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
		"question": question,
		"token":    token,
	})
}
