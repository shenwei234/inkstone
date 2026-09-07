package handler

import (
	"net/http"

	"github.com/blog-platform/backend/internal/middleware"
	"github.com/blog-platform/backend/internal/model"
	"github.com/blog-platform/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

type registerRequest struct {
	Email    string `json:"email" binding:"required"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
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

	user, pair, err := h.auth.Register(service.RegisterInput{
		Email:    req.Email,
		Username: req.Username,
		Password: req.Password,
	})
	if err != nil {
		errorResponse(c, err)
		return
	}

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

	user, pair, err := h.auth.Login(req.Email, req.Password)
	if err != nil {
		errorResponse(c, err)
		return
	}

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

func toUserResponse(u *model.User) gin.H {
	return gin.H{
		"id":       u.ID,
		"email":    u.Email,
		"username": u.Username,
		"role":     u.Role,
	}
}
