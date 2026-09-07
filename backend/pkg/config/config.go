package config

import (
	"os"
	"time"
)

type Config struct {
	AppEnv      string
	Port        string
	DBHost      string
	DBPort      string
	DBUser      string
	DBPassword  string
	DBName      string
	JWTSecret   string
	AccessTTL   time.Duration
	RefreshTTL  time.Duration
	FrontendURL string
}

func Load() *Config {
	return &Config{
		AppEnv:      getEnv("APP_ENV", "development"),
		Port:        getEnv("PORT", "8080"),
		DBHost:      getEnv("DB_HOST", "localhost"),
		DBPort:      getEnv("DB_PORT", "5432"),
		DBUser:      getEnv("DB_USER", "blog"),
		DBPassword:  getEnv("DB_PASSWORD", "blog_dev_password"),
		DBName:      getEnv("DB_NAME", "blog_platform"),
		JWTSecret:   getEnv("JWT_SECRET", "dev-only-secret-change-in-production"),
		AccessTTL:   15 * time.Minute,
		RefreshTTL:  7 * 24 * time.Hour,
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
	}
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
