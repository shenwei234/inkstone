package service

import (
	"os"
	"path/filepath"
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
	return NewUpdateAgent(s, "https://blog.example.com", t.TempDir())
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
	// 默认备用源：宿主机裸仓库路径（容器内 origin 不可用时的回退）
	if len(cfg.MirrorURLs) != 1 || cfg.MirrorURLs[0] != "file:///srv/git/inkstone-images.git" {
		t.Fatalf("默认备用镜像仓库地址错误: %v", cfg.MirrorURLs)
	}
	if !cfg.Auto {
		t.Fatal("默认应开启自动更新")
	}
}

func TestSplitMirrorURLs(t *testing.T) {
	got := splitMirrorURLs(" file:///a.git ; file:///b.git,,\n file:///a.git ; ")
	want := []string{"file:///a.git", "file:///b.git"}
	if len(got) != len(want) {
		t.Fatalf("解析结果应为去重去空: %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("第 %d 个地址错误: %q != %q", i, got[i], want[i])
		}
	}
	if len(splitMirrorURLs("  ")) != 0 {
		t.Fatal("空字符串应返回空列表")
	}
}

func TestVersionPattern(t *testing.T) {
	for _, ok := range []string{"Beta1.9", "v2.0", "Beta_1-9"} {
		if !versionPattern.MatchString(ok) {
			t.Fatalf("合法版本号应通过: %s", ok)
		}
	}
	for _, bad := range []string{"Beta1.9; rm -rf /", "a b", "../etc", ""} {
		if versionPattern.MatchString(bad) {
			t.Fatalf("非法版本号应被拒绝: %q", bad)
		}
	}
}

func TestTagWithSuffix(t *testing.T) {
	if got := tagWithSuffix("inkstone-backend:latest", "rollback-x"); got != "inkstone-backend:rollback-x" {
		t.Fatalf("回滚 tag 错误: %s", got)
	}
	if got := tagWithSuffix("inkstone-backend", "rollback-x"); got != "inkstone-backend:rollback-x" {
		t.Fatalf("无 tag 镜像名处理错误: %s", got)
	}
}

func TestShortSHA(t *testing.T) {
	if got := shortSHA("abcdef1234567890"); got != "abcdef123456" {
		t.Fatalf("sha 截断错误: %s", got)
	}
	if got := shortID("sha256:abcdef1234567890"); got != "abcdef123456" {
		t.Fatalf("镜像 ID 截断错误: %s", got)
	}
}

func TestPendingVerificationRoundtrip(t *testing.T) {
	dir := t.TempDir()
	if p, err := readPendingVerification(dir); err != nil || p != nil {
		t.Fatalf("无文件时应返回 nil, nil: %v %v", p, err)
	}
	want := pendingVerification{
		Version:     "Beta1.9",
		RollbackTag: "rollback-20260926-140000",
		RepoDir:     "/opt/inkstone-images/repo",
		ComposeFile: "docker-compose.offline.yml",
		CreatedAt:   time.Now().Truncate(time.Second),
	}
	if err := writePendingVerification(dir, want); err != nil {
		t.Fatalf("写入待验证状态失败: %v", err)
	}
	got, err := readPendingVerification(dir)
	if err != nil {
		t.Fatalf("读取失败: %v", err)
	}
	if got == nil || got.Version != want.Version || got.RollbackTag != want.RollbackTag {
		t.Fatalf("内容不一致: %+v", got)
	}
	if _, err := os.Stat(filepath.Join(dir, pendingVerifyFile)); err != nil {
		t.Fatalf("状态文件应存在: %v", err)
	}
	if err := clearPendingVerification(dir); err != nil {
		t.Fatalf("清理失败: %v", err)
	}
	if p, err := readPendingVerification(dir); err != nil || p != nil {
		t.Fatalf("清理后应回到 nil: %v %v", p, err)
	}
	// 重复清理不报错
	if err := clearPendingVerification(dir); err != nil {
		t.Fatalf("重复清理应幂等: %v", err)
	}
}

func TestSha256File(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "x.bin")
	if err := os.WriteFile(p, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	sum, err := sha256File(p)
	if err != nil {
		t.Fatalf("计算摘要失败: %v", err)
	}
	// printf hello | sha256sum
	if sum != "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" {
		t.Fatalf("sha256 不正确: %s", sum)
	}
	if statFileSize(p) != 5 {
		t.Fatalf("文件大小读取错误: %d", statFileSize(p))
	}
	if _, err := sha256File(filepath.Join(dir, "missing")); err == nil {
		t.Fatal("不存在的文件应报错")
	}
}

func TestIsGitRepo(t *testing.T) {
	dir := t.TempDir()
	if isGitRepo(dir) {
		t.Fatal("空目录不应判定为 git 仓库")
	}
	if err := os.Mkdir(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !isGitRepo(dir) {
		t.Fatal("含 .git 目录应判定为 git 仓库")
	}
}

func TestDeployedCommitRoundtrip(t *testing.T) {
	a := newTestAgent(t)
	if got := a.readDeployedCommit(); got != "" {
		t.Fatalf("初始应无记录: %s", got)
	}
	if err := a.writeDeployedCommit("d8f8070abcdef0123456789abcdef012345678a"); err != nil {
		t.Fatalf("写入失败: %v", err)
	}
	if got := a.readDeployedCommit(); got != "d8f8070abcdef0123456789abcdef012345678a" {
		t.Fatalf("读取不一致: %s", got)
	}
	// 覆盖写
	if err := a.writeDeployedCommit("11d51b3abcdef0123456789abcdef012345678a"); err != nil {
		t.Fatalf("覆盖写失败: %v", err)
	}
	if got := a.readDeployedCommit(); got != "11d51b3abcdef0123456789abcdef012345678a" {
		t.Fatalf("覆盖写未生效: %s", got)
	}
	if err := a.writeDeployedCommit("  "); err == nil {
		t.Fatal("空 sha 应报错")
	}
}

func TestUpdateAgentAutoUpdateDefaults(t *testing.T) {
	a := newTestAgent(t)
	cfg := a.Config()
	// 标准流程 = 推送后台发布后实例自动更新
	if cfg.Auto != true {
		t.Fatal("自动更新默认应开启")
	}
	payload, err := buildUpdateConfigPayload(UpdateConfigInput{
		ServerURL: "https://x.com", Token: "t", RepoDir: "/opt/images",
		MirrorURLs: "file:///a.git",
	})
	if err != nil {
		t.Fatalf("构建 payload 失败: %v", err)
	}
	if payload[SettingUpdateMirrorURLs] != "file:///a.git" {
		t.Fatalf("备用源未写入 payload: %v", payload)
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
