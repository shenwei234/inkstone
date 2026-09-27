package repository

import (
	"errors"
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"gorm.io/gorm"
)

type UpdateRepository struct {
	db *gorm.DB
}

func NewUpdateRepository(db *gorm.DB) *UpdateRepository {
	return &UpdateRepository{db: db}
}

func (r *UpdateRepository) Create(rec *model.UpdateRecord) error {
	return r.db.Create(rec).Error
}

func (r *UpdateRepository) Update(rec *model.UpdateRecord) error {
	return r.db.Save(rec).Error
}

func (r *UpdateRepository) FindByID(id uint) (*model.UpdateRecord, error) {
	var rec model.UpdateRecord
	err := r.db.First(&rec, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

// List 返回最近 limit 条记录（新的在前）。
func (r *UpdateRepository) List(limit int) ([]model.UpdateRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	var recs []model.UpdateRecord
	err := r.db.Order("id DESC").Limit(limit).Find(&recs).Error
	return recs, err
}

// Latest 返回最近一条更新记录（不存在时第二个返回值为 false）。
func (r *UpdateRepository) Latest() (*model.UpdateRecord, bool) {
	return r.latestOne("")
}

// FindRunning 返回当前进行中的记录（不存在时第二个返回值为 false）。
func (r *UpdateRepository) FindRunning() (*model.UpdateRecord, bool) {
	var recs []model.UpdateRecord
	if err := r.db.Where("status = ?", model.UpdateStatusRunning).
		Order("id DESC").Limit(1).Find(&recs).Error; err != nil {
		return nil, false
	}
	if len(recs) == 0 {
		return nil, false
	}
	return &recs[0], true
}

// FindInterrupted 查找指定时间窗内中断的更新（running 且 started_at 早于 before）。
// 用于实例重启后的自检：部署中途容器被杀会留下 running 记录，需要自动回滚。
func (r *UpdateRepository) FindInterrupted(before time.Time) (*model.UpdateRecord, bool) {
	var recs []model.UpdateRecord
	if err := r.db.Where("status = ? AND started_at < ?", model.UpdateStatusRunning, before).
		Order("id DESC").Limit(1).Find(&recs).Error; err != nil {
		return nil, false
	}
	if len(recs) == 0 {
		return nil, false
	}
	return &recs[0], true
}

// LatestRollbackable 返回最近一条可回滚的更新（打了回滚 tag；不存在时 error 为 ErrNotFound）。
func (r *UpdateRepository) LatestRollbackable() (*model.UpdateRecord, error) {
	rec, ok := r.latestOne("type = ? AND rollback_tag <> ''", model.UpdateTypeUpdate)
	if !ok {
		return nil, ErrNotFound
	}
	return rec, nil
}

// latestOne 通用「取最新一条」查询（Find 而非 First：避免无记录时 GORM 打 not-found 日志）。
func (r *UpdateRepository) latestOne(where any, args ...any) (*model.UpdateRecord, bool) {
	var recs []model.UpdateRecord
	q := r.db.Order("id DESC").Limit(1)
	if where != nil && where != "" {
		q = q.Where(where, args...)
	}
	if err := q.Find(&recs).Error; err != nil {
		return nil, false
	}
	if len(recs) == 0 {
		return nil, false
	}
	return &recs[0], true
}
