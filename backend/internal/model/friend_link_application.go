package model

import "time"

// 友链自助申请状态。
const (
	LinkAppPending  = "pending"  // 待审核
	LinkAppApproved = "approved" // 已通过（已转为友链）
	LinkAppRejected = "rejected" // 已拒绝
)

// FriendLinkApplication 是访客自助提交的友链申请，管理员审核通过后
// 转为正式 FriendLink。
type FriendLinkApplication struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	SiteName    string     `gorm:"size:100;not null" json:"site_name"`   // 站点名称
	URL         string     `gorm:"size:500;not null" json:"url"`         // 站点地址
	Description string     `gorm:"size:255" json:"description"`          // 简介
	IconURL     string     `gorm:"size:500" json:"icon_url"`             // 站点图标
	Email       string     `gorm:"size:255" json:"email"`                // 联系方式（可选）
	Status      string     `gorm:"size:16;not null;index" json:"status"` // pending/approved/rejected
	Reason      string     `gorm:"size:255" json:"reason"`               // 拒绝原因（管理员填）
	IPHash      string     `gorm:"size:64" json:"ip_hash"`               // 提交者 IP 哈希（防滥用，不存原值）
	ReviewedBy  uint       `json:"reviewed_by"`                          // 审核人 ID
	ReviewedAt  *time.Time `json:"reviewed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
