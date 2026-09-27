package service

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// dockerAPIVersion 固定使用 API v1.43（Docker 20.10+ 均兼容），避免依赖 /version 探测。
const dockerAPIVersion = "v1.43"

// dockerMaxRead 单次响应读取上限（images/json 在镜像多的服务器上可能数 MB）。
const dockerMaxRead = 32 << 20

// DockerClient 是最小化的 Docker Engine API 客户端（经 unix socket）。
// 只覆盖自动更新所需：镜像加载/查询/tag、容器查询/检查/重建。
type DockerClient struct {
	socketPath string
	http       *http.Client
}

// NewDockerClient 创建客户端。socketPath 为空时所有请求都会失败（未挂载 docker.sock）。
func NewDockerClient(socketPath string) *DockerClient {
	transport := &http.Transport{
		// 所有请求都打到同一个 unix socket
		DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
			if socketPath == "" {
				return nil, fmt.Errorf("未挂载 Docker 套接字")
			}
			return net.DialTimeout("unix", socketPath, 10*time.Second)
		},
		MaxIdleConns:          4,
		IdleConnTimeout:       90 * time.Second,
		ResponseHeaderTimeout: 120 * time.Second,
	}
	return &DockerClient{
		socketPath: socketPath,
		http:       &http.Client{Transport: transport},
	}
}

// Available 检测 docker.sock 是否可用。
func (c *DockerClient) Available() error {
	if c.socketPath == "" {
		return fmt.Errorf("未配置 Docker 套接字")
	}
	if _, err := os.Stat(c.socketPath); err != nil {
		return fmt.Errorf("Docker 套接字不存在：%s", c.socketPath)
	}
	resp, err := c.do("GET", "/_ping", nil, nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Docker 守护进程无响应")
	}
	return nil
}

// dockerError 解析 Docker API 的错误响应。
type dockerError struct {
	Message string `json:"message"`
}

func (c *DockerClient) do(method, path string, query map[string]string, body io.Reader) (*http.Response, error) {
	return c.doWithHeaders(method, path, query, body, nil)
}

// doWithHeaders 同 do，可附加自定义请求头（如 docker load 的 Content-Type）。
func (c *DockerClient) doWithHeaders(method, path string, query map[string]string, body io.Reader, headers map[string]string) (*http.Response, error) {
	url := "http://docker" + "/" + dockerAPIVersion + path
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	for k, v := range query {
		q := req.URL.Query()
		q.Set(k, v)
		req.URL.RawQuery = q.Encode()
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	return resp, nil
}

// doJSON 发送请求并解码 JSON 响应；非 2xx 时解析 daemon 错误信息。
func (c *DockerClient) doJSON(method, path string, query map[string]string, body io.Reader, out any) error {
	resp, err := c.do(method, path, query, body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, dockerMaxRead))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		var de dockerError
		if json.Unmarshal(raw, &de) == nil && de.Message != "" {
			return fmt.Errorf("%s", de.Message)
		}
		return fmt.Errorf("Docker API %s %s 返回 %d", method, path, resp.StatusCode)
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("解析 Docker 响应失败：%v", err)
		}
	}
	return nil
}

// ---------- 镜像 ----------

// ImageID 返回本地镜像的 ID（不存在返回空串，无错误）。
func (c *DockerClient) ImageID(ref string) (string, error) {
	var info struct {
		ID string `json:"Id"`
	}
	err := c.doJSON("GET", "/images/"+ref+"/json", nil, nil, &info)
	if err != nil {
		if strings.Contains(err.Error(), "No such image") {
			return "", nil
		}
		return "", err
	}
	return info.ID, nil
}

// ImageRefsByID 返回某镜像 ID 在本地的所有 repo:tag（用于 load 后发现实际 tag）。
func (c *DockerClient) ImageRefsByID(imageID string) ([]string, error) {
	var images []struct {
		ID       string   `json:"Id"`
		RepoTags []string `json:"RepoTags"`
	}
	if err := c.doJSON("GET", "/images/json", map[string]string{"all": "0"}, nil, &images); err != nil {
		return nil, err
	}
	for _, img := range images {
		if img.ID == imageID {
			return img.RepoTags, nil
		}
	}
	return nil, nil
}

// TagImage 给本地镜像打新 tag（source 可为 ID 或 repo:tag）。
func (c *DockerClient) TagImage(source, repo, tag string) error {
	return c.doJSON("POST", "/images/"+source+"/tag", map[string]string{"repo": repo, "tag": tag}, nil, nil)
}

