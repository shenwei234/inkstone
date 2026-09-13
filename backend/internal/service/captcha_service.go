package service

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	CaptchaProviderNone      = "none"
	CaptchaProviderTurnstile = "turnstile"
	CaptchaProviderGeeTest   = "geetest"
	CaptchaProviderBuiltin   = "builtin"

	// Actions that can require human verification.
	CaptchaActionRegister = "register"
	CaptchaActionLogin    = "login"
	CaptchaActionComment  = "comment"
	CaptchaActionArticle  = "article"
)

// CaptchaService issues and validates human-verification challenges.
// Supported providers: none, Cloudflare Turnstile, and a built-in signed
// arithmetic challenge that works without any external service.
type CaptchaService struct {
	settings *SettingsService
	secret   []byte
}

func NewCaptchaService(settings *SettingsService, jwtSecret string) *CaptchaService {
	return &CaptchaService{settings: settings, secret: []byte(jwtSecret)}
}

func (s *CaptchaService) Provider() string {
	v, err := s.settings.Get(SettingCaptchaProvider)
	if err != nil {
		return CaptchaProviderNone
	}
	switch v {
	case CaptchaProviderTurnstile, CaptchaProviderBuiltin, CaptchaProviderGeeTest:
		return v
	default:
		return CaptchaProviderNone
	}
}

// Required reports whether the given action needs verification.
func (s *CaptchaService) Required(action string) bool {
	if s.Provider() == CaptchaProviderNone {
		return false
	}
	key := ""
	switch action {
	case CaptchaActionRegister:
		key = SettingCaptchaOnRegister
	case CaptchaActionLogin:
		key = SettingCaptchaOnLogin
	case CaptchaActionComment:
		key = SettingCaptchaOnComment
	case CaptchaActionArticle:
		key = SettingCaptchaOnArticle
	default:
		return false
	}
	v, err := s.settings.Get(key)
	if err != nil {
		return false
	}
	return v == "true"
}

// PublicConfig exposes the browser-safe part of the captcha configuration.
func (s *CaptchaService) PublicConfig() map[string]any {
	siteKey, _ := s.settings.Get(SettingCaptchaSiteKey)
	geetestID, _ := s.settings.Get(SettingGeeTestCaptchaID)
	cfg := map[string]any{
		"provider":           s.Provider(),
		"site_key":           siteKey,
		"geetest_captcha_id": geetestID,
	}
	for _, action := range []string{
		CaptchaActionRegister, CaptchaActionLogin, CaptchaActionComment, CaptchaActionArticle,
	} {
		cfg["on_"+action] = s.Required(action)
	}
	return cfg
}

type builtinChallenge struct {
	Answer int   `json:"a"`
	Expiry int64 `json:"e"`
}

// NewChallenge issues a signed arithmetic challenge (provider=builtin).
func (s *CaptchaService) NewChallenge() (question, token string, err error) {
	a, err := randInt(2, 19)
	if err != nil {
		return "", "", err
	}
	b, err := randInt(2, 19)
	if err != nil {
		return "", "", err
	}
	payload := builtinChallenge{Answer: a + b, Expiry: time.Now().Add(5 * time.Minute).Unix()}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	return fmt.Sprintf("%d + %d = ?", a, b), encoded + "." + s.sign(encoded), nil
}

// Verify validates the submitted captcha for an action. token/answer come
// from the request (Turnstile token, or builtin challenge token + answer).
func (s *CaptchaService) Verify(action, token, answer, remoteIP string) error {
	if !s.Required(action) {
		return nil
	}
	switch s.Provider() {
	case CaptchaProviderTurnstile:
		return s.verifyTurnstile(token, remoteIP)
	case CaptchaProviderGeeTest:
		return s.verifyGeeTest(token, remoteIP)
	case CaptchaProviderBuiltin:
		return s.verifyBuiltin(token, answer)
	default:
		return nil
	}
}

