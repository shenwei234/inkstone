package repository

import (
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"gorm.io/gorm"
)

type StatRepository struct {
	db *gorm.DB
}

func NewStatRepository(db *gorm.DB) *StatRepository {
	return &StatRepository{db: db}
}

// Record accumulates one request into today's row. newVisitor marks the IP as
// first-seen today, incrementing the unique-visitor counter.
func (r *StatRepository) Record(date string, bytesIn, bytesOut int64, visitorHash string) error {
	err := r.db.Exec(`
		INSERT INTO daily_stats (date, page_views, visitors, bytes_in, bytes_out, updated_at)
		VALUES (?, 1, 0, ?, ?, ?)
		ON CONFLICT (date) DO UPDATE SET
			page_views = daily_stats.page_views + 1,
			bytes_in   = daily_stats.bytes_in + EXCLUDED.bytes_in,
			bytes_out  = daily_stats.bytes_out + EXCLUDED.bytes_out,
			updated_at = EXCLUDED.updated_at
	`, date, bytesIn, bytesOut, time.Now()).Error
	if err != nil {
		return err
	}

	if visitorHash == "" {
		return nil
	}
	// Insert-if-absent: the row count tells us whether this is a new visitor.
	res := r.db.Exec(
		`INSERT INTO visitor_days (date, ip_hash) VALUES (?, ?) ON CONFLICT DO NOTHING`,
		date, visitorHash,
	)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		return r.db.Exec(
			`UPDATE daily_stats SET visitors = visitors + 1 WHERE date = ?`, date,
		).Error
	}
	return nil
}

// Range returns daily stats between two dates (inclusive), oldest first.
func (r *StatRepository) Range(from, to string) ([]model.DailyStat, error) {
	var stats []model.DailyStat
	err := r.db.Where("date >= ? AND date <= ?", from, to).Order("date ASC").Find(&stats).Error
	return stats, err
}

// Cleanup removes per-visitor rows older than the retention window.
func (r *StatRepository) Cleanup(before string) error {
	return r.db.Where("date < ?", before).Delete(&model.VisitorDay{}).Error
}
