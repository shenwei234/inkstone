package handler

import (
	"net/http"
	"strconv"

	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type PageHandler struct {
	pages *service.PageService
}

func NewPageHandler(pages *service.PageService) *PageHandler {
	return &PageHandler{pages: pages}
}

func toPageResponse(p *model.Page) gin.H {
	return gin.H{
		"id":          p.ID,
		"title":       p.Title,
		"slug":        p.Slug,
		"content":     p.Content,
		"template":    p.Template,
		"status":      p.Status,
		"sort_order":  p.SortOrder,
		"show_in_nav": p.ShowInNav,
		"created_at":  p.CreatedAt,
		"updated_at":  p.UpdatedAt,
	}
}

type pageRequest struct {
	Title     string `json:"title" binding:"required"`
	Content   string `json:"content"`
	Template  string `json:"template"`
	Status    string `json:"status"`
	SortOrder int    `json:"sort_order"`
	ShowInNav bool   `json:"show_in_nav"`
}

// Create handles POST /admin/pages.
func (h *PageHandler) Create(c *gin.Context) {
	var req pageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写页面标题"})
		return
	}
	page, err := h.pages.Create(service.PageInput{
		Title:     req.Title,
		Content:   req.Content,
		Template:  req.Template,
		Status:    req.Status,
		SortOrder: req.SortOrder,
		ShowInNav: req.ShowInNav,
	})
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"page": toPageResponse(page)})
}

// Update handles PUT /admin/pages/:id.
func (h *PageHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的页面 ID"})
		return
	}
	var req pageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写页面标题"})
		return
	}
	page, err := h.pages.Update(uint(id), service.PageInput{
		Title:     req.Title,
		Content:   req.Content,
		Template:  req.Template,
		Status:    req.Status,
		SortOrder: req.SortOrder,
		ShowInNav: req.ShowInNav,
	})
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"page": toPageResponse(page)})
}

// Delete handles DELETE /admin/pages/:id.
func (h *PageHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的页面 ID"})
		return
	}
	if err := h.pages.Delete(uint(id)); err != nil {
		if err.Error() == "record not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "页面不存在"})
			return
		}
		errorResponse(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// Get handles GET /admin/pages/:id.
func (h *PageHandler) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的页面 ID"})
		return
	}
	page, err := h.pages.GetByID(uint(id))
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"page": toPageResponse(page)})
}

// ListAll handles GET /admin/pages (all statuses).
func (h *PageHandler) ListAll(c *gin.Context) {
	pages, err := h.pages.List(true)
	if err != nil {
		errorResponse(c, err)
		return
	}
	items := make([]gin.H, 0, len(pages))
	for i := range pages {
		items = append(items, toPageResponse(&pages[i]))
	}
	c.JSON(http.StatusOK, gin.H{"pages": items})
}

// ListPublic handles GET /pages (published only, compact fields).
func (h *PageHandler) ListPublic(c *gin.Context) {
	pages, err := h.pages.List(false)
	if err != nil {
		errorResponse(c, err)
		return
	}
	items := make([]gin.H, 0, len(pages))
	for i := range pages {
		items = append(items, gin.H{
			"id":    pages[i].ID,
			"title": pages[i].Title,
			"slug":  pages[i].Slug,
		})
	}
	c.JSON(http.StatusOK, gin.H{"pages": items})
}

// GetBySlug handles GET /pages/:slug (published only).
func (h *PageHandler) GetBySlug(c *gin.Context) {
	page, err := h.pages.GetBySlug(c.Param("slug"))
	if err != nil {
		errorResponse(c, err)
		return
	}
	if !page.IsPublished() {
		c.JSON(http.StatusNotFound, gin.H{"error": "页面不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"page": toPageResponse(page)})
}
