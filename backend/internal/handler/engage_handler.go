package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/middleware"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type TaxonomyHandler struct {
	taxonomy *repository.TaxonomyRepository
}

func NewTaxonomyHandler(taxonomy *repository.TaxonomyRepository) *TaxonomyHandler {
	return &TaxonomyHandler{taxonomy: taxonomy}
}

// ListCategories handles GET /categories.
func (h *TaxonomyHandler) ListCategories(c *gin.Context) {
	categories, err := h.taxonomy.ListCategories()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"categories": categories})
}

// ListTags handles GET /tags.
func (h *TaxonomyHandler) ListTags(c *gin.Context) {
	tags, err := h.taxonomy.ListTags()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"tags": tags})
}

type CommentHandler struct {
	comments *service.CommentService
	tokens   *service.TokenManager
	captcha  *service.CaptchaService
	limiter  *middleware.SlidingLimiter
}

func NewCommentHandler(comments *service.CommentService, tokens *service.TokenManager, captcha *service.CaptchaService, limiter *middleware.SlidingLimiter) *CommentHandler {
	return &CommentHandler{comments: comments, tokens: tokens, captcha: captcha, limiter: limiter}
}

type createCommentRequest struct {
	Content       string `json:"content" binding:"required"`
	CaptchaToken  string `json:"captcha_token"`
	CaptchaAnswer string `json:"captcha_answer"`
}

// Create handles POST /articles/:id/comments.
func (h *CommentHandler) Create(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "登录后才能评论"})
		return
	}
	articleID, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	var req createCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "评论内容不能为空"})
		return
	}
	if err := h.captcha.Verify(service.CaptchaActionComment, req.CaptchaToken, req.CaptchaAnswer, middleware.ClientIP(c)); err != nil {
		errorResponse(c, err)
		return
	}
	comment, err := h.comments.Create(uint(articleID), current.ID, req.Content)
	if err != nil {
		errorResponse(c, err)
		return
	}
	// 评论成功：重置该 IP 配额，避免正常用户被限流误伤
	if h.limiter != nil {
		if key := middleware.RateKey(c); key != "" {
			h.limiter.Reset(key)
		}
	}
	c.JSON(http.StatusCreated, gin.H{"comment": toCommentResponse(comment)})
}

// List handles GET /articles/:id/comments.
func (h *CommentHandler) List(c *gin.Context) {
	articleID, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	comments, err := h.comments.ListByArticle(uint(articleID))
	if err != nil {
		errorResponse(c, err)
		return
	}
	items := make([]gin.H, 0, len(comments))
	for i := range comments {
		items = append(items, toCommentResponse(&comments[i]))
	}
	c.JSON(http.StatusOK, gin.H{"comments": items})
}

// Delete handles DELETE /comments/:id (author or admin).
func (h *CommentHandler) Delete(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	commentID, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	if err := h.comments.Delete(uint(commentID), current.ID, current.Role == model.RoleAdmin); err != nil {
		errorResponse(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// MyComments handles GET /auth/my-comments.
func (h *CommentHandler) MyComments(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	comments, total, err := h.comments.ListByUser(current.ID, page, pageSize)
	if err != nil {
		errorResponse(c, err)
		return
	}
	items := make([]gin.H, 0, len(comments))
	for i := range comments {
		items = append(items, toCommentResponse(&comments[i]))
	}
	c.JSON(http.StatusOK, gin.H{"comments": items, "total": total, "page": page, "page_size": pageSize})
}

func toCommentResponse(cm *model.Comment) gin.H {
	user := gin.H{"id": 0, "username": "已注销"}
	if cm.User.ID != 0 {
		user = gin.H{"id": cm.User.ID, "username": cm.User.Username}
	}
	articleTitle := ""
	articleSlug := ""
	if cm.Article != nil {
		articleTitle = cm.Article.Title
		articleSlug = cm.Article.Slug
	}
	return gin.H{
		"id":            cm.ID,
		"article_id":    cm.ArticleID,
		"article_title": articleTitle,
		"article_slug":  articleSlug,
		"content":       cm.Content,
		"created_at":    cm.CreatedAt,
		"author":        user,
	}
}

type ReactionHandler struct {
	reactions *service.ReactionService
}

func NewReactionHandler(reactions *service.ReactionService) *ReactionHandler {
	return &ReactionHandler{reactions: reactions}
}

type toggleReactionRequest struct {
	Type string `json:"type" binding:"required"`
}

// Toggle handles POST /articles/:id/reactions.
func (h *ReactionHandler) Toggle(c *gin.Context) {
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "登录后才能点赞"})
		return
	}
	articleID, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	var req toggleReactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 type 字段"})
		return
	}
	active, count, err := h.reactions.Toggle(uint(articleID), current.ID, model.ReactionType(req.Type))
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"active": active, "count": count})
}

// Stats handles GET /articles/:id/reactions.
func (h *ReactionHandler) Stats(c *gin.Context) {
	articleID, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	current, hasUser := middleware.GetCurrentUser(c)
	stats, liked, favorited, err := h.reactions.Stats(uint(articleID), current.ID, hasUser)
	if err != nil {
		errorResponse(c, err)
		return
	}
	resp := gin.H{
		"likes":     stats.Likes,
		"favorites": stats.Favorites,
	}
	if hasUser {
		resp["liked"] = liked
		resp["favorited"] = favorited
	}
	c.JSON(http.StatusOK, resp)
}
