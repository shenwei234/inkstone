package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCompareVersion(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"Beta1.14", "Beta1.15", -1},
		{"Beta1.15", "Beta1.14", 1},
		{"Beta1.14", "Beta1.14", 0},
		{"Beta1.14", "Beta1.9", 1}, // 14 > 9（禁止按字符串比较）
		{"Beta1.9", "Beta1.14", -1},
		{"v1.2.10", "v1.2.9", 1},     // 多段逐段比
		{"Beta1.0", "Beta1.0.1", -1}, // 缺段当 0
		{"", "Beta1.0", -1},
		{"Beta1.0", "", 1},
		{"", "", 0},
		{"Beta10.0", "Beta9.9", 1}, // 10 > 9
	}
	for _, c := range cases {
		if got := compareVersion(c.a, c.b); got != c.want {
			t.Errorf("compareVersion(%q, %q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestVersionNumbers(t *testing.T) {
	cases := []struct {
		in   string
		want []int
	}{
		{"Beta1.14", []int{1, 14}},
		{"v1.2.10", []int{1, 2, 10}},
		{"Beta10.0", []int{10, 0}},
		{"", nil},
		{"beta", nil},
	}
	for _, c := range cases {
		got := versionNumbers(c.in)
		if len(got) != len(c.want) {
			t.Errorf("versionNumbers(%q) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("versionNumbers(%q)[%d] = %d, want %d", c.in, i, got[i], c.want[i])
			}
		}
	}
}

func TestJoinMirror(t *testing.T) {
	got := joinMirror("https://ghfast.top/", "https://raw.githubusercontent.com/o/r/main/releases/latest.json")
	want := "https://ghfast.top/https://raw.githubusercontent.com/o/r/main/releases/latest.json"
	if got != want {
		t.Errorf("joinMirror = %q, want %q", got, want)
	}
	// 尾斜杠容错；目标 URL 的协议必须保留（ghproxy 系解析需要）
	got = joinMirror("https://gh-proxy.com", "http://x.com/a")
	if got != "https://gh-proxy.com/http://x.com/a" {
		t.Errorf("joinMirror 尾斜杠处理错误: %q", got)
	}
}

func TestManifestToRemote(t *testing.T) {
	m := UpdateManifest{
		Version:    "Beta1.16",
		ReleasedAt: "2026-09-28T00:00:00Z",
		MinVersion: "Beta1.5",
		Notes:      "更新说明",
		Images:     []ManifestImage{{Repo: "inkstone-backend", Tag: "latest", Service: "backend"}},
		Asset:      ManifestAsset{Name: "inkstone-images.tar", URL: "https://x/y.tar", SHA256: "abc", Size: 1024},
	}
	rv := manifestToRemote(&m, "https://mirror")
	if rv.Version != "Beta1.16" || rv.Size != 1024 || rv.SHA256 != "abc" || rv.Mirror != "https://mirror" || rv.MinVersion != "Beta1.5" {
		t.Errorf("manifestToRemote 字段映射错误: %+v", rv)
	}
}

func TestFetchManifestURL(t *testing.T) {
	// 合法清单
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"version":"Beta1.16","asset":{"name":"a.tar","url":"https://x/a.tar"},"images":[{"repo":"inkstone-backend","tag":"latest","service":"backend"}]}`))
	}))
	defer srv.Close()
	m, err := fetchManifestURL(srv.URL)
	if err != nil {
		t.Fatalf("fetchManifestURL 失败: %v", err)
	}
	if m.Version != "Beta1.16" || len(m.Images) != 1 {
		t.Errorf("清单解析错误: %+v", m)
	}

	// 缺少 version → 报错
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"asset":{}}`))
	}))
	defer bad.Close()
	if _, err := fetchManifestURL(bad.URL); err == nil {
		t.Error("缺少 version 的清单应当报错")
	}

	// 非 JSON → 报错
	notJSON := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<html>hello`))
	}))
	defer notJSON.Close()
	if _, err := fetchManifestURL(notJSON.URL); err == nil {
		t.Error("非 JSON 响应应当报错")
	}
}

func TestRankSources(t *testing.T) {
	fast := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer fast.Close()
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer slow.Close()
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer broken.Close()

	ranked := rankSources([]string{slow.URL, broken.URL, fast.URL}, 3*time.Second)
	if len(ranked) != 3 {
		t.Fatalf("rankSources 返回数量错误: %d", len(ranked))
	}
	if ranked[0].url != fast.URL {
		t.Errorf("最快源应排第一，实际 %q", ranked[0].url)
	}
	if ranked[1].url != slow.URL {
		t.Errorf("慢源应排第二，实际 %q", ranked[1].url)
	}
	if !ranked[2].failed {
		t.Errorf("失败源应排最后，实际 %+v", ranked[2])
	}
}

func TestProbeLatency(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ok.Close()
	if got := probeLatency(ok.URL, 2*time.Second); got < 0 {
		t.Errorf("probeLatency(可用源) = %d, 应 >= 0", got)
	}
	// 连接被拒的端口 → -1
	if got := probeLatency("http://127.0.0.1:1/", time.Second); got != -1 {
		t.Errorf("probeLatency(不可达) = %d, want -1", got)
	}
}

func TestProgressWriter(t *testing.T) {
	var pcts []int
	w := &progressWriter{total: 1000, onProgress: func(p int) { pcts = append(pcts, p) }}
	for i := 0; i < 10; i++ {
		if _, err := w.Write(make([]byte, 50)); err != nil {
			t.Fatal(err)
		}
	}
	if len(pcts) != 10 || pcts[0] != 5 || pcts[9] != 50 {
		t.Errorf("进度回调节流异常: %v", pcts)
	}
	// 相同百分比不重复回调
	before := len(pcts)
	w.Write(make([]byte, 1)) // 写入 1 字节，pct 仍为 50（整数除法 501/1000=50 不大于 50）
	if len(pcts) != before {
		t.Errorf("相同百分比不应重复回调: %v", pcts)
	}
}

func TestManifestJSONRoundTrip(t *testing.T) {
	raw := `{
		"version": "Beta1.16",
		"released_at": "2026-09-28T10:00:00Z",
		"min_version": "Beta1.5",
		"notes": "说明",
		"images": [
			{"repo": "inkstone-backend", "tag": "latest", "service": "backend"},
			{"repo": "inkstone-frontend", "tag": "latest", "service": "frontend"}
		],
		"asset": {"name": "inkstone-images.tar", "url": "https://github.com/o/r/releases/download/Beta1.16/inkstone-images.tar", "sha256": "deadbeef", "size": 2048}
	}`
	var m UpdateManifest
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatalf("清单解析失败: %v", err)
	}
	if m.Version != "Beta1.16" || len(m.Images) != 2 || m.Asset.Size != 2048 {
		t.Errorf("清单字段错误: %+v", m)
	}
	if m.Images[0].imageRef() != "inkstone-backend:latest" {
		t.Errorf("imageRef 错误: %s", m.Images[0].imageRef())
	}
}

func TestDockerClientUnavailable(t *testing.T) {
	c := NewDockerClient("")
	if err := c.Available(); err == nil {
		t.Error("空 socket 路径应报错")
	}
	c2 := NewDockerClient("/nonexistent/docker.sock")
	if err := c2.Available(); err == nil {
		t.Error("不存在的 socket 应报错")
	}
}

func TestValidateUpdateSettings(t *testing.T) {
	// 合法值
	if err := validateUpdateSettings(map[string]any{
		SettingUpdateRepo:          "shenwei234/inkstone",
		SettingUpdateCheckInterval: float64(30),
		SettingUpdateMirrorURLs:    []any{"https://ghfast.top/", ""},
	}); err != nil {
		t.Errorf("合法设置应通过: %v", err)
	}
	// 非法仓库（路径注入尝试）
	for _, bad := range []string{"../evil", "owner/", "a b/c", "owner/repo/x", ""} {
		if err := validateUpdateSettings(map[string]any{SettingUpdateRepo: bad}); err == nil {
			t.Errorf("非法仓库 %q 应被拒绝", bad)
		}
	}
	// 间隔越界
	for _, bad := range []float64{0, -1, 1441} {
		if err := validateUpdateSettings(map[string]any{SettingUpdateCheckInterval: bad}); err == nil {
			t.Errorf("间隔 %v 应被拒绝", bad)
		}
	}
	// 非 http(s) 加速源
	if err := validateUpdateSettings(map[string]any{
		SettingUpdateMirrorURLs: []any{"ftp://x", "not-a-url"},
	}); err == nil {
		t.Error("非 http 加速源应被拒绝")
	}
}

func TestTryBeginUpdateMutex(t *testing.T) {
	s := &UpdateService{}
	if !s.tryBeginUpdate() {
		t.Fatal("首次应获取成功")
	}
	if s.tryBeginUpdate() {
		t.Error("运行中第二次应被拒绝")
	}
	s.endUpdate()
	if !s.tryBeginUpdate() {
		t.Error("释放后应可重新获取")
	}
	s.endUpdate()
}

func TestDownloadFileResume(t *testing.T) {
	content := bytes.Repeat([]byte("inkstone-binary-"), 200) // ~3200 字节
	want := sha256hex(content)

	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rangeHdr := r.Header.Get("Range")
		if rangeHdr != "" {
			var n int64
			if _, err := fmt.Sscanf(rangeHdr, "bytes=%d-", &n); err != nil || n < 0 || n >= int64(len(content)) {
				w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
				return
			}
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", n, len(content)-1, len(content)))
			w.WriteHeader(http.StatusPartialContent)
			w.Write(content[n:])
			return
		}
		w.Write(content)
	}))
	defer srv.Close()

	dir := t.TempDir()
	dest := filepath.Join(dir, "part.tar")

	// 1) 全量下载
	sha, err := downloadFile(srv.URL, dest, int64(len(content)), nil)
	if err != nil {
		t.Fatalf("全量下载失败: %v", err)
	}
	if sha != want {
		t.Errorf("全量下载 SHA256 不匹配")
	}

	// 2) 模拟中断：截断到 64 字节边界外（非对齐，验证续传哈希拼接）
	half := content[:1300]
	if err := os.WriteFile(dest, half, 0o644); err != nil {
		t.Fatal(err)
	}
	var lastPct int
	sha2, err := downloadFile(srv.URL, dest, int64(len(content)), func(p int) { lastPct = p })
	if err != nil {
		t.Fatalf("续传下载失败: %v", err)
	}
	if sha2 != want {
		t.Errorf("续传后 SHA256 不匹配（哈希拼接错误）")
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Errorf("续传后文件内容不完整：%d != %d 字节", len(got), len(content))
	}
	if lastPct < 100 {
		t.Errorf("续传进度未到 100：%d", lastPct)
	}

	// 3) 服务端不支持 Range 时应从头重下（删除已有残file 由 downloadFile 自行处理）
	noRange := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(content) // 忽略 Range 头，始终 200 全量
	}))
	defer noRange.Close()
	sha3, err := downloadFile(noRange.URL, dest, int64(len(content)), nil)
	if err != nil {
		t.Fatalf("无 Range 支持下载失败: %v", err)
	}
	if sha3 != want {
		t.Errorf("无 Range 支持的服务器 SHA256 不匹配（应从头重下）")
	}
}

func sha256hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
