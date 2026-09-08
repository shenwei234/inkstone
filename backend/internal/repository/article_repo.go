package repository

import (
	"errors"
	"strings"

	"github.com/blog-platform/backend/internal/model"
	"gorm.io/gorm"
)

type ArticleQuery struct {
	AuthorID     uint
	Status       string
	All          bool
	CategorySlug string
	TagSlug      string
	Search       string
	Page         int
	PageSize     int
}

type ArticleRepository struct {
	db *gorm.DB
}

func NewArticleRepository(db *gorm.DB) *ArticleRepository {
	return &ArticleRepository{db: db}
}

func (r *ArticleRepository) Create(article *model.Article) error {
	return r.db.Create(article).Error
}

func (r *ArticleRepository) Update(article *model.Article) error {
	return r.db.Save(article).Error
}

func (r *ArticleRepository) Delete(id, authorID uint) error {
	result := r.db.Where("id = ? AND author_id = ?", id, authorID).Delete(&model.Article{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *ArticleRepository) DeleteAny(id uint) error {
	result := r.db.Delete(&model.Article{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *ArticleRepository) DeleteByAuthor(authorID uint) error {
	return r.db.Where("author_id = ?", authorID).Delete(&model.Article{}).Error
}

func (r *ArticleRepository) CountAll() (int64, error) {
	var n int64
	err := r.db.Model(&model.Article{}).Count(&n).Error
	return n, err
}

func (r *ArticleRepository) CountByStatus(status string) (int64, error) {
	var n int64
	err := r.db.Model(&model.Article{}).Where("status = ?", status).Count(&n).Error
	return n, err
}

func (r *ArticleRepository) FindByID(id uint) (*model.Article, error) {
	var article model.Article
	err := r.db.Preload("Author").Preload("Category").Preload("Tags").First(&article, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &article, nil
}

func (r *ArticleRepository) FindBySlug(slug string) (*model.Article, error) {
	var article model.Article
	err := r.db.Preload("Author").Preload("Category").Preload("Tags").
		Where("slug = ?", slug).First(&article).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &article, nil
}

// IncrementViews atomically bumps the view counter.
func (r *ArticleRepository) IncrementViews(id uint) error {
	return r.db.Model(&model.Article{}).Where("id = ?", id).
		UpdateColumn("views", gorm.Expr("views + 1")).Error
}

// ReplaceTags swaps the tag association for an article.
func (r *ArticleRepository) ReplaceTags(article *model.Article, tags []model.Tag) error {
	return r.db.Model(article).Association("Tags").Replace(tags)
}

func (r *ArticleRepository) List(q ArticleQuery) ([]model.Article, int64, error) {
	db := r.db.Model(&model.Article{})

	if q.AuthorID > 0 {
		db = db.Where("articles.author_id = ?", q.AuthorID)
	}
	switch {
	case q.Status != "":
		db = db.Where("articles.status = ?", q.Status)
	case !q.All:
		db = db.Where("articles.status = ?", model.ArticlePublished)
	}
	if q.CategorySlug != "" {
		db = db.Joins("JOIN categories ON categories.id = articles.category_id").
			Where("categories.slug = ?", q.CategorySlug)
	}
	if q.TagSlug != "" {
		db = db.Joins("JOIN article_tags at_filter ON at_filter.article_id = articles.id").
			Joins("JOIN tags t_filter ON t_filter.id = at_filter.tag_id").
			Where("t_filter.slug = ?", q.TagSlug)
	}
	if q.Search != "" {
		like := "%" + q.Search + "%"
		db = db.Where("articles.title ILIKE ? OR articles.content ILIKE ?", like, like)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page, pageSize := normalizePage(q.Page, q.PageSize)
	var articles []model.Article
	err := db.Preload("Author").
		Preload("Category").
		Preload("Tags").
		Order("articles.published_at DESC NULLS LAST, articles.id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&articles).Error
	if err != nil {
		return nil, 0, err
	}
	return articles, total, nil
}

func normalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 50 {
		pageSize = 50
	}
	return page, pageSize
}

// Slugify converts a title into a URL-safe slug. ASCII letters/digits are
// kept, spaces and punctuation become hyphens, CJK and other letters are
// preserved as-is.
func Slugify(title string) string {
	s := strings.ToLower(strings.TrimSpace(title))
	var b strings.Builder
	lastHyphen := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastHyphen = false
		case r == ' ' || r == '-' || r == '_' || r == '.':
			if !lastHyphen && b.Len() > 0 {
				b.WriteRune('-')
				lastHyphen = true
			}
		default:
			b.WriteRune(r)
			lastHyphen = false
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "article"
	}
	if len(out) > 200 {
		out = out[:200]
	}
	return out
}
