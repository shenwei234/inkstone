package service

import (
	"errors"
	"strings"
	"time"

	"github.com/blog-platform/backend/internal/model"
	"github.com/blog-platform/backend/internal/repository"
)

var ErrForbidden = errors.New("forbidden")

type ArticleService struct {
	articles *repository.ArticleRepository
}

func NewArticleService(articles *repository.ArticleRepository) *ArticleService {
	return &ArticleService{articles: articles}
}

type ArticleInput struct {
	Title   string
	Content string
	Status  string
}

type ArticleUpdate struct {
	Title   *string
	Content *string
	Status  *string
}

func (s *ArticleService) Create(authorID uint, input ArticleInput) (*model.Article, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return nil, NewValidationError("标题不能为空")
	}
	if len([]rune(title)) > 200 {
		return nil, NewValidationError("标题最长 200 个字符")
	}
	if strings.TrimSpace(input.Content) == "" {
		return nil, NewValidationError("内容不能为空")
	}

	status := input.Status
	if status != model.ArticleDraft && status != model.ArticlePublished {
		status = model.ArticleDraft
	}

	article := &model.Article{
		AuthorID: authorID,
		Title:    title,
		Slug:     repository.Slugify(title),
		Content:  input.Content,
		Status:   status,
	}
	if status == model.ArticlePublished {
		now := time.Now()
		article.PublishedAt = &now
	}
	if err := s.articles.Create(article); err != nil {
		return nil, err
	}
	return article, nil
}

func (s *ArticleService) Update(articleID, authorID uint, update ArticleUpdate) (*model.Article, error) {
	article, err := s.articles.FindByID(articleID)
	if err != nil {
		return nil, err
	}
	if article.AuthorID != authorID {
		return nil, ErrForbidden
	}

	if update.Title != nil {
		title := strings.TrimSpace(*update.Title)
		if title == "" {
			return nil, NewValidationError("标题不能为空")
		}
		article.Title = title
		article.Slug = repository.Slugify(title)
	}
	if update.Content != nil {
		if strings.TrimSpace(*update.Content) == "" {
			return nil, NewValidationError("内容不能为空")
		}
		article.Content = *update.Content
	}
	if update.Status != nil {
		status := *update.Status
		if status != model.ArticleDraft && status != model.ArticlePublished {
			return nil, NewValidationError("无效的状态值")
		}
		if article.Status != model.ArticlePublished && status == model.ArticlePublished {
			now := time.Now()
			article.PublishedAt = &now
		}
		article.Status = status
	}

	if err := s.articles.Update(article); err != nil {
		return nil, err
	}
	return article, nil
}

func (s *ArticleService) Delete(articleID, authorID uint) error {
	return s.articles.Delete(articleID, authorID)
}

func (s *ArticleService) GetByID(id uint) (*model.Article, error) {
	return s.articles.FindByID(id)
}

func (s *ArticleService) GetBySlug(slug string) (*model.Article, error) {
	return s.articles.FindBySlug(slug)
}

func (s *ArticleService) List(q repository.ArticleQuery) ([]model.Article, int64, error) {
	if q.Status != "" && q.Status != model.ArticleDraft && q.Status != model.ArticlePublished {
		q.Status = ""
	}
	return s.articles.List(q)
}
