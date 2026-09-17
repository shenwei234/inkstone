package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type EmailCodeHandler struct {
	codes *service.EmailCodeService
}

func NewEmailCodeHandler(codes *service.EmailCodeService) *EmailCodeHandler {
	return &EmailCodeHandler{codes: codes}
}

type sendEmailCodeRequest struct {
	Email   string `json:"email" binding:"required"`
	Purpose string `json:"purpose"` // register | login
}

// Send handles POST /auth/email-code — emails a one-time verification code.
func (h *EmailCodeHandler) Send(c *gin.Context) {
	var req sendEmailCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写邮箱"})
		return
	}
	purpose := req.Purpose
	if purpose != "login" {
		purpose = "register"
	}
	if !h.codes.Required(purpose) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前未开启邮箱验证码"})
		return
	}
	if err := h.codes.Send(req.Email, purpose); err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "验证码已发送，请查收邮件"})
}
