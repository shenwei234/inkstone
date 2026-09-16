package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
)

// TrafficStats records per-request traffic into the stat service. Only
// public, human-facing GETs count as page views; static assets and admin
// API calls still contribute to bandwidth.
func TrafficStats(stats *service.StatService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if stats == nil {
			c.Next()
			return
		}
		path := c.Request.URL.Path
		// 跳过健康检查与静态资源，避免污染统计
		if path == "/healthz" || path == "/feed.xml" {
			c.Next()
			return
		}

		in := c.Request.ContentLength
		if in < 0 {
			in = 0
		}
		stats.Record(in, 0, ClientIP(c))
		c.Next()
	}
}
