package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type LogHandler struct {
	logs *service.LogService
}

func NewLogHandler(logs *service.LogService) *LogHandler {
	return &LogHandler{logs: logs}
}

// List handles GET /admin/logs — 操作日志分页查询。
func (h *LogHandler) List(c *gin.Context) {
	q := repository.OperationLogQuery{
		Category: c.Query("category"),
		Username: c.Query("username"),
		Keyword:  c.Query("q"),
		Page:     parseIntQuery(c, "page", 1),
		PageSize: parseIntQuery(c, "page_size", 20),
	}

	logs, total, err := h.logs.List(q)
	if err != nil {
		errorResponse(c, err)
		return
	}

	items := make([]gin.H, 0, len(logs))
	for _, l := range logs {
		items = append(items, gin.H{
			"id":         l.ID,
			"user_id":    l.UserID,
			"username":   l.Username,
			"category":   l.Category,
			"action":     l.Action,
			"detail":     l.Detail,
			"ip":         l.IP,
			"user_agent": l.UserAgent,
			"success":    l.Success,
			"created_at": l.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":      items,
		"total":     total,
		"page":      q.Page,
		"page_size": q.PageSize,
	})
}

// Stats handles GET /admin/logs/stats — 各分类日志数量。
func (h *LogHandler) Stats(c *gin.Context) {
	stats, err := h.logs.Stats()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"stats": stats})
}
