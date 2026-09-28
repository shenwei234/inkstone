package handler

import (
	"encoding/xml"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/internal/service"
)

type SitemapHandler struct {
	articles    *service.ArticleService
	pages       *service.PageService
	taxonomy    *repository.TaxonomyRepository
	frontendURL string
}

func NewSitemapHandler(
	articles *service.ArticleService,
	pages *service.PageService,
	taxonomy *repository.TaxonomyRepository,
	frontendURL string,
) *SitemapHandler {
	return &SitemapHandler{articles: articles, pages: pages, taxonomy: taxonomy, frontendURL: frontendURL}
}

type sitemapURL struct {
	XMLName    xml.Name `xml:"url"`
	Loc        string   `xml:"loc"`
	LastMod    string   `xml:"lastmod,omitempty"`
	ChangeFreq string   `xml:"changefreq,omitempty"`
	Priority   string   `xml:"priority,omitempty"`
}

type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	XMLNS   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

// sitemapEntry 统一条目（XML 与后台管理页共用数据源；比 XML 结构多 type/label 便于分组展示）。
type sitemapEntry struct {
	Type       string `json:"type"`
	Label      string `json:"label"`
	Loc        string `json:"loc"`
	LastMod    string `json:"lastmod,omitempty"`
	ChangeFreq string `json:"changefreq,omitempty"`
	Priority   string `json:"priority,omitempty"`
}

type sitemapGroup struct {
	Type    string         `json:"type"`
	Label   string         `json:"label"`
	Count   int            `json:"count"`
	Entries []sitemapEntry `json:"entries"`
}

type sitemapData struct {
	FrontendURL string         `json:"frontend_url"`
	SitemapURL  string         `json:"sitemap_url"`
	Robots      string         `json:"robots"`
	Groups      []sitemapGroup `json:"groups"`
	Total       int            `json:"total"`
}

// sitemapGroupLabels 后台分组展示顺序（含中文组名）。
var sitemapGroupLabels = []struct{ Type, Label string }{
	{"home", "基础页面"},
	{"article", "文章"},
	{"page", "独立页"},
	{"category", "分类"},
	{"tag", "标签"},
}

// collectEntries 收集 sitemap 全量条目（Sitemap XML 与后台管理页共用）。
func (h *SitemapHandler) collectEntries() []sitemapEntry {
	var entries []sitemapEntry
	add := func(typ, label, loc, lastMod, freq, priority string) {
		entries = append(entries, sitemapEntry{Type: typ, Label: label, Loc: loc, LastMod: lastMod, ChangeFreq: freq, Priority: priority})
	}

	add("home", "首页", h.frontendURL+"/", "", "daily", "1.0")
	add("home", "友情链接", h.frontendURL+"/links", "", "weekly", "0.3")

	// 文章（已发布）
	if articles, _, err := h.articles.List(repository.ArticleQuery{
		Status:   "published",
		Page:     1,
		PageSize: 5000,
	}); err == nil {
		for _, a := range articles {
			add("article", a.Title, h.frontendURL+"/posts/"+url.PathEscape(a.Slug),
				a.UpdatedAt.Format(time.RFC3339), "weekly", "0.8")
		}
	}

	// 独立页（已发布）
	if pages, err := h.pages.List(false); err == nil {
		for _, p := range pages {
			if !p.IsPublished() {
				continue
			}
			add("page", p.Title, h.frontendURL+"/p/"+url.PathEscape(p.Slug),
				p.UpdatedAt.Format(time.RFC3339), "monthly", "0.5")
		}
	}

	// 分类（仅有文章的）
	if cats, err := h.taxonomy.ListCategories(); err == nil {
		for _, cat := range cats {
			if cat.ArticleCount == 0 {
				continue
			}
			add("category", cat.Name, h.frontendURL+"/?category="+url.QueryEscape(cat.Slug), "", "weekly", "0.4")
		}
	}

	// 标签（仅有文章的）
	if tags, err := h.taxonomy.ListTags(); err == nil {
		for _, t := range tags {
			if t.ArticleCount == 0 {
				continue
			}
			add("tag", t.Name, h.frontendURL+"/?tag="+url.QueryEscape(t.Slug), "", "weekly", "0.3")
		}
	}
	return entries
}

// Sitemap handles GET /sitemap.xml — XML sitemap（首页/友链/文章/独立页/分类/标签）。
func (h *SitemapHandler) Sitemap(c *gin.Context) {
	entries := h.collectEntries()
	urls := make([]sitemapURL, 0, len(entries))
	for _, e := range entries {
		urls = append(urls, sitemapURL{
			Loc:        e.Loc,
			LastMod:    e.LastMod,
			ChangeFreq: e.ChangeFreq,
			Priority:   e.Priority,
		})
	}

	set := sitemapURLSet{XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: urls}
	output, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.Data(http.StatusOK, "application/xml; charset=utf-8", append([]byte(xml.Header), output...))
}

// SiteMapData handles GET /api/v1/admin/sitemap — 后台站点地图管理页数据：
// 分组 URL 列表 + robots.txt 预览。
func (h *SitemapHandler) SiteMapData(c *gin.Context) {
	entries := h.collectEntries()

	groups := make([]sitemapGroup, 0, len(sitemapGroupLabels))
	for _, g := range sitemapGroupLabels {
		list := make([]sitemapEntry, 0, len(entries))
		for _, e := range entries {
			if e.Type == g.Type {
				list = append(list, e)
			}
		}
		if len(list) == 0 {
			continue
		}
		groups = append(groups, sitemapGroup{Type: g.Type, Label: g.Label, Count: len(list), Entries: list})
	}

	c.JSON(http.StatusOK, gin.H{
		"data": sitemapData{
			FrontendURL: h.frontendURL,
			SitemapURL:  h.frontendURL + "/sitemap.xml",
			Robots:      h.robotsBody(),
			Groups:      groups,
			Total:       len(entries),
		},
	})
}

// Robots handles GET /robots.txt — 放行 crawling、屏蔽后台，并指向 sitemap。
func (h *SitemapHandler) Robots(c *gin.Context) {
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(h.robotsBody()))
}

func (h *SitemapHandler) robotsBody() string {
	return "User-agent: *\n" +
		"Disallow: /admin\n" +
		"Disallow: /me\n" +
		"Sitemap: " + h.frontendURL + "/sitemap.xml\n"
}
