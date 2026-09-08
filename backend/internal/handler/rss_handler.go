package handler

import (
	"encoding/xml"
	"net/http"
	"time"

	"github.com/blog-platform/backend/internal/repository"
	"github.com/blog-platform/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type RSSHandler struct {
	articles    *service.ArticleService
	frontendURL string
	siteName    string
}

func NewRSSHandler(articles *service.ArticleService, frontendURL string) *RSSHandler {
	return &RSSHandler{articles: articles, frontendURL: frontendURL, siteName: "Blog 平台"}
}

type rssItem struct {
	XMLName     xml.Name `xml:"item"`
	Title       string   `xml:"title"`
	Link        string   `xml:"link"`
	GUID        string   `xml:"guid"`
	PubDate     string   `xml:"pubDate"`
	Description string   `xml:"description"`
}

type rssChannel struct {
	XMLName     xml.Name  `xml:"channel"`
	Title       string    `xml:"title"`
	Link        string    `xml:"link"`
	Description string    `xml:"description"`
	Language    string    `xml:"language"`
	LastBuild   string    `xml:"lastBuildDate"`
	Items       []rssItem `xml:"item"`
}

type rssFeed struct {
	XMLName xml.Name   `xml:"rss"`
	Version string     `xml:"version,attr"`
	Channel rssChannel `xml:"channel"`
}

// Feed handles GET /feed.xml — RSS 2.0 feed of the latest published articles.
func (h *RSSHandler) Feed(c *gin.Context) {
	articles, _, err := h.articles.List(repository.ArticleQuery{
		Status:   "published",
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		errorResponse(c, err)
		return
	}

	items := make([]rssItem, 0, len(articles))
	for _, a := range articles {
		pub := a.PublishedAt
		if pub == nil {
			pub = &a.CreatedAt
		}
		plain := stripHTMLTags(a.Content)
		if len([]rune(plain)) > 300 {
			plain = string([]rune(plain)[:300]) + "..."
		}
		items = append(items, rssItem{
			Title:       a.Title,
			Link:        h.frontendURL + "/posts/" + a.Slug,
			GUID:        h.frontendURL + "/posts/" + a.Slug,
			PubDate:     pub.Format(time.RFC1123Z),
			Description: plain,
		})
	}

	feed := rssFeed{
		Version: "2.0",
		Channel: rssChannel{
			Title:       h.siteName,
			Link:        h.frontendURL,
			Description: "最新文章订阅",
			Language:    "zh-CN",
			LastBuild:   time.Now().Format(time.RFC1123Z),
			Items:       items,
		},
	}

	output, err := xml.MarshalIndent(feed, "", "  ")
	if err != nil {
		errorResponse(c, err)
		return
	}
	c.Data(http.StatusOK, "application/rss+xml; charset=utf-8", append([]byte(xml.Header), output...))
}

func stripHTMLTags(s string) string {
	out := make([]byte, 0, len(s))
	inTag := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch == '<' {
			inTag = true
			continue
		}
		if ch == '>' {
			inTag = false
			continue
		}
		if !inTag {
			out = append(out, ch)
		}
	}
	return string(out)
}
