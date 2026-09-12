package middleware

import (
	"net/http"
	"strings"

	"github.com/shenwei/inkstone/backend/internal/service"
	"github.com/gin-gonic/gin"
)

const (
	ContextUserKey = "currentUser"
)

type CurrentUser struct {
	ID   uint
	Role string
}

// Auth requires a valid access token. When checkUser is provided, the user is
// also verified against the database so banned/deleted accounts are rejected
// even while their access token is still unexpired.
func Auth(tokens *service.TokenManager, checkUser func(id uint) bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
			return
		}

		claims, err := tokens.Parse(parts[1], service.TokenTypeAccess)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		if checkUser != nil && !checkUser(claims.UserID) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "该账号已被封禁，请联系管理员"})
			return
		}

		c.Set(ContextUserKey, CurrentUser{ID: claims.UserID, Role: claims.Role})
		c.Next()
	}
}

func GetCurrentUser(c *gin.Context) (CurrentUser, bool) {
	v, ok := c.Get(ContextUserKey)
	if !ok {
		return CurrentUser{}, false
	}
	user, ok := v.(CurrentUser)
	return user, ok
}

// RequireRole aborts unless the authenticated user has one of the allowed roles.
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := GetCurrentUser(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		for _, r := range roles {
			if user.Role == r {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "需要管理员权限"})
	}
}

// OptionalAuth parses the Bearer token when present and stores the current
// user, but lets the request continue anonymously otherwise.
func OptionalAuth(tokens *service.TokenManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.Next()
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && parts[1] != "" {
			if claims, err := tokens.Parse(parts[1], service.TokenTypeAccess); err == nil {
				c.Set(ContextUserKey, CurrentUser{ID: claims.UserID, Role: claims.Role})
			}
		}
		c.Next()
	}
}
