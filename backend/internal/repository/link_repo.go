package repository

import (
	"errors"

	"github.com/shenwei/inkstone/backend/internal/model"
	"gorm.io/gorm"
)

type LinkRepository struct {
	db *gorm.DB
}

func NewLinkRepository(db *gorm.DB) *LinkRepository {
	return &LinkRepository{db: db}
}

func (r *LinkRepository) Create(link *model.FriendLink) error {
	return r.db.Create(link).Error
}

func (r *LinkRepository) Update(link *model.FriendLink) error {
	res := r.db.Save(link)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *LinkRepository) Delete(id uint) error {
	res := r.db.Delete(&model.FriendLink{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *LinkRepository) FindByID(id uint) (*model.FriendLink, error) {
	var link model.FriendLink
	err := r.db.First(&link, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &link, nil
}

func (r *LinkRepository) List() ([]model.FriendLink, error) {
	var links []model.FriendLink
	err := r.db.Order("sort_order ASC, id ASC").Find(&links).Error
	return links, err
}
