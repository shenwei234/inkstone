package service

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
)

// checkInterval is how often the background worker looks for links whose
// health has not been verified recently.
const (
	checkInterval  = 6 * time.Hour
	checkThreshold = 24 * time.Hour
	checkTimeout   = 15 * time.Second
)

type LinkService struct {
	links *repository.LinkRepository
}

func NewLinkService(links *repository.LinkRepository) *LinkService {
	return &LinkService{links: links}
}

type LinkInput struct {
	Name        string
	URL         string
	CheckURL    string
	IconURL     string
	Description string
	SortOrder   int
}

func normalizeLinkInput(input *LinkInput) error {
	input.Name = strings.TrimSpace(input.Name)
	input.URL = strings.TrimSpace(input.URL)
	input.CheckURL = strings.TrimSpace(input.CheckURL)
	if input.Name == "" {
		return NewValidationError("网站名称不能为空")
	}
	if input.URL == "" {
		return NewValidationError("网站链接不能为空")
	}
	if !strings.HasPrefix(input.URL, "http://") && !strings.HasPrefix(input.URL, "https://") {
		return NewValidationError("网站链接需以 http:// 或 https:// 开头")
	}
	if input.CheckURL != "" &&
		!strings.HasPrefix(input.CheckURL, "http://") && !strings.HasPrefix(input.CheckURL, "https://") {
		return NewValidationError("检测页面需以 http:// 或 https:// 开头")
	}
	return nil
}

func (s *LinkService) Create(input LinkInput) (*model.FriendLink, error) {
	if err := normalizeLinkInput(&input); err != nil {
		return nil, err
	}
	link := &model.FriendLink{
		Name:        input.Name,
		URL:         input.URL,
		CheckURL:    input.CheckURL,
		IconURL:     input.IconURL,
		Description: input.Description,
		SortOrder:   input.SortOrder,
		Available:   true,
	}
	if err := s.links.Create(link); err != nil {
		return nil, err
	}
	go s.CheckOne(link.ID)
	return link, nil
}

func (s *LinkService) Update(id uint, input LinkInput) (*model.FriendLink, error) {
	if err := normalizeLinkInput(&input); err != nil {
		return nil, err
	}
	link, err := s.links.FindByID(id)
	if err != nil {
		return nil, err
	}
	link.Name = input.Name
	link.URL = input.URL
	link.CheckURL = input.CheckURL
	link.IconURL = input.IconURL
	link.Description = input.Description
	link.SortOrder = input.SortOrder
	if err := s.links.Update(link); err != nil {
		return nil, err
	}
	return link, nil
}

func (s *LinkService) Delete(id uint) error {
	return s.links.Delete(id)
}

func (s *LinkService) List() ([]model.FriendLink, error) {
	return s.links.List()
}

// CheckOne verifies a single link and persists the result.
func (s *LinkService) CheckOne(id uint) (bool, error) {
	link, err := s.links.FindByID(id)
	if err != nil {
		return false, err
	}
	target := link.CheckURL
	if target == "" {
		target = link.URL
	}
	available := probeURL(target)
	now := time.Now()
	link.Available = available
	link.LastCheckedAt = &now
	if err := s.links.Update(link); err != nil {
		return available, err
	}
	return available, nil
}

// CheckAll verifies every link (manual trigger from the admin console).
func (s *LinkService) CheckAll() ([]model.FriendLink, error) {
	links, err := s.links.List()
	if err != nil {
		return nil, err
	}
	for i := range links {
		target := links[i].CheckURL
		if target == "" {
			target = links[i].URL
		}
		available := probeURL(target)
		now := time.Now()
		links[i].Available = available
		links[i].LastCheckedAt = &now
		if err := s.links.Update(&links[i]); err != nil {
			return nil, err
		}
	}
	return links, nil
}

// StartAutoCheck runs a lightweight worker: every checkInterval it verifies
// links whose last check is older than checkThreshold (daily cadence).
func (s *LinkService) StartAutoCheck() {
	go func() {
		// Small delay so the server is fully up before probing.
		time.Sleep(20 * time.Second)
		for {
			s.checkDueLinks()
			time.Sleep(checkInterval)
		}
	}()
}

func (s *LinkService) checkDueLinks() {
	links, err := s.links.List()
	if err != nil {
		log.Printf("[linkcheck] list failed: %v", err)
		return
	}
	now := time.Now()
	for i := range links {
		link := &links[i]
		if link.LastCheckedAt != nil && now.Sub(*link.LastCheckedAt) < checkThreshold {
			continue
		}
		target := link.CheckURL
		if target == "" {
			target = link.URL
		}
		available := probeURL(target)
		checkedAt := time.Now()
		link.Available = available
		link.LastCheckedAt = &checkedAt
		if err := s.links.Update(link); err != nil {
			log.Printf("[linkcheck] update %d failed: %v", link.ID, err)
		}
	}
}

var probeClient = &http.Client{Timeout: checkTimeout}

// probeURL returns whether the target responds. 2xx/3xx/4xx all count as
// "site exists" (many sites reject bots with 403); 5xx, timeouts and network
// errors are treated as unreachable.
// probeURL returns whether the target responds. HEAD is tried first (fast,
// low bandwidth); some servers reject HEAD, so it falls back to a ranged GET.
// 2xx/3xx/4xx all count as "site exists" (many sites reject bots with 403);
// 5xx, timeouts and network errors are treated as unreachable.
func probeURL(target string) bool {
	if target == "" {
		return true
	}

	if ok, err := probeOnce(http.MethodHead, target); err == nil {
		return ok
	}
	// HEAD 失败（部分服务器不支持）→ 用 GET 重试
	if ok, err := probeOnce(http.MethodGet, target); err == nil {
		return ok
	}
	return false
}

func probeOnce(method, target string) (bool, error) {
	req, err := http.NewRequest(method, target, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("User-Agent",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,*/*;q=0.8")

	resp, err := probeClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	// 只读少量 body 即可判定，避免下载整页
	_, _ = io.CopyN(io.Discard, resp.Body, 2048)
	return resp.StatusCode < 500, nil
}

// MaskURL desensitizes a URL for display: the host's middle characters are
// replaced, e.g. https://ex****.com. Returns "****" for unparsable input.
func MaskURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "****"
	}
	parts := strings.Split(u.Host, ".")
	for i := range parts {
		label := parts[i]
		if i == len(parts)-1 && len(parts) > 1 {
			continue // keep TLD
		}
		if len(label) <= 2 {
			parts[i] = "**"
			continue
		}
		keep := 2
		if len(label) >= 5 {
			keep = 3
		}
		parts[i] = label[:keep] + strings.Repeat("*", 4)
	}
	return u.Scheme + "://" + strings.Join(parts, ".")
}
