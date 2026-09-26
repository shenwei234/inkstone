package handler

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/middleware"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/service"
)

// statusLabel returns the Chinese label for an article status.
func statusLabel(s string) string {
	switch s {
	case model.ArticlePublished:
		return "已发布"
	case model.ArticleDraft:
		return "草稿"
	default:
		return s
	}
}

// changedDetail lists the fields actually submitted in an article update so
// the audit log shows what changed, not just that something changed.
func changedDetail(req articleUpdateRequest) string {
	var fields []string
	if req.Title != nil {
		fields = append(fields, "标题")
	}
	if req.Content != nil {
		fields = append(fields, "内容")
	}
	if req.Status != nil {
		fields = append(fields, "状态")
	}
	if req.CategoryID != nil {
		fields = append(fields, "分类")
	}
	if req.Tags != nil {
		fields = append(fields, "标签")
	}
	if req.Cover != nil {
		fields = append(fields, "封面")
	}
	if len(fields) == 0 {
		return ""
	}
	return "，变更：" + strings.Join(fields, "、")
}

// recordOp writes one operation-log entry asynchronously (non-blocking).
// The acting user, client IP and User-Agent are taken from the request
// context, so call sites only provide category / action / detail.
// logs == nil (or not wired) silently skips recording.
func recordOp(logs *service.LogService, c *gin.Context, category, action, detail string, success bool) {
	if logs == nil {
		return
	}
	var (
		userID   uint
		username string
	)
	if user, ok := middleware.GetCurrentUser(c); ok {
		userID = user.ID
		username = user.Username
	}
	logs.Record(service.Entry{
		UserID:    userID,
		Username:  username,
		Category:  category,
		Action:    action,
		Detail:    detail,
		IP:        middleware.ClientIP(c),
		UserAgent: c.Request.UserAgent(),
		Success:   success,
	})
}
