package service

import (
	"strings"

	"github.com/microcosm-cc/bluemonday"
)

// sanitizePolicy 是面向富文本（TipTap 编辑器输出）的净化策略：
// 允许常见的排版标签，但移除 <script>、事件属性（on*）、javascript: 链接等危险内容，
// 防止通过文章/页面正文注入存储型 XSS。
var sanitizePolicy = func() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	// UGC 策略已允许大部分常用标签，这里补充完整排版支持
	p.AllowAttrs("class").Globally()
	p.AllowAttrs("id").Globally()
	// 允许相对/站内图片与外部图片
	p.AllowAttrs("src").OnElements("img")
	p.AllowAttrs("alt", "width", "height").OnElements("img")
	// 表格支持
	p.AllowElements("table", "thead", "tbody", "tr", "td", "th")
	// 音视频（仅允许站内/常见源，但默认 UGC 已限制协议为 http/https）
	p.AllowAttrs("controls", "src").OnElements("video", "audio")
	return p
}()

// SanitizeHTML 移除富文本中的危险内容，返回安全的 HTML。
func SanitizeHTML(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return raw
	}
	return sanitizePolicy.Sanitize(raw)
}
