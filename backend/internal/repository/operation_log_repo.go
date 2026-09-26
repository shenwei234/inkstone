package repository

import (
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"gorm.io/gorm"
)

// maxExportLogs 限制一次导出的最大条数，避免超大数据量把内存和下载撑爆。
const maxExportLogs = 50000

type OperationLogQuery struct {
	Category string
	Username string
	Keyword  string
	From     *time.Time
	To       *time.Time
	Success  *bool
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

// applyFilters 应用筛选条件（分页除外），List / Export / 统计共用。
func (r *OperationLogRepository) applyFilters(db *gorm.DB, q OperationLogQuery) *gorm.DB {
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
	if q.From != nil {
		db = db.Where("created_at >= ?", *q.From)
	}
	if q.To != nil {
		db = db.Where("created_at <= ?", *q.To)
	}
	if q.Success != nil {
		db = db.Where("success = ?", *q.Success)
	}
	return db
}

func (r *OperationLogRepository) List(q OperationLogQuery) ([]model.OperationLog, int64, error) {
	db := r.applyFilters(r.db.Model(&model.OperationLog{}), q)

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

// Export returns filtered logs for CSV download (no pagination, capped).
func (r *OperationLogRepository) Export(q OperationLogQuery) ([]model.OperationLog, error) {
	db := r.applyFilters(r.db.Model(&model.OperationLog{}), q)
	var logs []model.OperationLog
	err := db.Order("created_at DESC, id DESC").
		Limit(maxExportLogs).
		Find(&logs).Error
	return logs, err
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

func (r *OperationLogRepository) countWhere(query interface{}, args ...interface{}) (int64, error) {
	var count int64
	err := r.db.Model(&model.OperationLog{}).Where(query, args...).Count(&count).Error
	return count, err
}

// CountAll returns the total number of retained logs.
func (r *OperationLogRepository) CountAll() (int64, error) {
	return r.countWhere("1 = 1")
}

// CountToday returns logs created since local midnight.
func (r *OperationLogRepository) CountToday() (int64, error) {
	now := time.Now()
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	return r.countWhere("created_at >= ?", midnight)
}

// CountFailed returns logs recorded with success = false.
func (r *OperationLogRepository) CountFailed() (int64, error) {
	return r.countWhere("success = ?", false)
}
