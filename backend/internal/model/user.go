package model

import "time"

const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

const (
	StatusActive   = "active"
	StatusBanned   = "banned"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	Username     string    `gorm:"uniqueIndex;size:64;not null" json:"username"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	Role         string    `gorm:"size:20;not null;default:user;index" json:"role"`
	Status       string    `gorm:"size:20;not null;default:active;index" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (u *User) IsBanned() bool {
	return u.Status == StatusBanned
}

