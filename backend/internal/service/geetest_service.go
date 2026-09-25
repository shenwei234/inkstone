package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// geetestValidateURL 是极验第四代行为验证的服务端二次校验接口。
const geetestValidateURL = "https://gcaptcha4.geetest.com/validate"

// geetestValidateTimeout 限制极验接口的超时，避免拖慢登录请求。
const geetestValidateTimeout = 5 * time.Second

// geetestTicketTTL 是凭证防重放的记忆时长（极验 lot_number 有效期约 5 分钟）。
const geetestTicketTTL = 10 * time.Minute

// GeetestParams 是前端 gt4.js 验证通过后提交的凭证字段。
type GeetestParams struct {
	LotNumber     string `json:"lot_number"`
	CaptchaOutput string `json:"captcha_output"`
	PassToken     string `json:"pass_token"`
	GenTime       string `json:"gen_time"`
}

// GeetestService 对接极验第四代行为验证：前端完成滑块/点选后，
// 由本服务持 captcha_key 向极验服务端做二次校验。
type GeetestService struct {
	settings *SettingsService
	client   *http.Client

	mu     sync.Mutex
	used   map[string]time.Time // pass_token -> 首次使用时间（防重放）
	lastGC time.Time
}

func NewGeetestService(settings *SettingsService) *GeetestService {
	return &GeetestService{
		settings: settings,
		client:   &http.Client{Timeout: geetestValidateTimeout},
		used:     make(map[string]time.Time),
	}
}

// sceneKey 把业务场景映射到对应的设置项开关。
func sceneKey(action string) string {
	switch action {
	case "register":
		return SettingGeetestOnRegister
	case "comment":
		return SettingGeetestOnComment
	default:
		return SettingGeetestOnLogin
	}
}

// Required 判断某个场景是否开启了人机验证（用于前台决定是否弹窗）。
// 与 Enabled 的区别：即使尚未配置密钥，前台也应展示验证入口。
func (s *GeetestService) Required(action string) bool {
	return s.settings.BoolValue(SettingGeetestEnabled, false) &&
		s.settings.BoolValue(sceneKey(action), false)
}

// Enabled 在 Required 的基础上要求 captcha_id / captcha_key 均已配置，
// 后端仅在此条件下强制执行校验。
func (s *GeetestService) Enabled(action string) bool {
	if !s.Required(action) {
		return false
	}
	id, _ := s.settings.Get(SettingGeetestCaptchaID)
	key, _ := s.settings.Get(SettingGeetestCaptchaKey)
	return strings.TrimSpace(id) != "" && strings.TrimSpace(key) != ""
}

// PublicConfig 下发到前台的人机验证配置（不含密钥）。
func (s *GeetestService) PublicConfig() map[string]any {
	id, _ := s.settings.Get(SettingGeetestCaptchaID)
	return map[string]any{
		"enabled":     s.settings.BoolValue(SettingGeetestEnabled, false),
		"on_login":    s.settings.BoolValue(SettingGeetestOnLogin, false),
		"on_register": s.settings.BoolValue(SettingGeetestOnRegister, false),
		"on_comment":  s.settings.BoolValue(SettingGeetestOnComment, false),
		"captcha_id":  strings.TrimSpace(id),
	}
}

// Verify 校验一次人机验证凭证。
// 约定（与邮箱验证码一致）：场景未开启、密钥未配置、极验服务不可达时一律放行，
// 避免配置疏漏或网络故障把用户锁死在登录/注册之外。
func (s *GeetestService) Verify(action string, p GeetestParams) error {
	if !s.Required(action) {
		return nil
	}
	if !s.Enabled(action) {
		log.Printf("[geetest] 场景 %s 已开启但未配置 captcha_id/captcha_key，本次放行", action)
		return nil
	}

	p.LotNumber = strings.TrimSpace(p.LotNumber)
	p.CaptchaOutput = strings.TrimSpace(p.CaptchaOutput)
	p.PassToken = strings.TrimSpace(p.PassToken)
	p.GenTime = strings.TrimSpace(p.GenTime)
	if p.LotNumber == "" || p.CaptchaOutput == "" || p.PassToken == "" || p.GenTime == "" {
		return NewValidationError("请先完成人机验证")
	}

	// 防重放：同一 pass_token 只接受一次
	if !s.claimTicket(p.PassToken) {
		return NewValidationError("人机验证已失效，请重新验证")
	}

	id, _ := s.settings.Get(SettingGeetestCaptchaID)
	key, _ := s.settings.Get(SettingGeetestCaptchaKey)
	id = strings.TrimSpace(id)
	key = strings.TrimSpace(key)
	sign := hmac.New(sha256.New, []byte(key))
	sign.Write([]byte(p.LotNumber))
	signToken := hex.EncodeToString(sign.Sum(nil))

	query := url.Values{}
	query.Set("lot_number", p.LotNumber)
	query.Set("captcha_output", p.CaptchaOutput)
	query.Set("pass_token", p.PassToken)
	query.Set("gen_time", p.GenTime)
	query.Set("sign_token", signToken)

	// captcha_id 放在 URL 上（官方约定），其余参数走 query string
	resp, err := s.client.Get(geetestValidateURL + "?captcha_id=" + url.QueryEscape(id) + "&" + query.Encode())
	if err != nil {
		log.Printf("[geetest] validate 请求失败（放行）: %v", err)
		return nil
	}
	defer resp.Body.Close()

	var out struct {
		Result string `json:"result"`
		Reason string `json:"reason"`
		Status string `json:"status"`
		Code   string `json:"code"`
		Msg    string `json:"msg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		log.Printf("[geetest] validate 响应解析失败（放行）: %v", err)
		return nil
	}
	// 极验侧的请求异常（如 illegal gen_time / pass_token expire 之外的口径错误）
	if out.Status == "error" {
		log.Printf("[geetest] validate 返回错误: code=%s msg=%s（放行）", out.Code, out.Msg)
		return nil
	}
	if out.Result != "success" {
		log.Printf("[geetest] 场景 %s 验证未通过: %s", action, out.Reason)
		return NewValidationError("人机验证未通过，请重试")
	}
	return nil
}

// claimTicket 记录 pass_token，返回 false 表示该凭证已被使用过。
func (s *GeetestService) claimTicket(token string) bool {
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
			if now.Sub(t) > geetestTicketTTL {
				delete(s.used, k)
			}
		}
		s.lastGC = now
	}
	return true
}
