package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
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

func TestRankSourcesBySpeed(t *testing.T) {
	chunk := make([]byte, 256<<10)
	// 快源：立即写 4MB+
	fast := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for i := 0; i < 20; i++ {
			w.Write(chunk)
		}
	}))
	defer fast.Close()
	// 慢源：每 64KB 停 40ms（4MB ≈ 2.5s，明显慢于快源）
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		small := chunk[:64<<10]
		for i := 0; i < 40; i++ {
			w.Write(small)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			time.Sleep(40 * time.Millisecond)
		}
	}))
	defer slow.Close()
	// 坏源：503
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer broken.Close()

	ranked := rankSourcesBySpeed([]string{slow.URL, broken.URL, fast.URL}, 20*time.Second, 4<<20)
	if len(ranked) != 3 {
		t.Fatalf("返回数量错误: %d", len(ranked))
	}
	if ranked[0].url != fast.URL {
		t.Errorf("最快源应排第一，实际 %q", ranked[0].url)
	}
	if ranked[1].url != slow.URL {
		t.Errorf("慢源应排第二，实际 %q", ranked[1].url)
	}
	if ranked[2].bytesPerSec != 0 {
		t.Errorf("坏源应排最后且速度为 0，实际 %+v", ranked[2])
	}
	if ranked[0].bytesPerSec <= ranked[1].bytesPerSec {
		t.Errorf("排序不符合带宽降序: %d <= %d", ranked[0].bytesPerSec, ranked[1].bytesPerSec)
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

func TestIdleTimeoutReader(t *testing.T) {
	// 正常持续有数据的读取不受影响
	fast := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(bytes.Repeat([]byte("x"), 4096))
	}))
	defer fast.Close()
	resp, err := http.Get(fast.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body := newIdleTimeoutReader(resp.Body, 500*time.Millisecond)
	buf := make([]byte, 4096)
	n, err := body.Read(buf)
	// HTTP body 允许 (n>0, io.EOF) 合并返回，这里都算正常读到
	if n != 4096 || (err != nil && err != io.EOF) {
		t.Errorf("快速响应不应误超时: n=%d err=%v", n, err)
	}

	// 中途断流：超过 idle 时长无数据应返回超时错误
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("hello"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		time.Sleep(1500 * time.Millisecond) // 超过测试用 300ms 空闲超时
		w.Write([]byte("world"))
	}))
	defer slow.Close()
	resp2, err := http.Get(slow.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	body2 := newIdleTimeoutReader(resp2.Body, 300*time.Millisecond)
	buf2 := make([]byte, 16)
	if _, err := body2.Read(buf2); err != nil {
		t.Fatalf("首包应成功: %v", err)
	}
	start := time.Now()
	if _, err := body2.Read(buf2); err == nil {
		t.Error("断流后应返回超时错误")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("超时触发太慢: %v", elapsed)
	}
}

