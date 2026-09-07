package repository

import (
	"errors"

	"github.com/blog-platform/backend/internal/model"
	"gorm.io/gorm"
)

var (
	ErrNotFound      = errors.New("record not found")
	ErrEmailTaken    = errors.New("email already registered")
	ErrUsernameTaken = errors.New("username already taken")
)

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(user *model.User) error {
	err := r.db.Create(user).Error
	if err != nil && isUniqueViolation(err) {
		return ErrEmailTaken
	}
	return err
}

func (r *UserRepository) FindByEmail(email string) (*model.User, error) {
	var user model.User
	err := r.db.Where("email = ?", email).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) FindByID(id uint) (*model.User, error) {
	var user model.User
	err := r.db.First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// isUniqueViolation reports whether err is a Postgres unique constraint
// violation (SQLSTATE 23505).
func isUniqueViolation(err error) bool {
	return err != nil && errors.Is(err, gorm.ErrDuplicatedKey)
}
