package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/middleware"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type LinkApplicationHandler struct {
	apps    *service.LinkApplicationService
	geetest *service.GeetestService
	logs    *service.LogService
}

func NewLinkApplicationHandler(
	apps *service.LinkApplicationService,
	geetest *service.GeetestService,
	logs *service.LogService,
) *LinkApplicationHandler {
	return &LinkApplicationHandler{apps: apps, geetest: geetest, logs: logs}
}

// linkApplicationResponse 脱敏后台视图（IP 哈希可不下发，防社工）。
func linkApplicationResponse(app *model.FriendLinkApplication) gin.H {
	return gin.H{
		"id":          app.ID,
		"site_name":   app.SiteName,
		"url":         app.URL,
		"description": app.Description,
		"icon_url":    app.IconURL,
		"email":       app.Email,
		"status":      app.Status,
		"reason":      app.Reason,
		"reviewed_by": app.ReviewedBy,
		"reviewed_at": app.ReviewedAt,
		"created_at":  app.CreatedAt,
	}
}

type submitLinkApplicationRequest struct {
	SiteName    string `json:"site_name" binding:"required"`
	URL         string `json:"url" binding:"required"`
	Description string `json:"description"`
	IconURL     string `json:"icon_url"`
	Email       string `json:"email"`
	service.GeetestParams
}

// Submit handles POST /link-applications — 访客自助提交友链申请（公开）。
func (h *LinkApplicationHandler) Submit(c *gin.Context) {
	var req submitLinkApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写站点名称与地址"})
		return
	}
	// 人机验证复用「评论」场景：开启评论验证码时同时保护友链申请
	if err := h.geetest.Verify("comment", req.GeetestParams); err != nil {
		errorResponse(c, err)
		return
	}
	app, err := h.apps.Submit(service.LinkApplicationInput{
		SiteName:    req.SiteName,
		URL:         req.URL,
		Description: req.Description,
		IconURL:     req.IconURL,
		Email:       req.Email,
	}, middleware.ClientIP(c))
	if err != nil {
		recordOp(h.logs, c, model.LogCategoryLink, "友链申请",
			fmt.Sprintf("%s（%s）", req.SiteName, req.URL), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryLink, "友链申请",
		fmt.Sprintf("%s（%s）#%d", req.SiteName, req.URL, app.ID), true)
	c.JSON(http.StatusCreated, gin.H{"message": "申请已提交，站长审核通过后将展示"})
}

// ListAdmin handles GET /admin/link-applications?status=pending|approved|rejected
func (h *LinkApplicationHandler) ListAdmin(c *gin.Context) {
	apps, err := h.apps.ListAdmin(c.Query("status"))
	if err != nil {
		errorResponse(c, err)
		return
	}
	pending, err := h.apps.PendingCount()
	if err != nil {
		pending = 0
	}
	items := make([]gin.H, 0, len(apps))
	for i := range apps {
		items = append(items, linkApplicationResponse(&apps[i]))
	}
	c.JSON(http.StatusOK, gin.H{"applications": items, "pending": pending})
}

// Approve handles POST /admin/link-applications/:id/approve
func (h *LinkApplicationHandler) Approve(c *gin.Context) {
	id, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	app, err := h.apps.Approve(uint(id), current.ID)
	if err != nil {
		recordOp(h.logs, c, model.LogCategoryLink, "审核友链申请", fmt.Sprintf("申请 #%d", id), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryLink, "通过友链申请",
		fmt.Sprintf("%s（#%d，%s）", app.SiteName, app.ID, app.URL), true)
	c.JSON(http.StatusOK, gin.H{"application": linkApplicationResponse(app)})
}

type rejectLinkApplicationRequest struct {
	Reason string `json:"reason" binding:"required"`
}

// Reject handles POST /admin/link-applications/:id/reject
func (h *LinkApplicationHandler) Reject(c *gin.Context) {
	id, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	current, ok := middleware.GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var req rejectLinkApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写拒绝原因"})
		return
	}
	app, err := h.apps.Reject(uint(id), current.ID, req.Reason)
	if err != nil {
		recordOp(h.logs, c, model.LogCategoryLink, "拒绝友链申请", fmt.Sprintf("申请 #%d", id), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryLink, "拒绝友链申请",
		fmt.Sprintf("%s（#%d）：%s", app.SiteName, app.ID, app.Reason), true)
	c.JSON(http.StatusOK, gin.H{"application": linkApplicationResponse(app)})
}

// Delete handles DELETE /admin/link-applications/:id
func (h *LinkApplicationHandler) Delete(c *gin.Context) {
	id, ok := parseUintParam(c, "id", "无效的 ID")
	if !ok {
		return
	}
	if err := h.apps.Delete(uint(id)); err != nil {
		recordOp(h.logs, c, model.LogCategoryLink, "删除友链申请", fmt.Sprintf("申请 #%d", id), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryLink, "删除友链申请", fmt.Sprintf("申请 #%d", id), true)
	c.Status(http.StatusNoContent)
}
