package repository

import (
	"github.com/shenwei/inkstone/backend/internal/model"
	"gorm.io/gorm"
)

type OperationLogQuery struct {
	Category string
	Username string
	Keyword  string
	Page     int
	PageSize int
}

type OperationLogRepository struct {
	db *gorm.DB
}

func NewOperationLogRepository(db *gorm.DB) *OperationLogRepository {
	return &OperationLogRepository{db: db}
}

func (r *OperationLogRepository) Create(log *model.OperationLog) error {
	return r.db.Create(log).Error
}

func (r *OperationLogRepository) List(q OperationLogQuery) ([]model.OperationLog, int64, error) {
	db := r.db.Model(&model.OperationLog{})

	if q.Category != "" {
		db = db.Where("category = ?", q.Category)
	}
	if q.Username != "" {
		escaped := escapeLike(q.Username)
		db = db.Where("username ILIKE ?", "%"+escaped+"%")
	}
	if q.Keyword != "" {
		escaped := escapeLike(q.Keyword)
		db = db.Where("action ILIKE ? OR detail ILIKE ? OR ip ILIKE ?",
			"%"+escaped+"%", "%"+escaped+"%", "%"+escaped+"%")
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 100 {
		q.PageSize = 20
	}

	var logs []model.OperationLog
	err := db.Order("created_at DESC, id DESC").
		Offset((q.Page - 1) * q.PageSize).
		Limit(q.PageSize).
		Find(&logs).Error
	return logs, total, err
}

// Cleanup removes logs older than the given time.
func (r *OperationLogRepository) Cleanup(before string) error {
	return r.db.Where("created_at < ?", before).Delete(&model.OperationLog{}).Error
}

// CountByCategory returns log counts grouped by category.
func (r *OperationLogRepository) CountByCategory() (map[string]int64, error) {
	type row struct {
		Category string
		Count    int64
	}
	var rows []row
	err := r.db.Model(&model.OperationLog{}).
		Select("category, COUNT(*) as count").
		Group("category").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]int64, len(rows))
	for _, r := range rows {
		out[r.Category] = r.Count
	}
	return out, nil
}
