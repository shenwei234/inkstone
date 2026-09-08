package repository

import (
	"errors"

	"github.com/blog-platform/backend/internal/model"
	"gorm.io/gorm"
)

type CategoryCount struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	ArticleCount int64  `json:"article_count"`
}

type TagCount struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	ArticleCount int64  `json:"article_count"`
}

type TaxonomyRepository struct {
	db *gorm.DB
}

func NewTaxonomyRepository(db *gorm.DB) *TaxonomyRepository {
	return &TaxonomyRepository{db: db}
}

func (r *TaxonomyRepository) ListCategories() ([]CategoryCount, error) {
	var out []CategoryCount
	err := r.db.Table("categories").
		Select("categories.id, categories.name, categories.slug, COUNT(articles.id) as article_count").
		Joins("LEFT JOIN articles ON articles.category_id = categories.id").
		Group("categories.id").
		Order("article_count DESC, categories.name ASC").
		Scan(&out).Error
	return out, err
}

func (r *TaxonomyRepository) ListTags() ([]TagCount, error) {
	var out []TagCount
	err := r.db.Table("tags").
		Select("tags.id, tags.name, tags.slug, COUNT(article_tags.article_id) as article_count").
		Joins("LEFT JOIN article_tags ON article_tags.tag_id = tags.id").
		Group("tags.id").
		Order("article_count DESC, tags.name ASC").
		Scan(&out).Error
	return out, err
}

func (r *TaxonomyRepository) FindCategoryByID(id uint) (*model.Category, error) {
	var c model.Category
	err := r.db.First(&c, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *TaxonomyRepository) FindOrCreateCategory(name string) (*model.Category, error) {
	slug := Slugify(name)
	var c model.Category
	err := r.db.Where("slug = ?", slug).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c = model.Category{Name: name, Slug: slug}
		err = r.db.Create(&c).Error
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *TaxonomyRepository) FindOrCreateTags(names []string) ([]model.Tag, error) {
	tags := make([]model.Tag, 0, len(names))
	for _, name := range names {
		name = trimSpace(name)
		if name == "" {
			continue
		}
		slug := Slugify(name)
		var t model.Tag
		err := r.db.Where("slug = ?", slug).First(&t).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			t = model.Tag{Name: name, Slug: slug}
			err = r.db.Create(&t).Error
		}
		if err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	// de-duplicate by id
	seen := make(map[uint]bool)
	unique := make([]model.Tag, 0, len(tags))
	for _, t := range tags {
		if !seen[t.ID] {
			seen[t.ID] = true
			unique = append(unique, t)
		}
	}
	return unique, nil
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
