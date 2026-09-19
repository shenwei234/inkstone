package service

import (
	"strings"
	"testing"
)

func TestUpdateRunnerStartWithoutScript(t *testing.T) {
	// 用一个空的 runner（settings=nil，脚本路径取默认值）验证「脚本不存在时报可读错误」。
	s := &UpdateRunner{phase: UpdateIdle, logs: []string{}}
	err := s.Start()
	if err == nil {
		t.Fatalf("期望因脚本不存在而报错，却返回 nil")
	}
	if !strings.Contains(err.Error(), "未检测到更新脚本") {
		t.Fatalf("错误信息不符合预期: %v", err)
	}
}

func TestUpdateScriptTemplateIsBash(t *testing.T) {
	if !strings.HasPrefix(UpdateScriptTemplate, "#!/usr/bin/env bash") {
		t.Fatalf("脚本模板应以 bash shebang 开头")
	}
	for _, key := range []string{"docker load", "docker compose", "offline"} {
		if !strings.Contains(UpdateScriptTemplate, key) {
			t.Fatalf("脚本模板应包含 %q", key)
		}
	}
}
