package handler

import (
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/service"
)

// LapProxyHandler 把 Lap（Cap 的 CF Workers 分支）的公开接口同源代理给浏览器。
//
// 背景：访客网络到 workers.dev 常被 DNS 污染 / 超时（ERR_CONNECTION_TIMED_OUT），
// widget.js 与 challenge/redeem 全部直连会直接失败。改由 InkStone 服务端
// （网络环境通常正常，且支持 lap_resolve_ip 固定 IP 兜底）转发，浏览器只访问本站。
//
// 白名单转发（防代理滥用）：
//
//	GET  /lap/widget.js | widget.compat.js | floating.js   → Lap 实例同路径
//	GET  /lap/wasm                                          → jsdelivr wasm（PoW 内核）
//	POST /lap/{siteKey}/challenge | /lap/{siteKey}/redeem   → Lap 实例同路径（siteKey 须与配置一致）
//
// siteverify 不走代理（后端内部直连，见 lap_service.go）。
type LapProxyHandler struct {
	settings *service.SettingsService
	client   *http.Client
}

func NewLapProxyHandler(settings *service.SettingsService) *LapProxyHandler {
	return &LapProxyHandler{
		settings: settings,
		client:   service.NewLapHTTPClient(settings),
	}
}

// lapProxyMaxBody 限制转发体大小（redeem 的 solutions 可能几十 KB）。
const lapProxyMaxBody = 1 << 20

func (h *LapProxyHandler) Proxy(c *gin.Context) {
	path := c.Param("path") // 形如 /widget.js、/SITEKEY/challenge
	if !strings.HasPrefix(path, "/") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
		return
	}

	target, cacheable, ok := h.resolveTarget(path, c.Request.Method)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
		return
	}

	// 构造上游请求（透传 method / body / query / UA / Accept-Language）
	upstream := *c.Request.URL
	upstream.Path = target.path
	upstream.RawPath = ""
	targetURL := target.base + upstream.RequestURI()

	var body []byte
	if c.Request.Method == http.MethodPost {
		data, err := io.ReadAll(io.LimitReader(c.Request.Body, lapProxyMaxBody+1))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "读取请求体失败"})
			return
		}
		if len(data) > lapProxyMaxBody {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "请求体过大"})
			return
		}
		body = data
	}

	// 透传浏览器 UA / Accept-Language：Lap worker（Cloudflare）对 Go 默认 UA
	// （Go-http-client）的 POST /challenge 会直接 403 Blocked
	headers := map[string]string{}
	if ua := c.Request.Header.Get("User-Agent"); ua != "" {
		headers["User-Agent"] = ua
	}
	if al := c.Request.Header.Get("Accept-Language"); al != "" {
		headers["Accept-Language"] = al
	}
	if c.Request.Method == http.MethodPost {
		headers["Content-Type"] = "application/json"
	}

	resp, err := service.LapDo(c.Request.Context(), h.client, c.Request.Method, targetURL, body, headers)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Lap 服务暂不可达"})
		return
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, lapProxyMaxBody))
	if err != nil && len(payload) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Lap 响应读取失败"})
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	// widget.js / wasm 允许浏览器短缓存，challenge / redeem 不缓存
	cache := "no-store"
	if cacheable {
		cache = "public, max-age=300"
	}
	c.Header("Cache-Control", cache)
	c.Data(resp.StatusCode, contentType, payload)
}

type lapProxyTarget struct {
	base string // scheme://host
	path string // 上游路径
}

// resolveTarget 把本站代理路径映射到上游 URL；返回 (目标, 可缓存, 允许)，白名单外一律拒绝。
// 同时校验 HTTP 方法配对：静态资源只收 GET，交互端点只收 POST。
func (h *LapProxyHandler) resolveTarget(path, method string) (lapProxyTarget, bool, bool) {
	origin, ok := h.lapOrigin()
	if !ok {
		return lapProxyTarget{}, false, false
	}

	switch path {
	case "/widget.js", "/widget.compat.js", "/floating.js", "/wasm":
		if method != http.MethodGet {
			return lapProxyTarget{}, false, false
		}
		if path == "/wasm" {
			if u, err := url.Parse(service.LapWasmUpstream); err == nil {
				return lapProxyTarget{base: u.Scheme + "://" + u.Host, path: u.Path}, true, true
			}
			return lapProxyTarget{}, false, false
		}
		return lapProxyTarget{base: origin, path: path}, true, true
	}

	// /{siteKey}/challenge 或 /{siteKey}/redeem（siteKey 须与生效配置一致，
	// 未在后台配置时用 lap_defaults.go 的内置默认实例）
	parts := strings.SplitN(strings.TrimPrefix(path, "/"), "/", 2)
	if len(parts) == 2 && (parts[1] == "challenge" || parts[1] == "redeem") {
		if method != http.MethodPost {
			return lapProxyTarget{}, false, false
		}
		_, siteKey, _ := service.LapEffectiveConfig(h.settings)
		if strings.TrimSpace(siteKey) != "" && parts[0] == strings.TrimSpace(siteKey) {
			return lapProxyTarget{base: origin, path: path}, false, true
		}
	}
	return lapProxyTarget{}, false, false
}

// lapOrigin 从生效配置推导 Lap 实例的 scheme://host（endpoint 含 siteKey 路径，取 origin 即可）。
func (h *LapProxyHandler) lapOrigin() (string, bool) {
	endpoint, _, _ := service.LapEffectiveConfig(h.settings)
	u, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	return u.Scheme + "://" + u.Host, true
}
