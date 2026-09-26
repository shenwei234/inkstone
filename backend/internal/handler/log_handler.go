package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type LogHandler struct {
	logs *service.LogService
}

func NewLogHandler(logs *service.LogService) *LogHandler {
	return &LogHandler{logs: logs}
}

// logCategoryLabels maps category keys to Chinese labels for CSV export and
// list display. Keys must stay in sync with the frontend CATEGORIES.
var logCategoryLabels = map[string]string{
	model.LogCategoryAuth:     "登录认证",
	model.LogCategoryArticle:  "文章",
	model.LogCategoryUser:     "用户",
	model.LogCategoryComment:  "评论",
	model.LogCategorySetting:  "设置",
	model.LogCategoryFile:     "文件",
	model.LogCategoryLink:     "友链",
	model.LogCategoryPage:     "页面",
	model.LogCategoryTaxonomy: "分类标签",
	model.LogCategorySystem:   "系统",
	model.LogCategoryOther:    "其他",
}

func categoryLabel(key string) string {
	if label, ok := logCategoryLabels[key]; ok {
		return label
	}
	return key
}

// parseLogQuery reads the shared log filter parameters (category / username /
// keyword / time range / success) from the query string.
func parseLogQuery(c *gin.Context, withPaging bool) repository.OperationLogQuery {
	q := repository.OperationLogQuery{
		Category: c.Query("category"),
		Username: c.Query("username"),
		Keyword:  c.Query("q"),
		From:     parseLogTimeQuery(c, "from"),
		To:       parseLogTimeQuery(c, "to"),
	}
	if v := c.Query("success"); v == "true" || v == "false" {
		ok := v == "true"
		q.Success = &ok
	}
	if withPaging {
		q.Page = parseIntQuery(c, "page", 1)
		q.PageSize = parseIntQuery(c, "page_size", 20)
	}
	return q
}

// parseLogTimeQuery accepts "2006-01-02" or RFC3339; nil = unbounded.
func parseLogTimeQuery(c *gin.Context, name string) *time.Time {
	raw := c.Query(name)
	if raw == "" {
		return nil
	}
	if t, err := time.ParseInLocation("2006-01-02", raw, time.Local); err == nil {
		return &t
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return &t
	}
	return nil
}

// List handles GET /admin/logs — 操作日志分页查询。
func (h *LogHandler) List(c *gin.Context) {
	q := parseLogQuery(c, true)

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

// Overview handles GET /admin/logs/overview — 总数 / 今日 / 失败数 / 分类统计。
func (h *LogHandler) Overview(c *gin.Context) {
	overview, err := h.logs.Overview()
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"overview": overview})
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

// Export handles GET /admin/logs/export — 按当前筛选条件下载 CSV 日志。
func (h *LogHandler) Export(c *gin.Context) {
	logs, err := h.logs.Export(parseLogQuery(c, false))
	if err != nil {
		errorResponse(c, err)
		return
	}

	stamp := time.Now().Format("20060102-150405")
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition",
		fmt.Sprintf(`attachment; filename="inkstone-logs-%s.csv"; filename*=UTF-8''inkstone-logs-%s.csv`, stamp, stamp))
	c.Header("X-Content-Type-Options", "nosniff")

	// UTF-8 BOM，保证 Excel 打开中文不乱码。
	if _, err := c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil {
		return
	}

	w := csv.NewWriter(c.Writer)
	w.UseCRLF = true
	_ = w.Write([]string{"ID", "时间", "用户ID", "用户名", "分类", "操作", "详情", "IP", "User-Agent", "结果"})
	for _, l := range logs {
		result := "成功"
		if !l.Success {
			result = "失败"
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(l.ID), 10),
			l.CreatedAt.Format("2006-01-02 15:04:05"),
			strconv.FormatUint(uint64(l.UserID), 10),
			l.Username,
			categoryLabel(l.Category),
			l.Action,
			l.Detail,
			l.IP,
			l.UserAgent,
			result,
		})
	}
	w.Flush()
}
