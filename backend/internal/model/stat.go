package model

import "time"

// DailyStat aggregates one day of site traffic. A single row per day keeps
// the dashboard queries cheap.
type DailyStat struct {
	Date      string    `gorm:"primaryKey;size:10" json:"date"` // YYYY-MM-DD
	PageViews int64     `gorm:"not null;default:0" json:"page_views"`
	Visitors  int64     `gorm:"not null;default:0" json:"visitors"`
	BytesIn   int64     `gorm:"not null;default:0" json:"bytes_in"`
	BytesOut  int64     `gorm:"not null;default:0" json:"bytes_out"`
	UpdatedAt time.Time `json:"updated_at"`
}

// VisitorDay tracks unique visitors per day (one row per IP per day).
type VisitorDay struct {
	Date   string `gorm:"primaryKey;size:10" json:"date"`
	IPHash string `gorm:"primaryKey;size:64" json:"ip_hash"`
}
