package model

import "time"

const (
	ArticleDraft     = "draft"
	ArticlePublished = "published"
)

type Article struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	AuthorID    uint       `gorm:"index;not null" json:"author_id"`
	Author      User       `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
	CategoryID  *uint      `gorm:"index" json:"category_id"`
	Category    *Category  `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Title       string     `gorm:"size:255;not null" json:"title"`
	Slug        string     `gorm:"uniqueIndex;size:255;not null" json:"slug"`
	Content     string     `gorm:"type:text;not null" json:"content"`
	Status      string     `gorm:"size:20;not null;default:draft;index" json:"status"`
	Views       int64      `gorm:"not null;default:0" json:"views"`
	PublishedAt *time.Time `json:"published_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Tags        []Tag      `gorm:"many2many:article_tags" json:"tags,omitempty"`
}
