package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/pkg/config"
)

// agent 环境变量约定（由 backend 通过容器 env 传给一次性 agent 容器）。
const (
	envAgentMode        = "INKSTONE_AGENT_MODE"         // deploy / rollback
	envAgentRecord      = "INKSTONE_AGENT_RECORD"       // 更新记录 ID
	envAgentManifest    = "INKSTONE_AGENT_MANIFEST"     // deploy 模式的版本清单 JSON
	envAgentRollbackTag = "INKSTONE_AGENT_ROLLBACK_TAG" // 回滚 tag 后缀
)

// 稳定服务名与镜像名前缀（release.ps1 产出镜像名固定）。
const (
	serviceBackend  = "backend"
	serviceFrontend = "frontend"
)

// RunUpdateAgent 更新代理入口（子命令 `server update-agent`）。
// agent 以一次性容器运行、由 Docker 守护进程托管：backend 容器停掉后它仍然存活，
// 负责完成容器替换、健康检查与失败回滚，全程无需人工登录服务器。
func RunUpdateAgent() {
	db := repository.NewDB()
	updateRepo := repository.NewUpdateRepository(db)
	cfg := config.Load()
	s := NewUpdateService(db, updateRepo, nil, nil, cfg.DockerSocketPath())

	recordID, _ := strconv.ParseUint(os.Getenv(envAgentRecord), 10, 64)
	rec, err := updateRepo.FindByID(uint(recordID))
	if err != nil {
		fmt.Printf("[update-agent] 更新记录 #%d 不存在：%v\n", recordID, err)
		os.Exit(1)
	}

	defer func() {
		if r := recover(); r != nil {
			s.failRecord(rec, fmt.Sprintf("更新代理异常：%v", r))
			os.Exit(1)
		}
	}()

	// 等 backend 停稳、端口释放
	time.Sleep(5 * time.Second)

	mode := os.Getenv(envAgentMode)
	switch mode {
	case "rollback":
		// 回滚代理：把 rollback tag 恢复为 latest 并重建容器
		if err := s.agentRollbackFrom(rec, nil, ""); err != nil {
			s.failRecord(rec, "回滚失败："+err.Error())
			os.Exit(1)
		}
		now := time.Now()
		rec.Status = model.UpdateStatusSuccess
		rec.Phase = model.UpdatePhaseDone
		rec.Detail = "已回滚到 " + rec.ToVersion
		rec.FinishedAt = &now
		s.saveRecord(rec)
	default:
		var m UpdateManifest
		raw := os.Getenv(envAgentManifest)
		if err := json.Unmarshal([]byte(raw), &m); err != nil {
			s.failRecord(rec, "版本清单解析失败")
			os.Exit(1)
		}
		s.agentDeploy(rec, &m)
	}
}

