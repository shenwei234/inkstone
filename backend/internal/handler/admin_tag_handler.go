package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/repository"
)

type AdminTagHandler struct {
	taxonomy *repository.TaxonomyRepository
}

func NewAdminTagHandler(taxonomy *repository.TaxonomyRepository) *AdminTagHandler {
	return &AdminTagHandler{taxonomy: taxonomy}
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
		errorResponse(c, err)
		return
	}
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
		errorResponse(c, err)
		return
	}
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
	if err := h.taxonomy.DeleteTag(id); err != nil {
		errorResponse(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
