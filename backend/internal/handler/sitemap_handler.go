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

// Sitemap handles GET /sitemap.xml — XML sitemap（首页/友链/文章/独立页/分类/标签）。
func (h *SitemapHandler) Sitemap(c *gin.Context) {
	urls := []sitemapURL{
		{Loc: h.frontendURL + "/", ChangeFreq: "daily", Priority: "1.0"},
		{Loc: h.frontendURL + "/links", ChangeFreq: "weekly", Priority: "0.3"},
	}

	// 文章（已发布）
	if articles, _, err := h.articles.List(repository.ArticleQuery{
		Status:   "published",
		Page:     1,
		PageSize: 5000,
	}); err == nil {
		for _, a := range articles {
			urls = append(urls, sitemapURL{
				Loc:        h.frontendURL + "/posts/" + url.PathEscape(a.Slug),
				LastMod:    a.UpdatedAt.Format(time.RFC3339),
				ChangeFreq: "weekly",
				Priority:   "0.8",
			})
		}
	}

	// 独立页（已发布）
	if pages, err := h.pages.List(false); err == nil {
		for _, p := range pages {
			if !p.IsPublished() {
				continue
			}
			urls = append(urls, sitemapURL{
				Loc:        h.frontendURL + "/p/" + url.PathEscape(p.Slug),
				LastMod:    p.UpdatedAt.Format(time.RFC3339),
				ChangeFreq: "monthly",
				Priority:   "0.5",
			})
		}
	}

	// 分类（仅有文章的）
	if cats, err := h.taxonomy.ListCategories(); err == nil {
		for _, cat := range cats {
			if cat.ArticleCount == 0 {
				continue
			}
			urls = append(urls, sitemapURL{
				Loc:        h.frontendURL + "/?category=" + url.QueryEscape(cat.Slug),
				ChangeFreq: "weekly",
				Priority:   "0.4",
			})
		}
	}

	// 标签（仅有文章的）
	if tags, err := h.taxonomy.ListTags(); err == nil {
		for _, t := range tags {
			if t.ArticleCount == 0 {
				continue
			}
			urls = append(urls, sitemapURL{
				Loc:        h.frontendURL + "/?tag=" + url.QueryEscape(t.Slug),
				ChangeFreq: "weekly",
				Priority:   "0.3",
			})
		}
	}

	set := sitemapURLSet{XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: urls}
	output, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.Data(http.StatusOK, "application/xml; charset=utf-8", append([]byte(xml.Header), output...))
}

// Robots handles GET /robots.txt — 放行 crawling、屏蔽后台，并指向 sitemap。
func (h *SitemapHandler) Robots(c *gin.Context) {
	body := "User-agent: *\n" +
		"Disallow: /admin\n" +
		"Disallow: /me\n" +
		"Sitemap: " + h.frontendURL + "/sitemap.xml\n"
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(body))
}