// LoadImage 从本地 tar 文件加载镜像（等价 docker load -i）。
// 用 512KB bufio 包装，减少 syscall 次数，提升大镜像包 load 吞吐。
func (c *DockerClient) LoadImage(tarPath string, onLog func(string)) error {
	f, err := os.Open(tarPath)
	if err != nil {
		return err
	}
	defer f.Close()
	reader := bufio.NewReaderSize(f, loadBufferSize)
	resp, err := c.doWithHeaders("POST", "/images/load",
		map[string]string{"quiet": "0"}, reader,
		map[string]string{"Content-Type": "application/x-tar"})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, dockerMaxRead))
	if resp.StatusCode != http.StatusOK {
		var de dockerError
		if json.Unmarshal(raw, &de) == nil && de.Message != "" {
			return fmt.Errorf("%s", de.Message)
		}
		return fmt.Errorf("加载镜像失败（HTTP %d）", resp.StatusCode)
	}
	if onLog != nil && len(raw) > 0 {
		onLog(string(raw))
	}
	return nil
}

// ---------- 容器 ----------

// containerBrief 列表返回的精简容器信息。
type containerBrief struct {
	Id      string            `json:"Id"`
	Names   []string          `json:"Names"`
	Labels  map[string]string `json:"Labels"`
	Image   string            `json:"Image"`
	ImageID string            `json:"ImageID"`
	State   string            `json:"State"`
}

// containerInspect 检查返回（Config/HostConfig 用原始 map 保留，重建时整体回传）。
type containerInspect struct {
	Id              string         `json:"Id"`
	Name            string         `json:"Name"`
	Config          map[string]any `json:"Config"`
	HostConfig      map[string]any `json:"HostConfig"`
	NetworkSettings struct {
		Networks map[string]struct {
			Aliases    []string       `json:"Aliases"`
			IPAMConfig map[string]any `json:"IPAMConfig"`
			NetworkID  string         `json:"NetworkID"`
		} `json:"Networks"`
	} `json:"NetworkSettings"`
}

// ListContainers 返回全部容器（含停止的）。
func (c *DockerClient) ListContainers() ([]containerBrief, error) {
	var out []containerBrief
	err := c.doJSON("GET", "/containers/json", map[string]string{"all": "1"}, nil, &out)
	return out, err
}

// FindContainerByService 按 compose 服务名查找容器（优先 compose label，其次容器名包含）。
// service 形如 backend / frontend；返回 nil 表示没找到。
func (c *DockerClient) FindContainerByService(service string) (*containerBrief, error) {
	containers, err := c.ListContainers()
	if err != nil {
		return nil, err
	}
	var nameMatch *containerBrief
	for i := range containers {
		ct := containers[i]
		if ct.Labels["com.docker.compose.service"] == service {
			return &ct, nil
		}
		if nameMatch == nil {
			for _, n := range ct.Names {
				soft := strings.TrimPrefix(n, "/")
				if strings.Contains(soft, service) {
					nameMatch = &ct
					break
				}
			}
		}
	}
	return nameMatch, nil
}

// InspectContainer 返回容器完整配置。
func (c *DockerClient) InspectContainer(id string) (*containerInspect, error) {
	var out containerInspect
	err := c.doJSON("GET", "/containers/"+id+"/json", nil, nil, &out)
	return &out, err
}

// SelfContainerID 返回自身容器 ID（容器内 HOSTNAME 即容器短 ID）。
func (c *DockerClient) SelfContainerID() string {
	host, err := os.Hostname()
	if err != nil {
		return ""
	}
	return host
}

// RecreateContainer 用新镜像重建容器（保留原网络/卷/端口/环境/compose 标签）。
// 步骤：inspect → stop → rm → create(新镜像) → start；
// create/start 失败时用原镜像重建保命，保证服务不挂。
func (c *DockerClient) RecreateContainer(id, newImage string) error {
	ins, err := c.InspectContainer(id)
	if err != nil {
		return fmt.Errorf("检查容器失败：%v", err)
	}
	oldImage := ""

	if oldImage, err = c.ContainerImage(id); err != nil {
		return fmt.Errorf("获取容器镜像失败：%v", err)
	}

	name := strings.TrimPrefix(ins.Name, "/")

	// 停旧容器
	if err := c.StopContainer(id, 30); err != nil {
		return fmt.Errorf("停止容器 %s 失败：%v", name, err)
	}
	// 删旧容器
	if err := c.RemoveContainer(id); err != nil {
		return fmt.Errorf("删除容器 %s 失败：%v", name, err)
	}
	// 用新镜像创建
	newID, err := c.CreateContainer(name, newImage, ins)
	if err != nil {
		// 创建失败：用旧镜像重建
		if restoreID, rerr := c.CreateContainer(name, oldImage, ins); rerr == nil {
			_ = c.StartContainer(restoreID)
		}
		return fmt.Errorf("创建新容器 %s 失败：%v", name, err)
	}
	// 启动
	if err := c.StartContainer(newID); err != nil {
		_ = c.RemoveContainer(newID)
		if restoreID, rerr := c.CreateContainer(name, oldImage, ins); rerr == nil {
			_ = c.StartContainer(restoreID)
		}
		return fmt.Errorf("启动新容器 %s 失败：%v", name, err)
	}
	return nil
}

