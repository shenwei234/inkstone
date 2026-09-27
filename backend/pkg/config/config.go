package config

import (
	"os"
	"strings"
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
	FilesDir     string
	DockerHost   string
	UpdateRepo   string
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
		FilesDir:     getEnv("FILES_DIR", "./data/files"),
		// DOCKER_HOST 为空时默认挂载在标准路径的 unix socket（compose 挂载场景）
		DockerHost: getEnv("DOCKER_HOST", "unix:///var/run/docker.sock"),
		// 发布仓库 owner/repo（更新推送后台发布版本清单的 GitHub 仓库）
		UpdateRepo: getEnv("UPDATE_REPO", "shenwei234/inkstone"),
	}
}

// DockerSocketPath 返回 docker daemon 的 unix socket 路径。
// 仅支持 unix:// 形式；TCP 形式（tcp://host:port）不适用于自动更新。
func (c *Config) DockerSocketPath() string {
	if strings.HasPrefix(c.DockerHost, "unix://") {
		return strings.TrimPrefix(c.DockerHost, "unix://")
	}
	if strings.HasPrefix(c.DockerHost, "/") {
		return c.DockerHost
	}
	return c.DockerHost
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
