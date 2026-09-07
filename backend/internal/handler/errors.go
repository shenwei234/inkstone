package handler

import (
	"errors"
	"net/http"

	"github.com/blog-platform/backend/internal/repository"
	"github.com/blog-platform/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// errorResponse maps domain errors to HTTP responses.
func errorResponse(c *gin.Context, err error) {
	var validationErr *service.ValidationError
	switch {
	case errors.As(err, &validationErr):
		c.JSON(http.StatusBadRequest, gin.H{"error": validationErr.Message})
	case errors.Is(err, service.ErrInvalidCredentials):
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
	case errors.Is(err, service.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "没有权限执行此操作"})
	case errors.Is(err, repository.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "资源不存在"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}
