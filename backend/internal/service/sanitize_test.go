package service

import (
	"strings"
	"testing"
)

func TestSanitizeHTML(t *testing.T) {
	danger := `<p onclick="alert(1)">hello <script>alert(2)</script><img src=x onerror=alert(3)> <a href="javascript:alert(4)">link</a></p>
	<pre><code>if (a < b) { console.log(1); }</code></pre>`
	got := SanitizeHTML(danger)
	if strings.Contains(got, "<script") {
		t.Fatalf("script 未被移除: %s", got)
	}
	if strings.Contains(got, "onclick") || strings.Contains(got, "onerror") {
		t.Fatalf("事件属性未被移除: %s", got)
	}
	if strings.Contains(got, "javascript:") {
		t.Fatalf("javascript: 链接未被移除: %s", got)
	}
	// 合法的排版标签应保留
	for _, keep := range []string{"<p>", "<code>", "<pre>"} {
		if !strings.Contains(got, keep) {
			t.Fatalf("合法标签被误删 (%s): %s", keep, got)
		}
	}
	t.Logf("sanitized ok: %s", got)
}
