package repository

import (
	"errors"

	"github.com/blog-platform/backend/internal/model"
	"gorm.io/gorm"
)

type ReactionRepository struct {
	db *gorm.DB
}

func NewReactionRepository(db *gorm.DB) *ReactionRepository {
	return &ReactionRepository{db: db}
}

// Toggle adds the reaction if absent, removes it if present. Returns whether
// the reaction is active afterwards plus the fresh count for that type.
func (r *ReactionRepository) Toggle(articleID, userID uint, typ model.ReactionType) (active bool, count int64, err error) {
	var existing model.Reaction
	err = r.db.Where("article_id = ? AND user_id = ? AND type = ?", articleID, userID, typ).First(&existing).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		reaction := model.Reaction{ArticleID: articleID, UserID: userID, Type: typ}
		if err = r.db.Create(&reaction).Error; err != nil {
			return false, 0, err
		}
		active = true
	case err != nil:
		return false, 0, err
	default:
		if err = r.db.Delete(&existing).Error; err != nil {
			return false, 0, err
		}
		active = false
	}

	if err = r.db.Model(&model.Reaction{}).
		Where("article_id = ? AND type = ?", articleID, typ).
		Count(&count).Error; err != nil {
		return active, 0, err
	}
	return active, count, nil
}

type ReactionStats struct {
	Likes     int64 `json:"likes"`
	Favorites int64 `json:"favorites"`
}

func (r *ReactionRepository) Counts(articleID uint) (*ReactionStats, error) {
	stats := &ReactionStats{}
	err := r.db.Model(&model.Reaction{}).
		Select("COALESCE(SUM(CASE WHEN type = 'like' THEN 1 ELSE 0 END), 0) as likes, COALESCE(SUM(CASE WHEN type = 'favorite' THEN 1 ELSE 0 END), 0) as favorites").
		Where("article_id = ?", articleID).
		Scan(stats).Error
	return stats, err
}

func (r *ReactionRepository) UserFlags(articleID, userID uint) (liked, favorited bool, err error) {
	var reactions []model.Reaction
	err = r.db.Where("article_id = ? AND user_id = ?", articleID, userID).Find(&reactions).Error
	if err != nil {
		return false, false, err
	}
	for _, reaction := range reactions {
		switch reaction.Type {
		case model.ReactionLike:
			liked = true
		case model.ReactionFavorite:
			favorited = true
		}
	}
	return liked, favorited, nil
}
