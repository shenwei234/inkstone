package service

import (
	"os"
	"strings"
)

// 内置默认 Lap 实例（开箱即用）：全新部署无需在后台填写任何 Lap 配置即可
// 启用工作量证明验证码。后台留空的字段一律回退到这里的默认值；管理员在
// 「安全防护 → 人机验证（Lap）」填写自己的实例后覆盖。
//
// 默认实例是 Cap（Apache-2.0）的公共演示部署；自托管部署建议在后台换成
// 自己的实例地址与密钥。secret 优先读环境变量 INKSTONE_LAP_SECRET（生产
// 部署可用它覆盖，避免使用仓库内置值）。
const (
	lapDefaultEndpoint = "https://lap-serverless.2465813064.workers.dev/4e2db11e8ca9ba48c4a8787a/"
	lapDefaultSiteKey  = "4e2db11e8ca9ba48c4a8787a"
	lapDefaultSecret   = "1cc67239ac6aa4afb62592ba0ce2153a7df87d60cadad143"
)

// lapEffectiveConfig 返回实际生效的 Lap 配置（导出供 lap_proxy handler 使用）：
// 后台已填的字段优先，未填（空串）的字段回退内置默认值——保证零配置也能
// 跑完整链路。
func LapEffectiveConfig(settings *SettingsService) (endpoint, siteKey, secret string) {
	endpoint = lapDefaultEndpoint
	siteKey = lapDefaultSiteKey
	secret = lapDefaultSecret
	if v := strings.TrimSpace(os.Getenv("INKSTONE_LAP_SECRET")); v != "" {
		secret = v
	}
	if settings != nil {
		if v, err := settings.Get(SettingLapAPIEndpoint); err == nil && strings.TrimSpace(v) != "" {
			endpoint = strings.TrimSpace(v)
		}
		if v, err := settings.Get(SettingLapSiteKey); err == nil && strings.TrimSpace(v) != "" {
			siteKey = strings.TrimSpace(v)
		}
		if v, err := settings.Get(SettingLapSecretKey); err == nil && strings.TrimSpace(v) != "" {
			secret = strings.TrimSpace(v)
		}
	}
	return endpoint, siteKey, secret
}
