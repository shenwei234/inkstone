package model

import "time"

// FriendLink is a blogroll entry with health-check metadata.
type FriendLink struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	Name          string     `gorm:"size:100;not null" json:"name"`
	URL           string     `gorm:"size:500;not null" json:"url"` // 友链跳转地址
	CheckURL      string     `gorm:"size:500" json:"check_url"`    // 检测页面（为空则用 URL）
	IconURL       string     `gorm:"size:500" json:"icon_url"`     // 网站图标
	Description   string     `gorm:"size:255" json:"description"`  // 简介（可选）
	SortOrder     int        `gorm:"not null;default:0" json:"sort_order"`
	Available     bool       `gorm:"not null;default:true" json:"available"` // 最近一次检测是否可达
	LastCheckedAt *time.Time `json:"last_checked_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}
