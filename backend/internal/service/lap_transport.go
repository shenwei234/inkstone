package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// lapUpstreamTimeout 是 InkStone 访问 Lap 上游（widget.js / wasm / challenge /
// redeem / siteverify）的统一超时。challenge 一次性、siteverify 高频，都不宜拖慢业务。
const lapUpstreamTimeout = 10 * time.Second

// LapWasmUpstream 是 PoW 的 WASM 上游（widget.js 内写死同款地址，这里做同源代理）。
// Lap（Cap）换 wasm 版本时需同步修改。
const LapWasmUpstream = "https://cdn.jsdelivr.net/npm/@cap.js/wasm@0.0.7/browser/cap_wasm_bg.wasm"

// NewLapHTTPClient 构造 InkStone 访问 Lap 上游的 HTTP client。
//
// 两级网络兜底（按设置动态读取，后台改动即时生效）：
//  1. lap_resolve_ip：仅对 lap_api_endpoint 所在 host 做拨号层固定 IP——
//     DNS 被污染（workers.dev 被解析到假 IP）时仍能连通；TLS SNI 与证书校验
//     仍用真实域名。jsdelivr（wasm）等 host 走正常解析。
//  2. lap_http_proxy：本机到 Lap 实例整段被阻断（如 TUN 代理黑洞 CF 段）时，
//     经本地/上游 HTTP 代理访问（开发机常见；生产服务器留空直连）。
//
// endpoint / resolve_ip / proxy 每次请求动态读取。
func NewLapHTTPClient(settings *SettingsService) *http.Client {
	return &http.Client{
		Timeout: lapUpstreamTimeout,
		Transport: &http.Transport{
			Proxy:       lapProxyFunc(settings),
			DialContext: lapDialContext(settings),
			// 走本地代理时连接复用价值低且隐患大：代理重启/抖动后 Transport
			// 连接的 idle keep-alive 会 EOF，而 POST 不会被自动重试 → 持续
			// 502。禁用 idle 复用，每次请求新连接绕开坏连接缓存。
			DisableKeepAlives: true,
			MaxIdleConns:      8,
			IdleConnTimeout:   30 * time.Second,
		},
	}
}

// lapProxyFunc 返回按设置切换的代理函数（空设置 = 直连）。
// LapDo 是访问 Lap 上游的统一入口（service 外由 lap_proxy handler 使用）：
// 对连接级失败（代理抖动 / 缓存坏连接的 EOF / connection reset）自动重试一次。
// 4xx/5xx 属于正常业务响应，不重试。
func LapDo(ctx context.Context, client *http.Client, method, url string, body []byte, headers map[string]string) (*http.Response, error) {
	build := func() *http.Request {
		var r io.Reader
		if body != nil {
			r = bytes.NewReader(body)
		}
		req, err := http.NewRequestWithContext(ctx, method, url, r)
		if err != nil {
			return nil
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		return req
	}

	req := build()
	if req == nil {
		return nil, errLapRequestBuild
	}
	resp, err := client.Do(req)
	if err == nil {
		return resp, nil
	}
	// 重试一次：clash 等本地代理切换节点时会有几秒的 EOF/reset 窗口
	retry := build()
	if retry == nil {
		return nil, err
	}
	return client.Do(retry)
}

var errLapRequestBuild = errors.New("lap: 构造上游请求失败")

func lapProxyFunc(settings *SettingsService) func(*http.Request) (*url.URL, error) {
	return func(_ *http.Request) (*url.URL, error) {
		v, err := settings.Get(SettingLapHTTPProxy)
		if err != nil {
			return nil, nil
		}
		v = strings.TrimSpace(v)
		if v == "" {
			return nil, nil
		}
		u, err := url.Parse(v)
		if err != nil || u.Host == "" {
			return nil, nil
		}
		return u, nil
	}
}

func lapDialContext(settings *SettingsService) func(ctx context.Context, network, addr string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 8 * time.Second}
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			host, port = addr, "443"
		}
		if endpoint, err := settings.Get(SettingLapAPIEndpoint); err == nil {
			if u, err := url.Parse(strings.TrimSpace(endpoint)); err == nil && u.Hostname() != "" {
				if strings.EqualFold(u.Hostname(), host) {
					if ip, err := settings.Get(SettingLapResolveIP); err == nil && strings.TrimSpace(ip) != "" {
						return dialer.DialContext(ctx, network, net.JoinHostPort(strings.TrimSpace(ip), port))
					}
				}
			}
		}
		return dialer.DialContext(ctx, network, addr)
	}
}
