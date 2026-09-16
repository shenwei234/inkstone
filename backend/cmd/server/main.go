package main

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shenwei/inkstone/backend/internal/handler"
	"github.com/shenwei/inkstone/backend/internal/middleware"
	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
	"github.com/shenwei/inkstone/backend/internal/service"
	"github.com/shenwei/inkstone/backend/pkg/config"
	"github.com/shenwei/inkstone/backend/pkg/mailer"
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

	pageRepo := repository.NewPageRepository(db)
	pageSvc := service.NewPageService(pageRepo)

	linkRepo := repository.NewLinkRepository(db)
	linkSvc := service.NewLinkService(linkRepo)
	linkSvc.StartAutoCheck()

	fileRepo := repository.NewFileRepository(db)
	fileSvc := service.NewFileService(fileRepo, settingsSvc, cfg.FilesDir)

	statRepo := repository.NewStatRepository(db)
	statSvc := service.NewStatService(statRepo, settingsSvc)

	captchaSvc := service.NewCaptchaService(settingsSvc, cfg.JWTSecret)
	apiLimiter := middleware.NewSlidingLimiter()

	authHandler := handler.NewAuthHandler(authSvc, captchaSvc, apiLimiter)
	articleHandler := handler.NewArticleHandler(articleSvc, captchaSvc)
	adminHandler := handler.NewAdminHandler(adminSvc, userRepo, articleSvc, articleRepo, commentSvc)
	taxonomyHandler := handler.NewTaxonomyHandler(taxonomyRepo)
	commentHandler := handler.NewCommentHandler(commentSvc, tokens, captchaSvc, apiLimiter)
	reactionHandler := handler.NewReactionHandler(reactionSvc)
	rssHandler := handler.NewRSSHandler(articleSvc, cfg.FrontendURL)
	settingsHandler := handler.NewSettingsHandler(settingsSvc, mailer, captchaSvc)
	pageHandler := handler.NewPageHandler(pageSvc)
	systemHandler := handler.NewSystemHandler(settingsSvc)
	linkHandler := handler.NewLinkHandler(linkSvc)
	fileHandler := handler.NewFileHandler(fileSvc, cfg.PublicAPIURL)
	captchaHandler := handler.NewCaptchaHandler(captchaSvc)
	statHandler := handler.NewStatHandler(statSvc)
	adminTagHandler := handler.NewAdminTagHandler(taxonomyRepo)

	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.TrafficStats(statSvc))
	router.Use(middleware.CORS([]string{cfg.FrontendURL}))
	router.MaxMultipartMemory = 12 << 20

	securityEnabled := func() bool {
		return settingsSvc.BoolValue(service.SettingSecurityEnabled, true)
	}
	rateLimitMiddle := middleware.IPRateLimit(middleware.RateLimitConfig{
		Limiter: apiLimiter,
		LimitFn: func() int {
			if !securityEnabled() {
				return 0
			}
			return settingsSvc.IntValue(service.SettingSecurityAPIMax, 300)
		},
		Window:  time.Minute,
		Message: "api",
	})
	loginLimit := middleware.IPRateLimit(middleware.RateLimitConfig{
		Limiter: apiLimiter,
		LimitFn: func() int {
			if !securityEnabled() {
				return 0
			}
			return settingsSvc.IntValue(service.SettingSecurityLoginMax, 10)
		},
		Window:  15 * time.Minute,
		Message: "login",
	})
	registerLimit := middleware.IPRateLimit(middleware.RateLimitConfig{
		Limiter: apiLimiter,
		LimitFn: func() int {
			if !securityEnabled() {
				return 0
			}
			return settingsSvc.IntValue(service.SettingSecurityRegisterMax, 5)
		},
		Window:  time.Hour,
		Message: "register",
	})
	articleLimit := middleware.IPRateLimit(middleware.RateLimitConfig{
		Limiter: apiLimiter,
		LimitFn: func() int {
			if !securityEnabled() {
				return 0
			}
			return settingsSvc.IntValue(service.SettingSecurityCommentMax, 10)
		},
		Window:  10 * time.Minute,
		Message: "article",
	})
	commentLimit := middleware.IPRateLimit(middleware.RateLimitConfig{
		Limiter: apiLimiter,
		LimitFn: func() int {
			if !securityEnabled() {
				return 0
			}
			return settingsSvc.IntValue(service.SettingSecurityCommentMax, 10)
		},
		Window:  10 * time.Minute,
		Message: "comment",
	})

	userStatusOK := func(id uint) bool {
		u, err := userRepo.FindByID(id)
		return err == nil && !u.IsBanned()
	}

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	router.GET("/feed.xml", rssHandler.Feed)
	router.Static("/uploads", cfg.UploadDir)
	router.Static("/files", cfg.FilesDir)

	uploadsHandler := handler.NewUploadsHandler(cfg)

	api := router.Group("/api/v1", rateLimitMiddle)
	{
		uploads := api.Group("/uploads", middleware.Auth(tokens, userStatusOK))
		{
			uploads.POST("", uploadsHandler.Create)
		}

		auth := api.Group("/auth")
		{
			auth.POST("/register", registerLimit, authHandler.Register)
			auth.POST("/login", loginLimit, authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
			auth.GET("/me", middleware.Auth(tokens, userStatusOK), authHandler.Me)
			authAuthed := api.Group("/auth", middleware.Auth(tokens, userStatusOK))
			{
				authAuthed.PUT("/password", authHandler.ChangePassword)
				authAuthed.PUT("/profile", authHandler.UpdateProfile)
				authAuthed.GET("/my-comments", commentHandler.MyComments)
			}
		}

		api.GET("/system/info", systemHandler.Info)

		api.GET("/categories", taxonomyHandler.ListCategories)
		api.GET("/tags", taxonomyHandler.ListTags)
		api.GET("/site-config", settingsHandler.SiteConfig)
		api.GET("/captcha/challenge", captchaHandler.Challenge)
		api.GET("/pages", pageHandler.ListPublic)
		api.GET("/pages/:slug", pageHandler.GetBySlug)
		api.GET("/links", linkHandler.ListPublic)

		articles := api.Group("/articles", middleware.OptionalAuth(tokens))
		{
			articles.GET("", articleHandler.List)
			articles.GET("/:id", articleHandler.Get)
			articles.GET("/slug/:slug", articleHandler.GetBySlug)
			articles.GET("/:id/comments", commentHandler.List)
			articles.GET("/:id/reactions", reactionHandler.Stats)

			authed := articles.Group("", middleware.Auth(tokens, userStatusOK))
			{
				authed.POST("", articleLimit, articleHandler.Create)
				authed.PUT("/:id", articleHandler.Update)
				authed.DELETE("/:id", articleHandler.Delete)
				authed.POST("/:id/comments", commentLimit, commentHandler.Create)
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
			admin.GET("/stats/traffic", statHandler.Traffic)
			admin.GET("/stats/resources", statHandler.Resources)
			admin.GET("/users", adminHandler.ListUsers)
			admin.POST("/users", adminHandler.CreateUser)
			admin.PUT("/users/:id/role", adminHandler.UpdateUserRole)
			admin.PUT("/users/:id/status", adminHandler.UpdateUserStatus)
			admin.DELETE("/users/:id", adminHandler.DeleteUser)
			admin.GET("/articles", adminHandler.ListArticles)
			admin.PUT("/articles/:id/status", adminHandler.SetArticleStatus)
			admin.DELETE("/articles/:id", adminHandler.DeleteArticle)
			admin.POST("/tags", adminTagHandler.Create)
			admin.PUT("/tags/:id", adminTagHandler.Update)
			admin.DELETE("/tags/:id", adminTagHandler.Delete)
			admin.GET("/comments", adminHandler.ListComments)
			admin.DELETE("/comments/:id", adminHandler.DeleteComment)
			admin.GET("/settings", settingsHandler.Get)
			admin.PUT("/settings", settingsHandler.Update)
			admin.POST("/settings/test-mail", settingsHandler.TestMail)
			admin.GET("/updates", systemHandler.Changelog)
			admin.POST("/updates/check", systemHandler.CheckUpdates)
			admin.PUT("/updates/manifest", systemHandler.SaveManifestURL)
			admin.GET("/links", linkHandler.ListAdmin)
			admin.POST("/links", linkHandler.Create)
			admin.PUT("/links/:id", linkHandler.Update)
			admin.DELETE("/links/:id", linkHandler.Delete)
			admin.POST("/links/check", linkHandler.CheckAll)
			admin.POST("/links/:id/check", linkHandler.CheckOne)
			admin.GET("/files", fileHandler.List)
			admin.POST("/files", fileHandler.Upload)
			admin.GET("/files/:id/download", fileHandler.Download)
			admin.DELETE("/files/:id", fileHandler.Delete)
			admin.GET("/pages", pageHandler.ListAll)
			admin.POST("/pages", pageHandler.Create)
			admin.GET("/pages/:id", pageHandler.Get)
			admin.PUT("/pages/:id", pageHandler.Update)
			admin.DELETE("/pages/:id", pageHandler.Delete)
		}
	}

	log.Printf("server listening on :%s (env=%s)", cfg.Port, cfg.AppEnv)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
