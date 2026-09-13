package repository

import (
	"errors"

	"github.com/shenwei/inkstone/backend/internal/model"
	"gorm.io/gorm"
)

type FileRepository struct {
	db *gorm.DB
}

func NewFileRepository(db *gorm.DB) *FileRepository {
	return &FileRepository{db: db}
}

func (r *FileRepository) Create(file *model.FileAsset) error {
	return r.db.Create(file).Error
}

func (r *FileRepository) FindByID(id uint) (*model.FileAsset, error) {
	var file model.FileAsset
	err := r.db.First(&file, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &file, nil
}

func (r *FileRepository) Delete(id uint) error {
	res := r.db.Delete(&model.FileAsset{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *FileRepository) List(page, pageSize int, query string) ([]model.FileAsset, int64, error) {
	db := r.db.Model(&model.FileAsset{})
	if query != "" {
		escaped := escapeLike(query)
		db = db.Where("original_name ILIKE ? OR stored_name ILIKE ?", "%"+escaped+"%", "%"+escaped+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	var files []model.FileAsset
	err := db.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&files).Error
	return files, total, err
}

func (r *FileRepository) TotalSize() (int64, error) {
	var total int64
	err := r.db.Model(&model.FileAsset{}).Select("COALESCE(SUM(size), 0)").Scan(&total).Error
	return total, err
}
