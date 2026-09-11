package repository

import (
	"errors"
	"fmt"

	"github.com/blog-platform/backend/internal/model"
	"gorm.io/gorm"
)

type PageRepository struct {
	db *gorm.DB
}

func NewPageRepository(db *gorm.DB) *PageRepository {
	return &PageRepository{db: db}
}

func (r *PageRepository) Create(page *model.Page) error {
	return r.db.Create(page).Error
}

func (r *PageRepository) Update(page *model.Page) error {
	return r.db.Save(page).Error
}

func (r *PageRepository) Delete(id uint) error {
	res := r.db.Delete(&model.Page{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PageRepository) FindByID(id uint) (*model.Page, error) {
	var page model.Page
	err := r.db.First(&page, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &page, nil
}

func (r *PageRepository) FindBySlug(slug string) (*model.Page, error) {
	var page model.Page
	err := r.db.Where("slug = ?", slug).First(&page).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &page, nil
}

func (r *PageRepository) List(includeUnpublished bool) ([]model.Page, error) {
	var pages []model.Page
	db := r.db
	if !includeUnpublished {
		db = db.Where("status = ?", "published")
	}
	err := db.Order("sort_order ASC, id ASC").Find(&pages).Error
	return pages, err
}

// NormalizePageSlug ensures slugs are URL-safe and unique.
func (r *PageRepository) NormalizePageSlug(title, fallback string) string {
	slug := Slugify(title)
	if slug == "" || slug == "article" {
		slug = fallback
	}
	base := slug
	for i := 2; ; i++ {
		var count int64
		r.db.Model(&model.Page{}).Where("slug = ?", slug).Count(&count)
		if count == 0 {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	return slug
}