func TestNormalizeApplyURL(t *testing.T) {
	cases := map[string]string{
		"https://Example.COM/":     "https://example.com",
		"HTTPS://example.com":      "https://example.com",
		"http://example.com/blog/": "http://example.com/blog",
		"https://a.cn/b/c":         "https://a.cn/b/c",
		"https://a.cn/":            "https://a.cn",
	}
	for in, want := range cases {
		if got := normalizeApplyURL(in); got != want {
			t.Errorf("normalizeApplyURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFriendApplySettingDefault(t *testing.T) {
	if v, ok := settingDefaults[SettingFriendApplyEnabled]; !ok || v != "true" {
		t.Errorf("friend_apply_enabled 默认应为 true，得到 %q", v)
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

func TestUpdateSettingDefaults(t *testing.T) {
	// 每个 update_* 设置常量都必须有默认值（否则 All() 返回空串，行为不可预期）
	for _, k := range []string{
		SettingUpdateEnabled, SettingUpdateCheckInterval, SettingUpdateMirrorURLs, SettingUpdateRepo,
	} {
		if _, ok := settingDefaults[k]; !ok {
			t.Errorf("设置项 %s 缺少默认值", k)
		}
		if jsonSettingKeys[k] != (k == SettingUpdateMirrorURLs) {
			t.Errorf("设置项 %s 的 jsonSettingKeys 登记异常", k)
		}
	}
	if settingDefaults[SettingUpdateRepo] != DefaultUpdateRepo {
		t.Errorf("默认仓库应为 %s", DefaultUpdateRepo)
	}
}

func TestFormatBytes(t *testing.T) {
	cases := map[uint64]string{
		0: "0 B", 1023: "1023 B", 1024: "1.0 KiB", 1536: "1.5 KiB",
		1 << 20: "1.0 MiB", 512 << 20: "512.0 MiB",
	}
	for in, want := range cases {
		if got := formatBytes(in); got != want {
			t.Errorf("formatBytes(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestValidateManifestSecurity(t *testing.T) {
	ok := UpdateManifest{
		Version: "Beta1.17",
		Images: []ManifestImage{
			{Repo: "inkstone-backend", Tag: "latest", Service: "backend"},
			{Repo: "inkstone-frontend", Tag: "latest", Service: "frontend"},
		},
		Asset: ManifestAsset{Name: "inkstone-images.tar", URL: "https://github.com/o/r/releases/download/Beta1.17/a.tar", SHA256: "abc", Size: 1024},
	}
	if err := validateManifest(&ok); err != nil {
		t.Errorf("合法清单应通过: %v", err)
	}

	// http 明文下载地址必须拒绝
	httpOne := ok
	httpOne.Asset.URL = "http://github.com/o/r/a.tar"
	if err := validateManifest(&httpOne); err == nil {
		t.Error("http 下载地址应被拒绝")
	}

	// 缺失 SHA256 必须拒绝（防篡改替换）
	noSHA := ok
	noSHA.Asset.SHA256 = ""
	if err := validateManifest(&noSHA); err == nil {
		t.Error("缺少 SHA256 应被拒绝")
	}

	// 非白名单镜像名必须拒绝
	evil := ok
	evil.Images = append(evil.Images, ManifestImage{Repo: "malicious/image", Tag: "latest", Service: "backend"})
	if err := validateManifest(&evil); err == nil {
		t.Error("白名单外镜像应被拒绝")
	}

	// 非 latest tag 必须拒绝
	badTag := ok
	badTag.Images = []ManifestImage{{Repo: "inkstone-backend", Tag: "evil", Service: "backend"}}
	if err := validateManifest(&badTag); err == nil {
		t.Error("非 latest tag 应被拒绝")
	}

	// 缺 backend 定义必须拒绝
	noBackend := ok
	noBackend.Images = []ManifestImage{{Repo: "inkstone-frontend", Tag: "latest", Service: "frontend"}}
	if err := validateManifest(&noBackend); err == nil {
		t.Error("缺少 backend 镜像应被拒绝")
	}
}

func TestValidateUpdateSettingsHTTPSOnly(t *testing.T) {
	// 加速源只允许 https
	if err := validateUpdateSettings(map[string]any{
		SettingUpdateMirrorURLs: []any{"http://ghfast.top/"},
	}); err == nil {
		t.Error("http 加速源应被拒绝")
	}
	if err := validateUpdateSettings(map[string]any{
		SettingUpdateMirrorURLs: []any{"https://ghfast.top/"},
	}); err != nil {
		t.Errorf("https 加速源应通过: %v", err)
	}
}

func TestToStringSlice(t *testing.T) {
	if got := toStringSlice(nil); got != nil {
		t.Errorf("nil 应返回 nil，得到 %v", got)
	}
	got := toStringSlice([]any{"a", 1, "b"})
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Errorf("非字符串元素应被过滤，得到 %v", got)
	}
}

func TestSortMirrorLatency(t *testing.T) {
	in := []MirrorLatency{
		{URL: "a", Latency: 300},
		{URL: "b", Latency: -1},
		{URL: "c", Latency: 50},
		{URL: "d", Latency: -1},
		{URL: "e", Latency: 120},
	}
	sortMirrorLatency(in)
	want := []string{"c", "e", "a", "b", "d"}
	for i, w := range want {
		if in[i].URL != w {
			t.Fatalf("排序结果 %v, 期望顺序 %v", in, want)
		}
	}
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