// geeetestPayload is submitted by the frontend after the user passes the
// GeeTest v4 challenge.
type geetestPayload struct {
	LotNumber  string `json:"lot_number"`
	CaptchaOut string `json:"captcha_output"`
	PassToken  string `json:"pass_token"`
	GenTime    string `json:"gen_time"`
}

// verifyGeeTest validates a GeeTest v4 result. See:
// https://docs.geetest.com/gt4/deploy/server/go
func (s *CaptchaService) verifyGeeTest(token, remoteIP string) error {
	if strings.TrimSpace(token) == "" {
		return NewValidationError("请先完成人机验证")
	}
	var payload geetestPayload
	if err := json.Unmarshal([]byte(token), &payload); err != nil {
		return NewValidationError("人机验证数据异常，请重试")
	}
	if payload.LotNumber == "" || payload.CaptchaOut == "" || payload.PassToken == "" || payload.GenTime == "" {
		return NewValidationError("人机验证未通过，请重试")
	}

	captchaID, _ := s.settings.Get(SettingGeeTestCaptchaID)
	captchaKey, _ := s.settings.Get(SettingGeeTestCaptchaKey)
	if strings.TrimSpace(captchaID) == "" || strings.TrimSpace(captchaKey) == "" {
		return errors.New("极验人机验证未正确配置（缺少 Captcha ID / Key）")
	}

	// sign_token = HMAC-SHA256(lot_number, captcha_key)
	mac := hmac.New(sha256.New, []byte(captchaKey))
	mac.Write([]byte(payload.LotNumber))
	signToken := hex.EncodeToString(mac.Sum(nil))

	form := url.Values{}
	form.Set("lot_number", payload.LotNumber)
	form.Set("captcha_output", payload.CaptchaOut)
	form.Set("pass_token", payload.PassToken)
	form.Set("gen_time", payload.GenTime)
	form.Set("sign_token", signToken)

	endpoint := "https://gcaptcha4.geetest.com/validate?captcha_id=" + url.QueryEscape(captchaID)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.PostForm(endpoint, form)
	if err != nil {
		return errors.New("人机验证服务不可用，请稍后重试")
	}
	defer resp.Body.Close()

	var result struct {
		Result string `json:"result"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return errors.New("人机验证响应异常")
	}
	if result.Result != "success" {
		return NewValidationError("人机验证未通过，请重试")
	}
	return nil
}

func (s *CaptchaService) verifyTurnstile(token, remoteIP string) error {
	if strings.TrimSpace(token) == "" {
		return NewValidationError("请先完成人机验证")
	}
	secret, _ := s.settings.Get(SettingCaptchaSecretKey)
	if strings.TrimSpace(secret) == "" {
		return errors.New("人机验证未正确配置（缺少 Secret Key）")
	}

	form := url.Values{}
	form.Set("secret", secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", form)
	if err != nil {
		return errors.New("人机验证服务不可用，请稍后重试")
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return errors.New("人机验证响应异常")
	}
	if !result.Success {
		return NewValidationError("人机验证未通过，请重试")
	}
	return nil
}

func (s *CaptchaService) verifyBuiltin(token, answer string) error {
	if strings.TrimSpace(token) == "" || strings.TrimSpace(answer) == "" {
		return NewValidationError("请完成人机验证")
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || !hmac.Equal([]byte(s.sign(parts[0])), []byte(parts[1])) {
		return NewValidationError("人机验证已失效，请刷新后重试")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return NewValidationError("人机验证已失效，请刷新后重试")
	}
	var payload builtinChallenge
	if err := json.Unmarshal(raw, &payload); err != nil {
		return NewValidationError("人机验证已失效，请刷新后重试")
	}
	if time.Now().Unix() > payload.Expiry {
		return NewValidationError("人机验证已过期，请刷新后重试")
	}
	got, err := strconv.Atoi(strings.TrimSpace(answer))
	if err != nil || got != payload.Answer {
		return NewValidationError("算题答案不正确，请重试")
	}
	return nil
}

func (s *CaptchaService) sign(payload string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte("captcha:" + payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func randInt(min, max int) (int, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max-min+1)))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()) + min, nil
}
