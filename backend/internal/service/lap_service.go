package service

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// lapTicketTTL 是 Lap 令牌防重放的记忆时长。redeem 已保证挑战一次性消费，
// 本地 claimTicket 再兜一层防「同一令牌多次提交」的双花。
const lapTicketTTL = 10 * time.Minute

// LapService 对接 Lap（Cap 的 Cloudflare Workers 分支）工作量证明验证码。
//
// 协议（前端由同实例的 widget.js 完成，后端只做最后的 siteverify）：
//  1. widget POST  {endpoint}challenge          取挑战
//  2. 浏览器解 PoW（WASM）
//  3. widget POST  {endpoint}redeem             兑换出 SITEKEY:ID:TOKEN 令牌
//  4. 后端   POST  {origin}/siteverify          持 secret 校验令牌（本服务负责）
//
// 开关语义与 GeetestService 完全对称：场景未开启、密钥未配置、Lap 服务
// 不可达时一律放行，避免配置疏漏或网络故障把用户锁死在登录/注册之外。
type LapService struct {
	settings *SettingsService
	client   *http.Client

	mu     sync.Mutex
	used   map[string]time.Time // 令牌 -> 首次使用时间（防重放）
	lastGC time.Time
}

func NewLapService(settings *SettingsService) *LapService {
	return &LapService{
		settings: settings,
		client:   NewLapHTTPClient(settings),
		used:     make(map[string]time.Time),
	}
}

// lapSceneKey 把业务场景映射到对应的设置项开关。
func lapSceneKey(action string) string {
	switch action {
	case "register":
		return SettingLapOnRegister
	case "comment":
		return SettingLapOnComment
	default:
		return SettingLapOnLogin
	}
}

// Required 判断某个场景是否开启了 Lap 验证（前台据此决定是否渲染 widget）。
// 与 Enabled 的区别：即使尚未配置密钥，前台也应展示验证入口。
func (s *LapService) Required(action string) bool {
	return s.settings.BoolValue(SettingLapEnabled, false) &&
		s.settings.BoolValue(lapSceneKey(action), false)
}

// Enabled 在 Required 的基础上要求 Lap 配置可用。
// 注意：endpoint / site_key / secret 均有内置默认值（见 lap_defaults.go），
// 零配置即可通过此检查——真正的开关是后台的场景开关本身。
func (s *LapService) Enabled(action string) bool {
	if !s.Required(action) {
		return false
	}
	endpoint, siteKey, secret := LapEffectiveConfig(s.settings)
	return strings.TrimSpace(endpoint) != "" &&
		strings.TrimSpace(siteKey) != "" &&
		strings.TrimSpace(secret) != ""
}

// PublicConfig 下发到前台的人机验证配置（不含密钥）。未在后台配置的字段
// 回退内置默认实例，保证开箱即用。
func (s *LapService) PublicConfig() map[string]any {
	endpoint, siteKey, _ := LapEffectiveConfig(s.settings)
	return map[string]any{
		"enabled":      s.settings.BoolValue(SettingLapEnabled, false),
		"on_login":     s.settings.BoolValue(SettingLapOnLogin, false),
		"on_register":  s.settings.BoolValue(SettingLapOnRegister, false),
		"on_comment":   s.settings.BoolValue(SettingLapOnComment, false),
		"site_key":     strings.TrimSpace(siteKey),
		"api_endpoint": strings.TrimSpace(endpoint),
	}
}

// Verify 校验一次 Lap 令牌（widget solve 事件产出的 SITEKEY:ID:TOKEN）。
// 约定（与极验一致）：场景未开启、密钥未配置、Lap 服务不可达、或对端
// 报「site key/secret 无效」（我方配置问题）时一律放行。
func (s *LapService) Verify(action string, token string) error {
	if !s.Required(action) {
		return nil
	}
	if !s.Enabled(action) {
		log.Printf("[lap] 场景 %s 已开启但配置不可用，本次放行", action)
		return nil
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return NewValidationError("请先完成人机验证")
	}

	// 防重放：同一令牌只接受一次
	if !s.claimTicket(token) {
		return NewValidationError("人机验证已失效，请重新验证")
	}

	endpoint, _, secret := LapEffectiveConfig(s.settings)
	verifyURL, ok := lapSiteVerifyURL(endpoint)
	if !ok {
		log.Printf("[lap] api_endpoint 配置无效（请检查后台设置）")
		return NewValidationError("人机验证服务配置有误，请联系管理员")
	}

	body, _ := json.Marshal(map[string]string{
		"secret":   strings.TrimSpace(secret),
		"response": token,
	})
	resp, err := LapDo(context.Background(), s.client, http.MethodPost, verifyURL, body, map[string]string{
		"Content-Type": "application/json",
	})
	if err != nil {
		log.Printf("[lap] siteverify 请求失败（放行）: %v", err)
		return nil
	}
	defer resp.Body.Close()

	var out struct {
		Success bool   `json:"success"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		log.Printf("[lap] siteverify 响应解析失败（放行）: %v", err)
		return nil
	}
	if out.Success {
		return nil
	}
	// 「Invalid site key or secret」= 后台配置与 Lap 实例不匹配（我方问题），
	// 与极验 status:error 同样口径：放行并打日志，避免锁死用户。
	if strings.Contains(strings.ToLower(out.Error), "site key or secret") {
		log.Printf("[lap] siteverify 报告密钥无效（放行）: %s", out.Error)
		return nil
	}
	log.Printf("[lap] 场景 %s 令牌校验未通过: %s", action, out.Error)
	return NewValidationError("人机验证未通过，请重试")
}

// lapSiteVerifyURL 从管理员配置的 endpoint（形如
// https://xxx.workers.dev/MYSITE/，供 widget 的 challenge/redeem 使用）
// 推导服务端 siteverify 地址（固定在该 Lap 实例的 origin 根路径）。
// 解析失败时返回第二个返回值 false。
func lapSiteVerifyURL(endpoint string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	return u.Scheme + "://" + u.Host + "/siteverify", true
}

// claimTicket 记录令牌，返回 false 表示该凭证已被使用过。
func (s *LapService) claimTicket(token string) bool {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.used[token]; ok {
		return false
	}
	s.used[token] = now
	// 每 5 分钟顺手清理过期记录，控制内存
	if s.lastGC.IsZero() || now.Sub(s.lastGC) > 5*time.Minute {
		for k, t := range s.used {
			if now.Sub(t) > lapTicketTTL {
				delete(s.used, k)
			}
		}
		s.lastGC = now
	}
	return true
}
