package model

import "time"

const (
	LogCategoryAuth    = "auth"    // 登录、注册、改密
	LogCategoryArticle = "article" // 文章增删改
	LogCategoryUser    = "user"    // 用户管理
	LogCategoryComment = "comment" // 评论管理
	LogCategorySetting = "setting" // 设置变更
	LogCategoryFile    = "file"    // 文件管理
	LogCategoryLink    = "link"    // 友链管理
	LogCategoryPage    = "page"    // 页面管理
	LogCategoryOther   = "other"
)

// OperationLog records admin / system actions for auditing.
type OperationLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index" json:"user_id"`
	Username  string    `gorm:"size:64" json:"username"`
	Category  string    `gorm:"size:20;index" json:"category"`
	Action    string    `gorm:"size:100;not null" json:"action"`
	Detail    string    `gorm:"size:500" json:"detail"`
	IP        string    `gorm:"size:64;index" json:"ip"`
	UserAgent string    `gorm:"size:255" json:"user_agent"`
	Success   bool      `gorm:"not null;default:true" json:"success"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}
