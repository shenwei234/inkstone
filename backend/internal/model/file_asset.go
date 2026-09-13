package model

import "time"

// FileAsset is a file managed by the admin file manager.
type FileAsset struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	StoredName   string    `gorm:"uniqueIndex;size:255;not null" json:"stored_name"`
	OriginalName string    `gorm:"size:255;not null" json:"original_name"`
	Size         int64     `gorm:"not null;default:0" json:"size"`
	MimeType     string    `gorm:"size:150" json:"mime_type"`
	UploaderID   uint      `gorm:"index" json:"uploader_id"`
	CreatedAt    time.Time `json:"created_at"`
}