// spawnAgent 创建并启动一次性 agent 容器（使用当前 backend 镜像，保证 agent 代码可用）。
func (s *UpdateService) spawnAgent(rec *model.UpdateRecord, m *UpdateManifest, mode string) error {
	selfID := s.docker.SelfContainerID()
	if selfID == "" {
		return fmt.Errorf("无法确定自身容器")
	}
	selfIns, err := s.docker.InspectContainer(selfID)
	if err != nil {
		return fmt.Errorf("检查自身容器失败：%v", err)
	}
	agentImage, err := s.docker.ContainerImage(selfID)
	if err != nil {
		return fmt.Errorf("获取自身镜像失败：%v", err)
	}

	// 复制自身环境变量（DB 连接等）+ agent 参数
	var agentEnv []string
	if raw, ok := selfIns.Config["Env"].([]any); ok {
		for _, item := range raw {
			if str, ok := item.(string); ok {
				agentEnv = append(agentEnv, str)
			}
		}
	}
	agentEnv = append(agentEnv,
		"INKSTONE_AGENT=1",
		envAgentMode+"="+mode,
		fmt.Sprintf("%s=%d", envAgentRecord, rec.ID),
	)
	if tag := rec.RollbackTag; tag != "" {
		agentEnv = append(agentEnv, envAgentRollbackTag+"="+tag)
	}
	if m != nil {
		if raw, err := json.Marshal(m); err == nil {
			agentEnv = append(agentEnv, envAgentManifest+"="+string(raw))
		}
	}

	// 清理上次残留的 agent 容器
	if old, _ := s.docker.FindContainerByName(agentContainerName); old != nil {
		_ = s.docker.RemoveContainer(old.Id)
	}

	// 复用自身容器配置：换镜像命令、去掉健康检查与端口绑定、只挂 docker.sock
	body := make(map[string]any, len(selfIns.Config)+1)
	for k, v := range selfIns.Config {
		body[k] = v
	}
	body["Image"] = agentImage
	body["Env"] = agentEnv
	body["Cmd"] = []string{"update-agent"}
	delete(body, "Healthcheck")

	// 剔除 compose 标签：agent 是一次性容器，不能混入 compose project（否则 compose up -d 会误管）
	if labels, ok := body["Labels"].(map[string]any); ok {
		cleaned := make(map[string]any, len(labels))
		for k, v := range labels {
			if strings.HasPrefix(k, "com.docker.compose.") {
				continue
			}
			cleaned[k] = v
		}
		cleaned["inkstone.role"] = "update-agent"
		body["Labels"] = cleaned
	}

	if len(selfIns.HostConfig) > 0 {
		hc := make(map[string]any, len(selfIns.HostConfig))
		for k, v := range selfIns.HostConfig {
			hc[k] = v
		}
		// agent 只通过 docker.sock 与守护进程通信，不绑宿主机端口，不挂数据卷
		hc["Binds"] = []string{s.docker.socketPath + ":" + s.docker.socketPath + ":ro"}
		delete(hc, "PortBindings")
		delete(hc, "PublishAllPorts")
		// 一次性任务：禁用自动重启（避免失败后反复重跑部署流程）
		hc["RestartPolicy"] = map[string]any{"Name": "no", "MaximumRetryCount": 0}
		hc["AutoRemove"] = true
		body["HostConfig"] = hc
	}

	id, err := s.docker.CreateContainerRaw(agentContainerName, body)
	if err != nil {
		return fmt.Errorf("创建 agent 容器失败：%v", err)
	}
	if err := s.docker.StartContainer(id); err != nil {
		return fmt.Errorf("启动 agent 容器失败：%v", err)
	}
	return nil
}

// agentDeploy 部署流程（agent 容器内执行）：先替换 frontend，再重建 backend 自身，
// 健康检查 + 版本核对通过才算成功，任一失败自动回滚。
func (s *UpdateService) agentDeploy(rec *model.UpdateRecord, m *UpdateManifest) {
	// savedIns：旧 backend 容器被删除前的完整配置。若后续 create/start 失败，
	// 回滚时用它重建（此时 compose 里已无 backend 容器，找不到容器也要能拉起）。
	var savedIns *containerInspect
	var savedName string

	// 1. 先部署非自身服务（frontend），backend 自身最后
	for _, img := range m.Images {
		if img.Service == serviceBackend {
			continue
		}
		if err := s.agentRecreateService(img.Service, img.imageRef()); err != nil {
			s.agentRollback(rec, "替换 "+img.Service+" 容器失败："+err.Error(), savedIns, savedName)
			return
		}
		rec.Detail = img.Service + " 容器已替换为 " + img.imageRef()
		s.saveRecord(rec)
	}

	// 2. 重建 backend 自身容器（此时旧容器已被 performUpdate 停止并删除，原名已空出）
	var backendImg *ManifestImage
	for i := range m.Images {
		if m.Images[i].Service == serviceBackend {
			backendImg = &m.Images[i]
		}
	}
	if backendImg == nil {
		s.agentRollback(rec, "版本清单缺少 backend 镜像定义", savedIns, savedName)
		return
	}
	ct, err := s.docker.FindContainerByService(serviceBackend)
	if err != nil || ct == nil {
		s.agentRollback(rec, "找不到 backend 容器，无法替换", savedIns, savedName)
		return
	}
	// 幂等确保旧容器已停
	if running, _ := s.docker.ContainerRunning(ct.Id); running {
		_ = s.docker.StopContainer(ct.Id, 30)
	}
	ins, err := s.docker.InspectContainer(ct.Id)
	if err != nil {
		s.agentRollback(rec, "检查 backend 容器失败："+err.Error(), savedIns, savedName)
		return
	}
	newName := strings.TrimPrefix(ins.Name, "/")
	savedIns, savedName = ins, newName
	if err := s.docker.RemoveContainer(ct.Id); err != nil {
		s.agentRollback(rec, "删除旧 backend 容器失败："+err.Error(), savedIns, savedName)
		return
	}
	newID, err := s.docker.CreateContainer(newName, backendImg.imageRef(), ins)
	if err != nil {
		s.agentRollback(rec, "创建新 backend 容器失败："+err.Error(), savedIns, savedName)
		return
	}
	if err := s.docker.StartContainer(newID); err != nil {
		_ = s.docker.RemoveContainer(newID)
		s.agentRollback(rec, "启动新 backend 容器失败："+err.Error(), savedIns, savedName)
		return
	}

	// 3. 健康检查 + 版本核对（防「起得来但是旧版本」）
	rec.Detail = "backend 已重启，正在进行健康检查…"
	s.saveRecord(rec)
	if err := s.waitHealthy(newID, newName, backendImg.Service, m.Version); err != nil {
		_ = s.docker.StopContainer(newID, 15)
		_ = s.docker.RemoveContainer(newID)
		s.agentRollback(rec, "健康检查未通过："+err.Error(), savedIns, savedName)
		return
	}

	// 4. 完成
	now := time.Now()
	rec.Status = model.UpdateStatusSuccess
	rec.Phase = model.UpdatePhaseDone
	rec.Progress = 100
	rec.Detail = ""
	rec.FinishedAt = &now
	s.saveRecord(rec)
	fmt.Printf("[update-agent] 更新完成：#%d %s → %s\n", rec.ID, rec.FromVersion, rec.ToVersion)
}

