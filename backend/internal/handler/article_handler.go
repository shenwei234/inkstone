package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/shenwei/inkstone/backend/internal/middleware"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type ArticleHandler struct {
	articles *service.ArticleService
}

func NewArticleHandler(articles *service.ArticleService) *ArticleHandler {
	return &ArticleHandler{articles: articles}
}

type articleRequest struct {
	Title      string   `json:"title" binding:"required"`
	Content    string   `json:"content" binding:"required"`
	Status     string   `json:"status"`
	CategoryID *uint    `json:"category_id"`
	Tags       []string `json:"tags"`
}

type articleUpdateRequest struct {
	Title      *string   `json:"title"`
	Content    *string   `json:"content"`
	Status     *string   `json:"status"`
	CategoryID **uint    `json:"category_id"`
	Tags       *[]string `json:"tags"`
}

type articleResponse struct {
	ID          uint          `json:"id"`
	Title       string        `json:"title"`
	Slug        string        `json:"slug"`
	Content     string        `json:"content"`
	Status      string        `json:"status"`
	Views       int64         `json:"views"`
	Category    *categoryInfo `json:"category,omitempty"`
	Tags        []tagInfo     `json:"tags,omitempty"`
	PublishedAt *time.Time    `json:"published_at"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
	Author      authorInfo    `json:"author"`
}

type authorInfo struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
}

type categoryInfo struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type tagInfo struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

func toArticleResponse(a *model.Article) articleResponse {
	resp := articleResponse{
		ID:          a.ID,
		Title:       a.Title,
		Slug:        a.Slug,
		Content:     a.Content,
		Status:      a.Status,
		Views:       a.Views,
		PublishedAt: a.PublishedAt,
		CreatedAt:   a.CreatedAt,
		UpdatedAt:   a.UpdatedAt,
		Author: authorInfo{
			ID:       a.Author.ID,
			Username: a.Author.Username,
		},
	}
	if a.Category != nil {
		resp.Category = &categoryInfo{ID: a.Category.ID, Name: a.Category.Name, Slug: a.Category.Slug}
	}
	if len(a.Tags) > 0 {
		resp.Tags = make([]tagInfo, 0, len(a.Tags))
		for _, t := range a.Tags {
			resp.Tags = append(resp.Tags, tagInfo{ID: t.ID, Name: t.Name, Slug: t.Slug})
		}
	}
	return resp
}

// Create handles POST /articles. Requires authentication.
func (h *ArticleHandler) Create(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req articleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供标题和内容"})
		return
	}

	article, err := h.articles.Create(current.ID, service.ArticleInput{
		Title:      req.Title,
		Content:    req.Content,
		Status:     req.Status,
		CategoryID: req.CategoryID,
		TagNames:   req.Tags,
	})
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"article": toArticleResponse(article)})
}

// Update handles PUT /articles/:id. Owner only.
func (h *ArticleHandler) Update(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文章 ID"})
		return
	}

	var req articleUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}

	article, err := h.articles.Update(uint(id), current.ID, service.ArticleUpdate{
		Title:      req.Title,
		Content:    req.Content,
		Status:     req.Status,
		CategoryID: req.CategoryID,
		TagNames:   req.Tags,
	})
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在或无权操作"})
			return
		}
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"article": toArticleResponse(article)})
}

// Delete handles DELETE /articles/:id. Owner only.
func (h *ArticleHandler) Delete(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文章 ID"})
		return
	}

	if err := h.articles.Delete(uint(id), current.ID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在或无权操作"})
			return
		}
		errorResponse(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// Get handles GET /articles/:id.
func (h *ArticleHandler) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文章 ID"})
		return
	}
	article, err := h.articles.GetByID(uint(id))
	if err != nil {
		errorResponse(c, err)
		return
	}
	_ = h.articles.IncrementViews(uint(id))
	article.Views++
	c.JSON(http.StatusOK, gin.H{"article": toArticleResponse(article)})
}

// GetBySlug handles GET /articles/slug/:slug.
func (h *ArticleHandler) GetBySlug(c *gin.Context) {
	article, err := h.articles.GetBySlug(c.Param("slug"))
	if err != nil {
		errorResponse(c, err)
		return
	}
	_ = h.articles.IncrementViews(article.ID)
	article.Views++
	c.JSON(http.StatusOK, gin.H{"article": toArticleResponse(article)})
}

// List handles GET /articles with pagination and optional filters.
func (h *ArticleHandler) List(c *gin.Context) {
	page, pageSize := parseIntOr(c.Query("page"), 1), parseIntOr(c.Query("page_size"), 10)
	if pageSize > 50 {
		pageSize = 50
	}
	q := repository.ArticleQuery{
		Page:         page,
		PageSize:     pageSize,
		Status:       c.Query("status"),
		CategorySlug: c.Query("category"),
		TagSlug:      c.Query("tag"),
		Search:       c.Query("q"),
		OrderBy:      c.Query("order"),
	}
	if v := c.Query("author_id"); v != "" {
		if id, err := strconv.ParseUint(v, 10, 64); err == nil {
			q.AuthorID = uint(id)
		}
	}

	// Non-published statuses require authentication (viewing own drafts).
	if q.Status != "" && q.Status != model.ArticlePublished {
		current, authenticated := middleware.GetCurrentUser(c)
		if !authenticated {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "需要登录才能查看非公开文章"})
			return
		}
		q.AuthorID = current.ID
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

	c.JSON(http.StatusOK, gin.H{
		"articles":  items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func parseIntOr(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 1 {
		return fallback
	}
	return v
}