// ContainerImage 返回容器当前使用的镜像引用。
func (c *DockerClient) ContainerImage(id string) (string, error) {
	var out struct {
		Image string `json:"Image"`
	}
	if err := c.doJSON("GET", "/containers/"+id+"/json", nil, nil, &out); err != nil {
		return "", err
	}
	return out.Image, nil
}

// StopContainer 停止容器（秒）。
func (c *DockerClient) StopContainer(id string, seconds int) error {
	return c.doJSON("POST", "/containers/"+id+"/stop", map[string]string{"t": fmt.Sprint(seconds)}, nil, nil)
}

// RemoveContainer 删除容器。
func (c *DockerClient) RemoveContainer(id string) error {
	return c.doJSON("DELETE", "/containers/"+id, map[string]string{"force": "1"}, nil, nil)
}

// CreateContainer 按 inspect 配置创建同名容器，镜像换为 image。
func (c *DockerClient) CreateContainer(name, image string, ins *containerInspect) (string, error) {
	// 组装 body：Config 平铺（Docker create API 顶层即 Config 字段）+ HostConfig + NetworkingConfig
	body := make(map[string]any, len(ins.Config)+2)
	for k, v := range ins.Config {
		body[k] = v
	}
	body["Image"] = image
	if len(ins.HostConfig) > 0 {
		body["HostConfig"] = ins.HostConfig
	}
	// 网络端点配置（compose 网络 + aliases）
	if len(ins.NetworkSettings.Networks) > 0 {
		endpoints := make(map[string]any, len(ins.NetworkSettings.Networks))
		for net, ep := range ins.NetworkSettings.Networks {
			cfg := map[string]any{}
			if len(ep.Aliases) > 0 {
				cfg["Aliases"] = ep.Aliases
			}
			if len(ep.IPAMConfig) > 0 {
				cfg["IPAMConfig"] = ep.IPAMConfig
			}
			endpoints[net] = cfg
		}
		body["NetworkingConfig"] = map[string]any{"EndpointsConfig": endpoints}
	}
	return c.CreateContainerRaw(name, body)
}

// CreateContainerRaw 用原始 body 创建容器（agent 等自定义配置场景）。
func (c *DockerClient) CreateContainerRaw(name string, body map[string]any) (string, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	var out struct {
		Id string `json:"Id"`
	}
	err = c.doJSON("POST", "/containers/create", map[string]string{"name": name}, bytes.NewReader(raw), &out)
	return out.Id, err
}

// FindContainerByName 按容器名查找（不存在返回 nil）。
func (c *DockerClient) FindContainerByName(name string) (*containerBrief, error) {
	containers, err := c.ListContainers()
	if err != nil {
		return nil, err
	}
	for i := range containers {
		for _, n := range containers[i].Names {
			if strings.TrimPrefix(n, "/") == name {
				return &containers[i], nil
			}
		}
	}
	return nil, nil
}

// StartContainer 启动容器。
func (c *DockerClient) StartContainer(id string) error {
	return c.doJSON("POST", "/containers/"+id+"/start", nil, nil, nil)
}

// ContainerRunning 容器是否在运行。
func (c *DockerClient) ContainerRunning(id string) (bool, error) {
	var out struct {
		State struct {
			Running bool `json:"Running"`
		} `json:"State"`
	}
	if err := c.doJSON("GET", "/containers/"+id+"/json", nil, nil, &out); err != nil {
		return false, err
	}
	return out.State.Running, nil
}

// ContainerEnv 返回容器的环境变量 map。
func (c *DockerClient) ContainerEnv(id string) (map[string]string, error) {
	ins, err := c.InspectContainer(id)
	if err != nil {
		return nil, err
	}
	envs := map[string]string{}
	if raw, ok := ins.Config["Env"]; ok {
		list, _ := raw.([]any)
		for _, item := range list {
			if s, ok := item.(string); ok {
				if idx := strings.Index(s, "="); idx > 0 {
					envs[s[:idx]] = s[idx+1:]
				}
			}
		}
	}
	return envs, nil
}

// ContainerExposedPort 从容器配置里解析容器端口（默认 8080）。
func (c *DockerClient) ContainerExposedPort(id string) string {
	ins, err := c.InspectContainer(id)
	if err != nil {
		return "8080"
	}
	if raw, ok := ins.Config["ExposedPorts"]; ok {
		if m, ok := raw.(map[string]any); ok {
			for k := range m {
				// "8080/tcp" → 8080
				if idx := strings.Index(k, "/"); idx > 0 {
					return k[:idx]
				}
				return k
			}
		}
	}
	return "8080"
}

// ContainerServiceName 返回容器的 compose 服务名（无 label 时用名字包含匹配兜底）。
func (c *DockerClient) ContainerServiceName(id string) string {
	ins, err := c.InspectContainer(id)
	if err != nil {
		return ""
	}
	if raw, ok := ins.Config["Labels"]; ok {
		if m, ok := raw.(map[string]any); ok {
			if s, ok := m["com.docker.compose.service"].(string); ok {
				return s
			}
		}
	}
	name := strings.TrimPrefix(ins.Name, "/")
	return name
}