// agentRollback 部署/回滚失败后的统一回滚入口。
// fallbackIns：旧 backend 容器被删前的配置快照（若容器已不存在则用它重建）。
func (s *UpdateService) agentRollback(rec *model.UpdateRecord, reason string, fallbackIns *containerInspect, fallbackName string) {
	if err := s.agentRollbackFrom(rec, fallbackIns, fallbackName); err != nil {
		s.failRecord(rec, reason+"；且自动回滚失败："+err.Error())
		return
	}
	now := time.Now()
	rec.Status = model.UpdateStatusFailed
	rec.Phase = model.UpdatePhaseDone
	rec.FinishedAt = &now
	if rec.Detail == "" || reason != "" {
		rec.Detail = reason + "；已自动回滚到更新前版本"
	} else {
		rec.Detail += "；已自动回滚到更新前版本"
	}
	s.saveRecord(rec)
}

// agentRollbackFrom 执行回滚核心逻辑：rollback tag → latest，重建 frontend + backend。
// fallbackIns 非空且容器已不存在时（部署中途删除失败场景），用快照配置重建，保证服务不挂。
func (s *UpdateService) agentRollbackFrom(rec *model.UpdateRecord, fallbackIns *containerInspect, fallbackName string) error {
	tag := rec.RollbackTag
	if tag == "" {
		return fmt.Errorf("没有回滚镜像 tag")
	}
	// 1. 逐服务把 rollback tag 转正为 latest
	for _, service := range []string{serviceFrontend, serviceBackend} {
		repo := s.repoNameOfService(service)
		if id, err := s.docker.ImageID(repo + ":" + tag); err != nil || id == "" {
			// 该服务没有 rollback 镜像（可能未参与上次更新），跳过
			continue
		}
		if err := s.docker.TagImage(repo+":"+tag, repo, "latest"); err != nil {
			return fmt.Errorf("恢复 %s 镜像失败：%v", service, err)
		}
	}
	// 2. 重建 frontend，再重建 backend（顺序与部署一致）
	for _, service := range []string{serviceFrontend, serviceBackend} {
		repo := s.repoNameOfService(service)
		if id, err := s.docker.ImageID(repo + ":" + tag); err != nil || id == "" {
			continue
		}
		ct, err := s.docker.FindContainerByService(service)
		if err != nil {
			return err
		}
		if ct == nil {
			// 容器已不存在（部署中途被删）：用快照配置重建保命，绝不让服务消失
			if service == serviceBackend && fallbackIns != nil {
				name := fallbackName
				if name == "" {
					name = strings.TrimPrefix(fallbackIns.Name, "/")
				}
				newID, err := s.docker.CreateContainer(name, repo+":latest", fallbackIns)
				if err != nil {
					return fmt.Errorf("重建 %s 容器失败：%v", service, err)
				}
				if err := s.docker.StartContainer(newID); err != nil {
					_ = s.docker.RemoveContainer(newID)
					return fmt.Errorf("启动 %s 容器失败：%v", service, err)
				}
				if err := s.waitHealthy(newID, name, service, rec.ToVersion); err != nil {
					return fmt.Errorf("backend 回滚后健康检查失败：%v", err)
				}
				continue
			}
			continue
		}
		if running, _ := s.docker.ContainerRunning(ct.Id); running {
			_ = s.docker.StopContainer(ct.Id, 30)
		}
		ins, err := s.docker.InspectContainer(ct.Id)
		if err != nil {
			return err
		}
		name := strings.TrimPrefix(ins.Name, "/")
		if err := s.docker.RemoveContainer(ct.Id); err != nil {
			return fmt.Errorf("删除 %s 容器失败：%v", service, err)
		}
		newID, err := s.docker.CreateContainer(name, repo+":latest", ins)
		if err != nil {
			return fmt.Errorf("重建 %s 容器失败：%v", service, err)
		}
		if err := s.docker.StartContainer(newID); err != nil {
			_ = s.docker.RemoveContainer(newID)
			return fmt.Errorf("启动 %s 容器失败：%v", service, err)
		}
		if service == serviceBackend {
			if err := s.waitHealthy(newID, name, service, rec.ToVersion); err != nil {
				return fmt.Errorf("backend 回滚后健康检查失败：%v", err)
			}
		}
	}
	return nil
}

