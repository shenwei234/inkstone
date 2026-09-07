package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/blog-platform/backend/internal/middleware"
	"github.com/blog-platform/backend/internal/model"
	"github.com/blog-platform/backend/internal/repository"
	"github.com/blog-platform/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	admin    *service.AdminService
	users    *repository.UserRepository
	articles *service.ArticleService
	articleRepo *repository.ArticleRepository
}

func NewAdminHandler(admin *service.AdminService, users *repository.UserRepository, articles *service.ArticleService, articleRepo *repository.ArticleRepository) *AdminHandler {
	return &AdminHandler{admin: admin, users: users, articles: articles, articleRepo: articleRepo}
}

// Stats handles GET /admin/stats.
func (h *AdminHandler) Stats(c *gin.Context) {
	st, err := h.admin.Stats()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, st)
}

// ListUsers handles GET /admin/users?page=&page_size=&q=.
func (h *AdminHandler) ListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	users, total, err := h.users.List(page, pageSize, c.Query("q"))
	if err != nil {
		errorResponse(c, err)
		return
	}
	items := make([]gin.H, 0, len(users))
	for _, u := range users {
		items = append(items, gin.H{
			"id":         u.ID,
			"email":      u.Email,
			"username":   u.Username,
			"role":       u.Role,
			"status":     u.Status,
			"created_at": u.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"users": items, "total": total, "page": page, "page_size": pageSize})
}

type createUserRequest struct {
	Email    string `json:"email" binding:"required"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Role     string `json:"role"`
}

// CreateUser handles POST /admin/users.
func (h *AdminHandler) CreateUser(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整的用户信息"})
		return
	}

	user, err := h.admin.CreateUser(service.CreateUserInput{
		Email:    req.Email,
		Username: req.Username,
		Password: req.Password,
		Role:     req.Role,
	})
	if err != nil {
		errorResponse(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"user": gin.H{
			"id":       user.ID,
			"email":    user.Email,
			"username": user.Username,
			"role":     user.Role,
			"status":   user.Status,
		},
	})
}

type updateStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// UpdateUserStatus handles PUT /admin/users/:id/status (ban/unban).
func (h *AdminHandler) UpdateUserStatus(c *gin.Context) {
	current, _ := middleware.GetCurrentUser(c)

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}

	var req updateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 status 字段"})
		return
	}
	if current.ID == uint(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能封禁自己的账号"})
		return
	}

	if err := h.admin.SetUserStatus(uint(id), req.Status); err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "状态已更新"})
}

type updateRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

// UpdateUserRole handles PUT /admin/users/:id/role.
func (h *AdminHandler) UpdateUserRole(c *gin.Context) {
	current, _ := middleware.GetCurrentUser(c)

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}

	var req updateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 role 字段"})
		return
	}
	if req.Role != model.RoleAdmin && req.Role != model.RoleUser {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的角色值"})
		return
	}
	if current.ID == uint(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能修改自己的角色"})
		return
	}

	if err := h.users.UpdateRole(uint(id), req.Role); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "角色已更新"})
}

// DeleteUser handles DELETE /admin/users/:id. Also removes the user's articles.
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	current, _ := middleware.GetCurrentUser(c)

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}
	if current.ID == uint(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除自己的账号"})
		return
	}

	if err := h.articleRepo.DeleteByAuthor(uint(id)); err != nil {
		errorResponse(c, err)
		return
	}
	if err := h.users.Delete(uint(id)); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		errorResponse(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// ListArticles handles GET /admin/articles?status=&page=&page_size= (all statuses).
func (h *AdminHandler) ListArticles(c *gin.Context) {
	q := repository.ArticleQuery{
		Page:     parseIntOr(c.Query("page"), 1),
		PageSize: parseIntOr(c.Query("page_size"), 20),
		Status:   c.Query("status"),
		All:      c.Query("status") == "",
	}
	articles, total, err := h.articles.List(q)
	if err != nil {
		errorResponse(c, err)
		return
	}
	items := make([]articleResponse, 0, len(articles))
	for i := range articles {
		items = append(items, toArticleResponse(&articles[i]))
	}
	c.JSON(http.StatusOK, gin.H{"articles": items, "total": total, "page": q.Page, "page_size": q.PageSize})
}

// SetArticleStatus handles PUT /admin/articles/:id/status.
func (h *AdminHandler) SetArticleStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文章 ID"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 status 字段"})
		return
	}

	article, err := h.admin.SetArticleStatus(uint(id), req.Status)
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"article": toArticleResponse(article)})
}

// DeleteArticle handles DELETE /admin/articles/:id (any article).
func (h *AdminHandler) DeleteArticle(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文章 ID"})
		return
	}
	if err := h.articleRepo.DeleteAny(uint(id)); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
			return
		}
		errorResponse(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
