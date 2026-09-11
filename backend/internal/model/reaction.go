package model

import "time"

type ReactionType string

const (
	ReactionLike     ReactionType = "like"
	ReactionFavorite ReactionType = "favorite"
)

type Reaction struct {
	UserID    uint         `gorm:"primaryKey;autoIncrement:false" json:"user_id"`
	ArticleID uint         `gorm:"primaryKey;autoIncrement:false" json:"article_id"`
	Type      ReactionType `gorm:"size:20;not null;primaryKey" json:"type"`
	CreatedAt time.Time    `json:"created_at"`
}
