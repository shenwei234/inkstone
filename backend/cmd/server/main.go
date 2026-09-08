package main

import (
	"log"

	"github.com/blog-platform/backend/internal/handler"
	"github.com/blog-platform/backend/internal/middleware"
	"github.com/blog-platform/backend/internal/model"
	"github.com/blog-platform/backend/internal/repository"
	"github.com/blog-platform/backend/internal/service"
	"github.com/blog-platform/backend/pkg/config"
	"github.com/blog-platform/backend/pkg/mailer"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	db := repository.NewDB()

	tokens := service.NewTokenManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)

	userRepo := repository.NewUserRepository(db)
	articleRepo := repository.NewArticleRepository(db)
	taxonomyRepo := repository.NewTaxonomyRepository(db)
	commentRepo := repository.NewCommentRepository(db)
	reactionRepo := repository.NewReactionRepository(db)

	settingsSvc := service.NewSettingsService(db)
	mailer := mailer.New(settingsSvc)

	authSvc := service.NewAuthService(userRepo, tokens, settingsSvc)
	articleSvc := service.NewArticleService(articleRepo, taxonomyRepo)
	adminSvc := service.NewAdminService(userRepo, articleRepo)
	commentSvc := service.NewCommentService(commentRepo, articleRepo)
	reactionSvc := service.NewReactionService(reactionRepo, articleRepo)

	authHandler := handler.NewAuthHandler(authSvc)
	articleHandler := handler.NewArticleHandler(articleSvc)
	adminHandler := handler.NewAdminHandler(adminSvc, userRepo, articleSvc, articleRepo, commentSvc)
	taxonomyHandler := handler.NewTaxonomyHandler(taxonomyRepo)
	commentHandler := handler.NewCommentHandler(commentSvc, tokens)
	reactionHandler := handler.NewReactionHandler(reactionSvc)
	rssHandler := handler.NewRSSHandler(articleSvc, cfg.FrontendURL)
	settingsHandler := handler.NewSettingsHandler(settingsSvc, mailer)

	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(middleware.CORS([]string{cfg.FrontendURL}))
	router.MaxMultipartMemory = 12 << 20

	userStatusOK := func(id uint) bool {
		u, err := userRepo.FindByID(id)
		return err == nil && !u.IsBanned()
	}

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	router.GET("/feed.xml", rssHandler.Feed)
	router.Static("/uploads", cfg.UploadDir)

	uploadsHandler := handler.NewUploadsHandler(cfg)

	api := router.Group("/api/v1")
	{
		uploads := api.Group("/uploads", middleware.Auth(tokens, userStatusOK))
		{
			uploads.POST("", uploadsHandler.Create)
		}

		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
			auth.GET("/me", middleware.Auth(tokens, userStatusOK), authHandler.Me)
		}

		api.GET("/categories", taxonomyHandler.ListCategories)
		api.GET("/tags", taxonomyHandler.ListTags)
		api.GET("/site-config", settingsHandler.SiteConfig)

		articles := api.Group("/articles", middleware.OptionalAuth(tokens))
		{
			articles.GET("", articleHandler.List)
			articles.GET("/:id", articleHandler.Get)
			articles.GET("/slug/:slug", articleHandler.GetBySlug)
			articles.GET("/:id/comments", commentHandler.List)
			articles.GET("/:id/reactions", reactionHandler.Stats)

			authed := articles.Group("", middleware.Auth(tokens, userStatusOK))
			{
				authed.POST("", articleHandler.Create)
				authed.PUT("/:id", articleHandler.Update)
				authed.DELETE("/:id", articleHandler.Delete)
				authed.POST("/:id/comments", commentHandler.Create)
				authed.POST("/:id/reactions", reactionHandler.Toggle)
			}
		}

		comments := api.Group("/comments", middleware.Auth(tokens, userStatusOK))
		{
			comments.DELETE("/:id", commentHandler.Delete)
		}

		admin := api.Group("/admin", middleware.Auth(tokens, userStatusOK), middleware.RequireRole(model.RoleAdmin))
		{
			admin.GET("/stats", adminHandler.Stats)
			admin.GET("/users", adminHandler.ListUsers)
			admin.POST("/users", adminHandler.CreateUser)
			admin.PUT("/users/:id/role", adminHandler.UpdateUserRole)
			admin.PUT("/users/:id/status", adminHandler.UpdateUserStatus)
			admin.DELETE("/users/:id", adminHandler.DeleteUser)
			admin.GET("/articles", adminHandler.ListArticles)
			admin.PUT("/articles/:id/status", adminHandler.SetArticleStatus)
			admin.DELETE("/articles/:id", adminHandler.DeleteArticle)
			admin.GET("/comments", adminHandler.ListComments)
			admin.DELETE("/comments/:id", adminHandler.DeleteComment)
			admin.GET("/settings", settingsHandler.Get)
			admin.PUT("/settings", settingsHandler.Update)
			admin.POST("/settings/test-mail", settingsHandler.TestMail)
		}
	}

	log.Printf("server listening on :%s (env=%s)", cfg.Port, cfg.AppEnv)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
