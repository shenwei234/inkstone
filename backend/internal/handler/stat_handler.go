package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type StatHandler struct {
	stats *service.StatService
}

func NewStatHandler(stats *service.StatService) *StatHandler {
	return &StatHandler{stats: stats}
}

// Traffic handles GET /admin/stats/traffic?days=30 — PV/UV + bandwidth trend.
func (h *StatHandler) Traffic(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	points, err := h.stats.Trend(days)
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"points": points, "days": days})
}

// Resources handles GET /admin/stats/resources — host CPU / memory usage.
func (h *StatHandler) Resources(c *gin.Context) {
	c.JSON(http.StatusOK, h.stats.SystemResources())
}
