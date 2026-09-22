package handler

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/pkg/config"
)

const maxUploadBytes = 10 << 20 // 10MB

var allowedImageExt = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true,
	".gif": true, ".webp": true, ".avif": true,
}

type UploadsHandler struct {
	cfg *config.Config
}

func NewUploadsHandler(cfg *config.Config) *UploadsHandler {
	return &UploadsHandler{cfg: cfg}
}

// Create handles POST /api/v1/uploads — multipart image upload saved to the
// local uploads directory (WordPress-style uploads folder).
func (h *UploadsHandler) Create(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择要上传的文件"})
		return
	}
	if file.Size > maxUploadBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片不能超过 10MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedImageExt[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 jpg/png/gif/webp/avif 图片"})
		return
	}

	if err := os.MkdirAll(h.cfg.UploadDir, 0o755); err != nil {
		errorResponse(c, err)
		return
	}

	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		errorResponse(c, err)
		return
	}
	name := hex.EncodeToString(buf) + ext
	dst := filepath.Join(h.cfg.UploadDir, name)

	src, err := file.Open()
	if err != nil {
		errorResponse(c, err)
		return
	}
	defer src.Close()

	out, err := os.Create(dst)
	if err != nil {
		errorResponse(c, err)
		return
	}
	defer out.Close()

	// 客户端声明的 file.Size 可伪造，必须限制实际写入的字节数，防止磁盘被打满
	written, err := io.Copy(out, io.LimitReader(src, maxUploadBytes+1))
	if err != nil {
		_ = os.Remove(dst)
		errorResponse(c, err)
		return
	}
	if written > maxUploadBytes {
		_ = os.Remove(dst)
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片不能超过 10MB"})
		return
	}

	url := strings.TrimSuffix(h.cfg.AbsoluteUploadBase(), "/") + "/uploads/" + name
	c.JSON(http.StatusCreated, gin.H{"url": url, "filename": name})
}
