package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
)

type FileService struct {
	files    *repository.FileRepository
	settings *SettingsService
	dir      string
}

func NewFileService(files *repository.FileRepository, settings *SettingsService, dir string) *FileService {
	return &FileService{files: files, settings: settings, dir: dir}
}

func (s *FileService) Dir() string {
	return s.dir
}

// MaxUploadBytes reads the admin-configured upload limit.
func (s *FileService) MaxUploadBytes() int64 {
	mb := s.settings.IntValue(SettingUploadMaxMB, 50)
	if mb <= 0 {
		mb = 50
	}
	return int64(mb) << 20
}

func (s *FileService) UploadSpeedKB() int {
	return s.settings.IntValue(SettingUploadSpeedKB, 0)
}

func (s *FileService) DownloadSpeedKB() int {
	return s.settings.IntValue(SettingDownloadSpeedKB, 0)
}

// Save streams src into the managed files directory, applying the configured
// upload speed limit. size is the declared size (from the multipart header).
func (s *FileService) Save(originalName string, size int64, src io.Reader, uploaderID uint) (*model.FileAsset, error) {
	if size > s.MaxUploadBytes() {
		return nil, NewValidationError(fmt.Sprintf("文件超过大小限制（最大 %d MB）", s.MaxUploadBytes()>>20))
	}
	originalName = filepath.Base(strings.TrimSpace(originalName))
	if originalName == "" || originalName == "." {
		return nil, NewValidationError("文件名无效")
	}

	ext := strings.ToLower(filepath.Ext(originalName))
	if len(ext) > 16 {
		ext = ""
	}
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	stored := hex.EncodeToString(buf) + ext

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return nil, err
	}
	dst, err := os.Create(filepath.Join(s.dir, stored))
	if err != nil {
		return nil, err
	}
	defer dst.Close()

	written, err := CopyWithLimit(dst, src, s.UploadSpeedKB())
	if err != nil {
		os.Remove(filepath.Join(s.dir, stored))
		return nil, err
	}
	// Guard against a lying Content-Length header.
	if written > s.MaxUploadBytes() {
		os.Remove(filepath.Join(s.dir, stored))
		return nil, NewValidationError(fmt.Sprintf("文件超过大小限制（最大 %d MB）", s.MaxUploadBytes()>>20))
	}

	asset := &model.FileAsset{
		StoredName:   stored,
		OriginalName: originalName,
		Size:         written,
		MimeType:     guessMime(ext),
		UploaderID:   uploaderID,
	}
	if err := s.files.Create(asset); err != nil {
		os.Remove(filepath.Join(s.dir, stored))
		return nil, err
	}
	return asset, nil
}

func (s *FileService) List(page, pageSize int, query string) ([]model.FileAsset, int64, error) {
	return s.files.List(page, pageSize, query)
}

func (s *FileService) Get(id uint) (*model.FileAsset, error) {
	return s.files.FindByID(id)
}

// Open returns a reader for the stored file.
func (s *FileService) Open(asset *model.FileAsset) (*os.File, error) {
	return os.Open(filepath.Join(s.dir, asset.StoredName))
}

func (s *FileService) Delete(id uint) error {
	asset, err := s.files.FindByID(id)
	if err != nil {
		return err
	}
	if err := s.files.Delete(id); err != nil {
		return err
	}
	os.Remove(filepath.Join(s.dir, asset.StoredName))
	return nil
}

func (s *FileService) TotalSize() (int64, error) {
	return s.files.TotalSize()
}

// CopyWithLimit copies src to dst, pacing the transfer to at most kbPerSec
// kilobytes per second (0 = unlimited). It returns the bytes written.
func CopyWithLimit(dst io.Writer, src io.Reader, kbPerSec int) (int64, error) {
	const chunk = 32 * 1024
	buf := make([]byte, chunk)
	var total int64
	start := time.Now()

	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, writeErr := dst.Write(buf[:n]); writeErr != nil {
				return total, writeErr
			}
			total += int64(n)

			if kbPerSec > 0 {
				expected := time.Duration(float64(total) / float64(kbPerSec*1024) * float64(time.Second))
				if elapsed := time.Since(start); expected > elapsed {
					time.Sleep(expected - elapsed)
				}
			}
			if f, ok := dst.(interface{ Flush() }); ok && kbPerSec > 0 {
				f.Flush()
			}
		}
		if readErr == io.EOF {
			return total, nil
		}
		if readErr != nil {
			return total, readErr
		}
	}
}

func guessMime(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".zip":
		return "application/zip"
	case ".txt", ".md":
		return "text/plain; charset=utf-8"
	case ".json":
		return "application/json"
	case ".mp4":
		return "video/mp4"
	case ".mp3":
		return "audio/mpeg"
	default:
		return "application/octet-stream"
	}
}
