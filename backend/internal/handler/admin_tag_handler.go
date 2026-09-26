package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type AdminTagHandler struct {
	taxonomy *repository.TaxonomyRepository
	logs     *service.LogService
}

func NewAdminTagHandler(taxonomy *repository.TaxonomyRepository, logs *service.LogService) *AdminTagHandler {
	return &AdminTagHandler{taxonomy: taxonomy, logs: logs}
}

type tagRequest struct {
	Name string `json:"name" binding:"required"`
}

// Create handles POST /admin/tags.
func (h *AdminTagHandler) Create(c *gin.Context) {
	var req tagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写标签名称"})
		return
	}
	tag, err := h.taxonomy.CreateTag(req.Name)
	if err != nil {
		recordOp(h.logs, c, model.LogCategoryTaxonomy, "创建标签", req.Name, false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryTaxonomy, "创建标签",
		fmt.Sprintf("%s（#%d）", tag.Name, tag.ID), true)
	c.JSON(http.StatusCreated, gin.H{"tag": gin.H{
		"id":            tag.ID,
		"name":          tag.Name,
		"slug":          tag.Slug,
		"article_count": 0,
	}})
}

// Update handles PUT /admin/tags/:id.
func (h *AdminTagHandler) Update(c *gin.Context) {
	id, ok := parseUintParam(c, "id", "无效的标签 ID")
	if !ok {
		return
	}
	var req tagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写标签名称"})
		return
	}
	tag, err := h.taxonomy.UpdateTag(id, req.Name)
	if err != nil {
		recordOp(h.logs, c, model.LogCategoryTaxonomy, "更新标签", fmt.Sprintf("标签 #%d", id), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryTaxonomy, "更新标签",
		fmt.Sprintf("%s（#%d）", tag.Name, tag.ID), true)
	c.JSON(http.StatusOK, gin.H{"tag": gin.H{
		"id":   tag.ID,
		"name": tag.Name,
		"slug": tag.Slug,
	}})
}

// Delete handles DELETE /admin/tags/:id.
func (h *AdminTagHandler) Delete(c *gin.Context) {
	id, ok := parseUintParam(c, "id", "无效的标签 ID")
	if !ok {
		return
	}
	// 删除前先取名称，让审计日志记录删的是哪个标签
	name := ""
	if tags, err := h.taxonomy.ListTags(); err == nil {
		for i := range tags {
			if tags[i].ID == id {
				name = tags[i].Name
				break
			}
		}
	}
	if err := h.taxonomy.DeleteTag(id); err != nil {
		recordOp(h.logs, c, model.LogCategoryTaxonomy, "删除标签", fmt.Sprintf("标签 #%d", id), false)
		errorResponse(c, err)
		return
	}
	recordOp(h.logs, c, model.LogCategoryTaxonomy, "删除标签",
		fmt.Sprintf("%s（#%d）", name, id), true)
	c.Status(http.StatusNoContent)
}
