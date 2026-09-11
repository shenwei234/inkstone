package model

import "time"

// Setting stores one site configuration entry as a key/value pair.
// Known keys and their defaults live in the settings service.
type Setting struct {
	Key       string    `gorm:"primaryKey;size:100" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}
