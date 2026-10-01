package service

import (
	"encoding/json"
	"testing"
)

func TestLapSiteVerifyURL(t *testing.T) {
	cases := []struct {
		endpoint string
		want     string
		ok       bool
	}{
		{"https://cap.example.workers.dev/MYSITE/", "https://cap.example.workers.dev/siteverify", true},
		{"https://cap.example.workers.dev/MYSITE", "https://cap.example.workers.dev/siteverify", true},
		{"http://localhost:8787/abc/", "http://localhost:8787/siteverify", true},
		{"", "", false},
		{"not a url", "", false},
		{"/relative/path", "", false},
	}
	for _, c := range cases {
		got, ok := lapSiteVerifyURL(c.endpoint)
		if got != c.want || ok != c.ok {
			t.Errorf("lapSiteVerifyURL(%q) = (%q, %v), want (%q, %v)", c.endpoint, got, ok, c.want, c.ok)
		}
	}
}

func TestLapSceneKey(t *testing.T) {
	if lapSceneKey("register") != SettingLapOnRegister ||
		lapSceneKey("comment") != SettingLapOnComment ||
		lapSceneKey("login") != SettingLapOnLogin ||
		lapSceneKey("other") != SettingLapOnLogin {
		t.Error("lapSceneKey 场景映射错误")
	}
}

func TestLapClaimTicket(t *testing.T) {
	s := NewLapService(nil)
	if !s.claimTicket("SITE:1:token") {
		t.Error("首次使用应被接受")
	}
	if s.claimTicket("SITE:1:token") {
		t.Error("同一令牌第二次使用应被拒绝（防重放）")
	}
	if !s.claimTicket("SITE:1:other") {
		t.Error("不同令牌应被接受")
	}
}

// 前端请求体同时携带两套字段，未选中的 provider 不得影响解析。
func TestCaptchaParamsUnmarshal(t *testing.T) {
	var withLap CaptchaParams
	if err := json.Unmarshal([]byte(`{"lap_token":"SITE:1:TOKEN"}`), &withLap); err != nil {
		t.Fatal(err)
	}
	if withLap.LapToken != "SITE:1:TOKEN" || withLap.LotNumber != "" {
		t.Errorf("lap_token 解析异常: %+v", withLap)
	}

	var withGeetest CaptchaParams
	if err := json.Unmarshal([]byte(`{"lot_number":"L","captcha_output":"C","pass_token":"P","gen_time":"G"}`), &withGeetest); err != nil {
		t.Fatal(err)
	}
	if withGeetest.LapToken != "" || withGeetest.PassToken != "P" {
		t.Errorf("极验四元组解析异常: %+v", withGeetest)
	}
}

// 全新部署（无 captcha_provider 记录）必须回退 lap——内置默认实例开箱即用；
// lap_secret_key 必须登记在 maskKeys，杜绝密钥外泄。
func TestCaptchaProviderDefaultFallback(t *testing.T) {
	if CaptchaProviderGeetest != "geetest" || CaptchaProviderLap != "lap" {
		t.Error("provider 常量拼写错误")
	}
	if v := settingDefaults[SettingCaptchaProvider]; v != CaptchaProviderLap {
		t.Errorf("captcha_provider 默认值应为 lap，实际 %q", v)
	}
	if !maskKeys[SettingLapSecretKey] {
		t.Error("lap_secret_key 未登记 maskKeys")
	}
}

// 内置默认实例：零配置时 effective 配置必须非空可用
// （settings 传 nil 等价于「设置表无任何记录」的全默认路径）。
func TestLapEffectiveConfigDefaults(t *testing.T) {
	endpoint, siteKey, secret := LapEffectiveConfig(nil)
	if endpoint == "" || siteKey == "" || secret == "" {
		t.Fatalf("内置默认配置不完整: %q / %q / %q", endpoint, siteKey, secret)
	}
	// siteverify URL 可由内置 endpoint 推导（origin + /siteverify）
	u, ok := lapSiteVerifyURL(endpoint)
	if !ok || u != "https://lap-serverless.2465813064.workers.dev/siteverify" {
		t.Errorf("内置 endpoint 推导 siteverify 失败: %q %v", u, ok)
	}
}

// 数据安全：后台已隐藏的 Lap 技术配置必须登记在 lapHiddenKeys——
// Update 对它们的空值提交做「保持原值」保护，杜绝误清空自托管配置。
// 注意 lap_secret_key 走 maskKeys（同款空值保护 + API 脱敏），不在此表。
func TestLapHiddenKeysProtection(t *testing.T) {
	for _, k := range []string{SettingLapAPIEndpoint, SettingLapSiteKey, SettingLapResolveIP, SettingLapHTTPProxy} {
		if !lapHiddenKeys[k] {
			t.Errorf("隐藏配置 %s 未登记 lapHiddenKeys，空串提交会清空已有配置", k)
		}
		// 必须注册默认值，否则 Update 直接忽略该键（改不动）
		if _, ok := settingDefaults[k]; !ok {
			t.Errorf("隐藏配置 %s 未注册默认值", k)
		}
	}
	if lapHiddenKeys[SettingLapSecretKey] {
		t.Error("lap_secret_key 应由 maskKeys 保护，不要重复登记 lapHiddenKeys")
	}
	if lapHiddenKeys[SettingLapEnabled] {
		t.Error("lap_enabled 是开关，必须可正常读写")
	}
}