// repoNameOfService 由 compose 服务名反推镜像仓库名（读当前容器 Image，兜底 inkstone-<service>）。
func (s *UpdateService) repoNameOfService(service string) string {
	if ct, err := s.docker.FindContainerByService(service); err == nil && ct != nil {
		if idx := strings.Index(ct.Image, ":"); idx > 0 {
			return ct.Image[:idx]
		}
		if ct.Image != "" {
			return ct.Image
		}
	}
	return "inkstone-" + service
}

// agentRecreateService 用新镜像重建指定 compose 服务的容器（保留全部原始配置）。
func (s *UpdateService) agentRecreateService(service, imageRef string) error {
	ct, err := s.docker.FindContainerByService(service)
	if err != nil {
		return err
	}
	if ct == nil {
		// 该服务未运行（用户可能只部署了部分服务），跳过
		return nil
	}
	if err := s.docker.RecreateContainer(ct.Id, imageRef); err != nil {
		return err
	}
	return nil
}

// waitHealthy 轮询容器健康检查端点，并核对运行版本，防止「假更新」。
// 端口优先从容器 Env 的 PORT 读取，其次 ExposedPorts，最终兜底 8080。
// 容器若已退出（crash-loop）会立即返回失败，不等满超时——让回滚更早发生。
func (s *UpdateService) waitHealthy(containerID, containerName, service, expectVersion string) error {
	port := "8080"
	if ct, err := s.docker.FindContainerByName(containerName); err == nil && ct != nil {
		if envs, envErr := s.docker.ContainerEnv(ct.Id); envErr == nil && envs["PORT"] != "" {
			port = envs["PORT"]
		} else {
			port = s.docker.ContainerExposedPort(ct.Id)
		}
	}
	client := &http.Client{Timeout: 5 * time.Second}
	healthURL := fmt.Sprintf("http://%s:%s/healthz", containerName, port)
	infoURL := fmt.Sprintf("http://%s:%s/api/v1/system/info", containerName, port)

	deadline := time.Now().Add(150 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		// 容器已退出（新版本起不来）→ 立即失败，触发回滚，避免空等 150 秒
		if containerID != "" {
			if running, err := s.docker.ContainerRunning(containerID); err == nil && !running {
				return fmt.Errorf("容器已退出（新版本无法正常运行）")
			}
		}
		resp, err := client.Get(healthURL)
		if err == nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				// 版本核对：起得来还不够，必须真的是新版本
				if expectVersion != "" {
					if v, err := fetchServiceVersion(client, infoURL); err == nil {
						if compareVersion(v, expectVersion) != 0 {
							lastErr = fmt.Errorf("运行版本 %s 与目标版本 %s 不一致", v, expectVersion)
						} else {
							return nil
						}
					}
				} else {
					return nil
				}
			} else {
				lastErr = fmt.Errorf("健康检查返回 %d", resp.StatusCode)
			}
		} else {
			lastErr = err
		}
		time.Sleep(3 * time.Second)
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("等待超时")
	}
	return lastErr
}

// fetchServiceVersion 读取对端 /api/v1/system/info 的版本号。
func fetchServiceVersion(client *http.Client, url string) (string, error) {
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var out struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Info.Version == "" {
		return "", fmt.Errorf("未获取到版本号")
	}
	return out.Info.Version, nil
}
