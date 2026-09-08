package service

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/blog-platform/backend/internal/model"
	"gorm.io/gorm"
)

// Setting definitions: key -> description of accepted values.
const (
	SettingAllowRegistration = "allow_registration" // "true"/"false"
	SettingSiteName          = "site_name"          // string
	SettingSiteDescription   = "site_description"   // string
	SettingICP               = "site_icp"           // string
	SettingSMTPHost          = "smtp_host"
	SettingSMTPPort          = "smtp_port" // string digits
	SettingSMTPUser          = "smtp_user"
	SettingSMTPPass          = "smtp_pass"
	SettingSMTPFrom          = "smtp_from" // From header, e.g. "Blog <no-reply@x.com>"
)

var settingDefaults = map[string]string{
	SettingAllowRegistration: "true",
	SettingSiteName:          "Blog 平台",
	SettingSiteDescription:   "多用户博客平台",
	SettingICP:               "",
	SettingSMTPHost:          "",
	SettingSMTPPort:          "465",
	SettingSMTPUser:          "",
	SettingSMTPPass:          "",
	SettingSMTPFrom:          "",
}

// maskKeys are never exposed through the public API.
var maskKeys = map[string]bool{
	SettingSMTPPass: true,
}

type SettingsService struct {
	db *gorm.DB

	mu        sync.RWMutex
	cache     map[string]string
	cacheTime time.Time
}

func NewSettingsService(db *gorm.DB) *SettingsService {
	return &SettingsService{db: db}
}

// All returns every known setting, applying defaults for unset keys.
func (s *SettingsService) All() (map[string]string, error) {
	s.mu.RLock()
	fresh := time.Since(s.cacheTime) < 30*time.Second
	cache := s.cache
	s.mu.RUnlock()

	if fresh && cache != nil {
		return copyMap(cache), nil
	}

	rows := []model.Setting{}
	if err := s.db.Find(&rows).Error; err != nil {
		return nil, err
	}
	values := make(map[string]string, len(settingDefaults))
	for k, v := range settingDefaults {
		values[k] = v
	}
	for _, row := range rows {
		values[row.Key] = row.Value
	}

	s.mu.Lock()
	s.cache = values
	s.cacheTime = time.Now()
	s.mu.Unlock()

	return copyMap(values), nil
}

// Get returns one setting value (with default fallback).
func (s *SettingsService) Get(key string) (string, error) {
	all, err := s.All()
	if err != nil {
		return "", err
	}
	return all[key], nil
}

// AllowRegistration reports whether open registration is enabled.
func (s *SettingsService) AllowRegistration() bool {
	v, err := s.Get(SettingAllowRegistration)
	if err != nil {
		return true
	}
	return v == "true"
}

// Update persists a partial settings object (JSON body) and invalidates cache.
// Empty smtp_pass means "keep the stored password".
func (s *SettingsService) Update(payload map[string]any) error {
	for key, raw := range payload {
		if _, known := settingDefaults[key]; !known {
			continue
		}
		value, err := marshalValue(raw)
		if err != nil {
			return NewValidationError("设置项 " + key + " 值无效")
		}
		if key == SettingSMTPPass && value == "" {
			continue
		}
		setting := model.Setting{Key: key, Value: value, UpdatedAt: time.Now()}
		if err := s.db.Save(&setting).Error; err != nil {
			return err
		}
	}
	s.mu.Lock()
	s.cacheTime = time.Time{}
	s.mu.Unlock()
	return nil
}

// Public returns non-sensitive settings for the frontend.
func (s *SettingsService) Public() (map[string]any, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}
	out := make(map[string]any, len(all))
	for k, v := range all {
		if maskKeys[k] {
			continue
		}
		if k == SettingAllowRegistration {
			out[k] = v == "true"
			continue
		}
		out[k] = v
	}
	return out, nil
}

// AdminView returns settings for the admin console. The SMTP password is
// never returned; callers rely on smtp_pass_set to know if one is stored.
func (s *SettingsService) AdminView() (map[string]any, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}
	out := make(map[string]any, len(all))
	for k, v := range all {
		if k == SettingSMTPPass {
			if v != "" {
				out["smtp_pass_set"] = true
			} else {
				out["smtp_pass_set"] = false
			}
			continue
		}
		if k == SettingAllowRegistration {
			out[k] = v == "true"
			continue
		}
		out[k] = v
	}
	return out, nil
}

func copyMap(src map[string]string) map[string]string {
	dst := make(map[string]string, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func marshalValue(raw any) (string, error) {
	switch v := raw.(type) {
	case string:
		return v, nil
	case bool:
		if v {
			return "true", nil
		}
		return "false", nil
	default:
		b, err := json.Marshal(raw)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}
}
