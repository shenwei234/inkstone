package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/middleware"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type AuthHandler struct {
	auth      *service.AuthService
	captcha   *service.CaptchaService
	emailCode *service.EmailCodeService
	limiter   *middleware.SlidingLimiter
}

func NewAuthHandler(auth *service.AuthService, captcha *service.CaptchaService, emailCode *service.EmailCodeService, limiter *middleware.SlidingLimiter) *AuthHandler {
	return &AuthHandler{auth: auth, captcha: captcha, emailCode: emailCode, limiter: limiter}
}

// resetAuthLimit clears the rate-limit budget for the caller after a
// successful authentication so normal usage (log in / out repeatedly,
// multiple tabs) is never throttled.
func (h *AuthHandler) resetAuthLimit(c *gin.Context) {
	if h.limiter == nil {
		return
	}
	if key := middleware.RateKey(c); key != "" {
		h.limiter.Reset(key)
	}
}

type registerRequest struct {
	Email         string `json:"email" binding:"required"`
	Username      string `json:"username" binding:"required"`
	Password      string `json:"password" binding:"required"`
	CaptchaToken  string `json:"captcha_token"`
	CaptchaAnswer string `json:"captcha_answer"`
	EmailCode     string `json:"email_code"`
}

type loginRequest struct {
	Email         string `json:"email" binding:"required"`
	Password      string `json:"password" binding:"required"`
	CaptchaToken  string `json:"captcha_token"`
	CaptchaAnswer string `json:"captcha_answer"`
	EmailCode     string `json:"email_code"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type userResponse struct {
	ID       uint   `json:"id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整的注册信息"})
		return
	}

	if err := h.emailCode.Verify(req.Email, req.EmailCode); err != nil {
		errorResponse(c, err)
		return
	}
	if err := h.captcha.Verify(service.CaptchaActionRegister, req.CaptchaToken, req.CaptchaAnswer, middleware.ClientIP(c)); err != nil {
		errorResponse(c, err)
		return
	}

	user, pair, err := h.auth.Register(service.RegisterInput{
		Email:    req.Email,
		Username: req.Username,
		Password: req.Password,
	})
	if err != nil {
		errorResponse(c, err)
		return
	}

	// 注册成功：清空该 IP 的计数，避免共享出口 IP 被误伤
	h.resetAuthLimit(c)

	c.JSON(http.StatusCreated, gin.H{
		"user":  toUserResponse(user),
		"token": pair,
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写邮箱和密码"})
		return
	}

	if err := h.emailCode.Verify(req.Email, req.EmailCode); err != nil {
		errorResponse(c, err)
		return
	}
	if err := h.captcha.Verify(service.CaptchaActionLogin, req.CaptchaToken, req.CaptchaAnswer, middleware.ClientIP(c)); err != nil {
		errorResponse(c, err)
		return
	}

	user, pair, err := h.auth.Login(req.Email, req.Password)
	if err != nil {
		errorResponse(c, err)
		return
	}

	// 登录成功：清空该 IP 的失败计数，避免正常用户被限流锁死
	h.resetAuthLimit(c)

	c.JSON(http.StatusOK, gin.H{
		"user":  toUserResponse(user),
		"token": pair,
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 refresh_token"})
		return
	}

	user, pair, err := h.auth.Refresh(req.RefreshToken)
	if err != nil {
		errorResponse(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user":  toUserResponse(user),
		"token": pair,
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	user, err := h.auth.GetUserByID(current.ID)
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": toUserResponse(user)})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}

// ChangePassword handles PUT /auth/password.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写当前密码和新密码"})
		return
	}
	if err := h.auth.ChangePassword(current.ID, req.CurrentPassword, req.NewPassword); err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已更新"})
}

type updateProfileRequest struct {
	Username string `json:"username" binding:"required"`
}

// UpdateProfile handles PUT /auth/profile.
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写用户名"})
		return
	}
	if err := h.auth.UpdateUsername(current.ID, req.Username); err != nil {
		errorResponse(c, err)
		return
	}
	user, err := h.auth.GetUserByID(current.ID)
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": toUserResponse(user)})
}

func toUserResponse(u *model.User) gin.H {
	return gin.H{
		"id":       u.ID,
		"email":    u.Email,
		"username": u.Username,
		"role":     u.Role,
	}
}
