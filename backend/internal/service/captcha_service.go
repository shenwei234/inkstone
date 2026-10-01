package service

// 人机验证 provider 取值（设置项 captcha_provider）。
const (
	CaptchaProviderGeetest = "geetest" // 极验第四代行为验证（默认）
	CaptchaProviderLap     = "lap"     // Lap（Cap 的 Cloudflare Workers 分支，工作量证明）
)

// CaptchaParams 是前端提交的人机验证凭证。按 captcha_provider 取用不同字段：
// geetest 用内嵌的四元组，lap 用 LapToken（widget solve 事件产出的
// SITEKEY:ID:TOKEN）。请求体同时接收两套字段，未选中的 provider 忽略。
type CaptchaParams struct {
	GeetestParams
	LapToken string `json:"lap_token"` // Lap 令牌
}

// CaptchaService 是人机验证门面：按 captcha_provider 设置把校验分发到
// 具体 provider，供各 handler 统一调用；同时负责 /site-config 的
// 前台配置下发（provider + 两套配置，前端按 provider 选用）。
type CaptchaService struct {
	settings *SettingsService
	geetest  *GeetestService
	lap      *LapService
}

func NewCaptchaService(settings *SettingsService, geetest *GeetestService, lap *LapService) *CaptchaService {
	return &CaptchaService{settings: settings, geetest: geetest, lap: lap}
}

// Provider 返回当前启用的 provider，未配置或非法值回退极验（保持旧行为）。
func (s *CaptchaService) Provider() string {
	v, err := s.settings.Get(SettingCaptchaProvider)
	if err != nil {
		return CaptchaProviderGeetest
	}
	if v == CaptchaProviderLap {
		return CaptchaProviderLap
	}
	return CaptchaProviderGeetest
}

// Required 判断某个场景是否开启了人机验证（按当前 provider 分发，
// 供 handler 层在业务校验前决定是否强制）。
func (s *CaptchaService) Required(action string) bool {
	if s.Provider() == CaptchaProviderLap {
		return s.lap.Required(action)
	}
	return s.geetest.Required(action)
}

// PublicConfig 下发到前台的人机验证配置：provider 选择器 + 两套 provider
// 的公开配置（均不含密钥）。前台只渲染/初始化当前 provider 那套。
func (s *CaptchaService) PublicConfig() map[string]any {
	return map[string]any{
		"provider": s.Provider(),
		"geetest":  s.geetest.PublicConfig(),
		"lap":      s.lap.PublicConfig(),
	}
}

// Verify 校验一次人机验证凭证（按当前 provider 分发到具体服务）。
func (s *CaptchaService) Verify(action string, p CaptchaParams) error {
	if s.Provider() == CaptchaProviderLap {
		return s.lap.Verify(action, p.LapToken)
	}
	return s.geetest.Verify(action, p.GeetestParams)
}
