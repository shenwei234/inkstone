package main

import (
	"log"

	"github.com/blog-platform/backend/internal/handler"
	"github.com/blog-platform/backend/internal/middleware"
	"github.com/blog-platform/backend/internal/repository"
	"github.com/blog-platform/backend/internal/service"
	"github.com/blog-platform/backend/pkg/config"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	db := repository.NewDB()

	tokens := service.NewTokenManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)

	userRepo := repository.NewUserRepository(db)
	articleRepo := repository.NewArticleRepository(db)

	authSvc := service.NewAuthService(userRepo, tokens)
	articleSvc := service.NewArticleService(articleRepo)

	authHandler := handler.NewAuthHandler(authSvc)
	articleHandler := handler.NewArticleHandler(articleSvc)

	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(middleware.CORS([]string{cfg.FrontendURL}))

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := router.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
			auth.GET("/me", middleware.Auth(tokens), authHandler.Me)
		}

		articles := api.Group("/articles", middleware.OptionalAuth(tokens))
		{
			articles.GET("", articleHandler.List)
			articles.GET("/:id", articleHandler.Get)
			articles.GET("/slug/:slug", articleHandler.GetBySlug)
			authed := articles.Group("", middleware.Auth(tokens))
			{
				authed.POST("", articleHandler.Create)
				authed.PUT("/:id", articleHandler.Update)
				authed.DELETE("/:id", articleHandler.Delete)
			}
		}
	}

	log.Printf("server listening on :%s (env=%s)", cfg.Port, cfg.AppEnv)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
