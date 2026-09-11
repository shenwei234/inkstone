package config

import (
	"os"
	"time"
)

type Config struct {
	AppEnv       string
	Port         string
	DBHost       string
	DBPort       string
	DBUser       string
	DBPassword   string
	DBName       string
	JWTSecret    string
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
	FrontendURL  string
	PublicAPIURL string
	UploadDir    string
}

func Load() *Config {
	return &Config{
		AppEnv:       getEnv("APP_ENV", "development"),
		Port:         getEnv("PORT", "8080"),
		DBHost:       getEnv("DB_HOST", "localhost"),
		DBPort:       getEnv("DB_PORT", "5432"),
		DBUser:       getEnv("DB_USER", "blog"),
		DBPassword:   getEnv("DB_PASSWORD", "blog_dev_password"),
		DBName:       getEnv("DB_NAME", "blog_platform"),
		JWTSecret:    getEnv("JWT_SECRET", "dev-only-secret-change-in-production"),
		AccessTTL:    15 * time.Minute,
		RefreshTTL:   7 * 24 * time.Hour,
		FrontendURL:  getEnv("FRONTEND_URL", "http://localhost:3000"),
		PublicAPIURL: getEnv("PUBLIC_API_URL", ""),
		UploadDir:    getEnv("UPLOAD_DIR", "./data/uploads"),
	}
}

// AbsoluteUploadBase returns the public base URL for serving uploaded files.
// Empty PublicAPIURL means the API is served same-origin (reverse proxy), so
// relative URLs are returned.
func (c *Config) AbsoluteUploadBase() string {
	if c.PublicAPIURL != "" {
		return c.PublicAPIURL
	}
	if c.IsProduction() {
		return ""
	}
	return "http://localhost:" + c.Port
}

func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
