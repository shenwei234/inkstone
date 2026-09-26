package service

import (
	"strings"
	"testing"
	"time"
)

func newTestAgent(t *testing.T) *UpdateAgent {
	t.Helper()
	s := &SettingsService{cache: map[string]string{}, cacheTime: time.Now()}
	for k, v := range settingDefaults {
		s.cache[k] = v
	}
	return NewUpdateAgent(s, "https://blog.example.com")
}

func TestUpdateAgentConfigDefaults(t *testing.T) {
	a := newTestAgent(t)
	cfg := a.Config()
	if cfg.ServerURL != "" || cfg.TokenSet || cfg.Configured {
		t.Fatalf("默认应未配置: %+v", cfg)
	}
	if cfg.RepoDir != "/opt/inkstone-images" {
		t.Fatalf("默认仓库目录错误: %s", cfg.RepoDir)
	}
	if cfg.ComposeFile != "docker-compose.offline.yml" {
		t.Fatalf("默认编排文件名错误: %s", cfg.ComposeFile)
	}
	if !cfg.Auto {
		t.Fatal("默认应开启自动更新")
	}
}

func TestBuildUpdateConfigPayload(t *testing.T) {
	payload, err := buildUpdateConfigPayload(UpdateConfigInput{
		ServerURL:   "https://update.example.com/",
		Token:       "inkstone-test-token",
		Auto:        false,
		RepoDir:     "/opt/images",
		ComposeFile: "",
	})
	if err != nil {
		t.Fatalf("构建 payload 失败: %v", err)
	}
	if payload[SettingUpdateServerURL] != "https://update.example.com" { // 自动去掉尾部斜杠
		t.Fatalf("服务地址应去掉尾斜杠: %v", payload[SettingUpdateServerURL])
	}
	if payload[SettingUpdateComposeFile] != "docker-compose.offline.yml" {
		t.Fatalf("空编排名应回退默认值: %v", payload[SettingUpdateComposeFile])
	}
	if payload[SettingUpdateToken] != "inkstone-test-token" {
		t.Fatalf("令牌应写入: %v", payload[SettingUpdateToken])
	}

	// 令牌留空 = 不下发（settings 敏感字段机制保持原值）
	payload, err = buildUpdateConfigPayload(UpdateConfigInput{ServerURL: "https://x.com", RepoDir: "/opt/images"})
	if err != nil {
		t.Fatalf("构建 payload 失败: %v", err)
	}
	if _, ok := payload[SettingUpdateToken]; ok {
		t.Fatal("空令牌不应出现在 payload 中")
	}
}

func TestUpdateAgentSaveConfigValidation(t *testing.T) {
	if _, err := buildUpdateConfigPayload(UpdateConfigInput{ServerURL: "ftp://x", Token: "t", RepoDir: "/opt/images"}); err == nil {
		t.Fatal("非 http 地址应报错")
	}
	if _, err := buildUpdateConfigPayload(UpdateConfigInput{ServerURL: "https://x.com", Token: "t"}); err == nil {
		t.Fatal("空仓库目录应报错")
	}
	// 服务地址允许为空（仅保存仓库路径等其它配置）
	if _, err := buildUpdateConfigPayload(UpdateConfigInput{RepoDir: "/opt/images"}); err != nil {
		t.Fatalf("服务地址为空应允许: %v", err)
	}
}

func TestUpdateAgentCheckWithoutConfig(t *testing.T) {
	a := newTestAgent(t)
	if _, err := a.CheckOnce(); err == nil {
		t.Fatal("未配置时应返回错误")
	}
}

func TestUpdateAgentStatusIdle(t *testing.T) {
	a := newTestAgent(t)
	st := a.Status()
	if st.Phase != UpdateIdle || st.Running || st.Task != nil {
		t.Fatalf("初始状态应为 idle: %+v", st)
	}
	if st.Message != "就绪" {
		t.Fatalf("消息应为就绪: %s", st.Message)
	}
	if st.StartedAt != "" || st.FinishedAt != "" {
		t.Fatalf("空闲态不应有时间戳: %+v", st)
	}
}

func TestExtractErrorMessage(t *testing.T) {
	if got := extractError([]byte(`{"error":"令牌无效"}`)); got != "令牌无效" {
		t.Fatalf("应提取 error 字段: %s", got)
	}
	if got := extractError([]byte(`plain`)); got != "plain" {
		t.Fatalf("应回退原文: %s", got)
	}
}

func TestBetaVersionBaseline(t *testing.T) {
	if !strings.Contains(AppVersion, "Beta") {
		t.Fatalf("当前版本应为 Beta 基线: %s", AppVersion)
	}
	entries := ChangelogList()
	if len(entries) == 0 || entries[0].Version != AppVersion {
		t.Fatalf("更新日志首条应为当前版本 %s: %+v", AppVersion, entries)
	}
}
