package repository

import (
	"errors"

	"github.com/shenwei/inkstone/backend/internal/model"
	"gorm.io/gorm"
)

type CommentRepository struct {
	db *gorm.DB
}

func NewCommentRepository(db *gorm.DB) *CommentRepository {
	return &CommentRepository{db: db}
}

func (r *CommentRepository) Create(comment *model.Comment) error {
	if err := r.db.Create(comment).Error; err != nil {
		return err
	}
	// Reload with associations populated.
	return r.db.Preload("User").First(comment, comment.ID).Error
}

func (r *CommentRepository) FindByID(id uint) (*model.Comment, error) {
	var c model.Comment
	err := r.db.Preload("User").First(&c, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CommentRepository) ListByArticle(articleID uint) ([]model.Comment, error) {
	var comments []model.Comment
	err := r.db.Preload("User").
		Where("article_id = ?", articleID).
		Order("created_at ASC").
		Find(&comments).Error
	return comments, err
}

func (r *CommentRepository) ListAll(page, pageSize int) ([]model.Comment, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	var total int64
	if err := r.db.Model(&model.Comment{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var comments []model.Comment
	err := r.db.Preload("User").
		Preload("Article").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&comments).Error
	return comments, total, err
}

func (r *CommentRepository) ListByUser(userID uint, page, pageSize int) ([]model.Comment, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	var total int64
	if err := r.db.Model(&model.Comment{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var comments []model.Comment
	err := r.db.Preload("User").
		Preload("Article").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&comments).Error
	return comments, total, err
}

func (r *CommentRepository) Delete(id uint) error {
	res := r.db.Delete(&model.Comment{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
