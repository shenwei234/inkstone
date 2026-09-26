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
	emailCode *service.EmailCodeService
	geetest   *service.GeetestService
	limiter   *middleware.SlidingLimiter
	logs      *service.LogService
}

func NewAuthHandler(auth *service.AuthService, emailCode *service.EmailCodeService, geetest *service.GeetestService, limiter *middleware.SlidingLimiter, logs *service.LogService) *AuthHandler {
	return &AuthHandler{auth: auth, emailCode: emailCode, geetest: geetest, limiter: limiter, logs: logs}
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
	Email     string `json:"email" binding:"required"`
	Username  string `json:"username" binding:"required"`
	Password  string `json:"password" binding:"required"`
	EmailCode string `json:"email_code"`
	service.GeetestParams
}

type loginRequest struct {
	Email     string `json:"email" binding:"required"`
	Password  string `json:"password" binding:"required"`
	EmailCode string `json:"email_code"`
	service.GeetestParams
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

	if err := h.geetest.Verify("register", req.GeetestParams); err != nil {
		errorResponse(c, err)
		return
	}

	if err := h.emailCode.Verify("register", req.Email, req.EmailCode); err != nil {
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

	h.logs.Record(service.Entry{
		UserID:    user.ID,
		Username:  user.Username,
		Category:  model.LogCategoryAuth,
		Action:    "新用户注册",
		Detail:    req.Email,
		IP:        middleware.ClientIP(c),
		UserAgent: c.Request.UserAgent(),
		Success:   true,
	})

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

	if err := h.geetest.Verify("login", req.GeetestParams); err != nil {
		errorResponse(c, err)
		return
	}

	if err := h.emailCode.Verify("login", req.Email, req.EmailCode); err != nil {
		errorResponse(c, err)
		return
	}

	user, pair, err := h.auth.Login(req.Email, req.Password)
	if err != nil {
		h.logs.Record(service.Entry{
			Category:  model.LogCategoryAuth,
			Action:    "登录失败",
			Detail:    req.Email,
			IP:        middleware.ClientIP(c),
			UserAgent: c.Request.UserAgent(),
			Success:   false,
		})
		errorResponse(c, err)
		return
	}

	// 登录成功：清空该 IP 的失败计数，避免正常用户被限流锁死
	h.resetAuthLimit(c)

	h.logs.Record(service.Entry{
		UserID:    user.ID,
		Username:  user.Username,
		Category:  model.LogCategoryAuth,
		Action:    "登录成功",
		Detail:    "角色：" + user.Role,
		IP:        middleware.ClientIP(c),
		UserAgent: c.Request.UserAgent(),
		Success:   true,
	})

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
		// 刷新令牌失败值得记录：可能是 token 伪造 / 过期重放的信号
		recordOp(h.logs, c, model.LogCategoryAuth, "刷新令牌失败", "refresh token 无效或已过期", false)
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
		recordOp(h.logs, c, model.LogCategoryAuth, "修改密码", "修改自己的登录密码", false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryAuth, "修改密码", "修改了自己的登录密码", true)
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
		recordOp(h.logs, c, model.LogCategoryAuth, "修改个人资料", "用户名改为 "+req.Username, false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryAuth, "修改个人资料", "用户名改为 "+req.Username, true)
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
