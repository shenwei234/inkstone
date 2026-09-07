package service

import (
	"time"

	"github.com/blog-platform/backend/internal/model"
	"github.com/blog-platform/backend/internal/repository"
)

type AdminService struct {
	users    *repository.UserRepository
	articles *repository.ArticleRepository
}

func NewAdminService(users *repository.UserRepository, articles *repository.ArticleRepository) *AdminService {
	return &AdminService{users: users, articles: articles}
}

type Stats struct {
	TotalUsers     int64 `json:"total_users"`
	TotalArticles  int64 `json:"total_articles"`
	PublishedCount int64 `json:"published_articles"`
	DraftCount     int64 `json:"draft_articles"`
}

func (s *AdminService) Stats() (*Stats, error) {
	st := &Stats{}
	var err error
	if st.TotalUsers, err = s.users.Count(); err != nil {
		return nil, err
	}
	if st.TotalArticles, err = s.articles.CountAll(); err != nil {
		return nil, err
	}
	if st.PublishedCount, err = s.articles.CountByStatus("published"); err != nil {
		return nil, err
	}
	if st.DraftCount, err = s.articles.CountByStatus("draft"); err != nil {
		return nil, err
	}
	return st, nil
}

func (s *AdminService) SetArticleStatus(id uint, status string) (*model.Article, error) {
	if status != model.ArticleDraft && status != model.ArticlePublished {
		return nil, NewValidationError("无效的状态值")
	}
	article, err := s.articles.FindByID(id)
	if err != nil {
		return nil, err
	}
	if article.Status != model.ArticlePublished && status == model.ArticlePublished && article.PublishedAt == nil {
		now := time.Now()
		article.PublishedAt = &now
	}
	article.Status = status
	if err := s.articles.Update(article); err != nil {
		return nil, err
	}
	return article, nil
}

func (s *AdminService) ListUsers(page, pageSize int, query string) ([]model.User, int64, error) {
	return s.users.List(page, pageSize, query)
}
