package main

import (
	"log"
	"path/filepath"
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
	linkSvc := service.NewLinkService(linkRepo, cfg.FrontendURL)
	linkSvc.StartAutoCheck()

	fileRepo := repository.NewFileRepository(db)
	fileSvc := service.NewFileService(fileRepo, settingsSvc, cfg.FilesDir)

	statRepo := repository.NewStatRepository(db)
	statSvc := service.NewStatService(statRepo, settingsSvc)
	logRepo := repository.NewOperationLogRepository(db)
	logSvc := service.NewLogService(logRepo)

	emailCodeSvc := service.NewEmailCodeService(settingsSvc, mailer)
	geetestSvc := service.NewGeetestService(settingsSvc)
	apiLimiter := middleware.NewSlidingLimiter()

	authHandler := handler.NewAuthHandler(authSvc, emailCodeSvc, geetestSvc, apiLimiter, logSvc)
	articleHandler := handler.NewArticleHandler(articleSvc, logSvc)
	adminHandler := handler.NewAdminHandler(adminSvc, userRepo, articleSvc, articleRepo, commentSvc, logSvc)
	taxonomyHandler := handler.NewTaxonomyHandler(taxonomyRepo)
	commentHandler := handler.NewCommentHandler(commentSvc, tokens, geetestSvc, apiLimiter, logSvc)
	reactionHandler := handler.NewReactionHandler(reactionSvc)
	rssHandler := handler.NewRSSHandler(articleSvc, cfg.FrontendURL)
	sitemapHandler := handler.NewSitemapHandler(articleSvc, pageSvc, taxonomyRepo, cfg.FrontendURL)
	settingsHandler := handler.NewSettingsHandler(settingsSvc, mailer, emailCodeSvc, geetestSvc, logSvc)
	pageHandler := handler.NewPageHandler(pageSvc, logSvc)
	// dataDir 持久化更新验证状态（随 uploads_data 卷跨容器重建保留）
	updateAgent := service.NewUpdateAgent(settingsSvc, cfg.FrontendURL, filepath.Dir(cfg.UploadDir))
	systemHandler := handler.NewSystemHandler(settingsSvc, updateAgent, logSvc)
	linkHandler := handler.NewLinkHandler(linkSvc, logSvc)
	fileHandler := handler.NewFileHandler(fileSvc, cfg.PublicAPIURL, logSvc)
	statHandler := handler.NewStatHandler(statSvc)
	logHandler := handler.NewLogHandler(logSvc)
	emailCodeHandler := handler.NewEmailCodeHandler(emailCodeSvc)
	adminTagHandler := handler.NewAdminTagHandler(taxonomyRepo, logSvc)

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

	userStatusOK := func(id uint) (string, bool) {
		u, err := userRepo.FindByID(id)
		if err != nil || u.IsBanned() {
			return "", false
		}
		return u.Username, true
	}

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	router.GET("/feed.xml", rssHandler.Feed)
	router.GET("/sitemap.xml", sitemapHandler.Sitemap)
	router.GET("/robots.txt", sitemapHandler.Robots)
	router.Static("/uploads", cfg.UploadDir)
	router.Static("/files", cfg.FilesDir)

	uploadsHandler := handler.NewUploadsHandler(cfg)

	// 启动更新代理：定时轮询「更新推送后台」，收到新版本后自动 git 拉镜像 → docker load → compose 替换部署。
	updateAgent.Start()

	api := router.Group("/api/v1", rateLimitMiddle)
	{
		uploads := api.Group("/uploads", middleware.Auth(tokens, userStatusOK))
		{
			uploads.POST("", uploadsHandler.Create)
		}

		auth := api.Group("/auth")
		{
			auth.POST("/register", registerLimit, authHandler.Register)
			auth.POST("/email-code", registerLimit, emailCodeHandler.Send)
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
			admin.GET("/logs", logHandler.List)
			admin.GET("/logs/overview", logHandler.Overview)
			admin.GET("/logs/stats", logHandler.Stats)
			admin.GET("/logs/export", logHandler.Export)
			admin.GET("/users", adminHandler.ListUsers)
			admin.POST("/users", adminHandler.CreateUser)
			admin.PUT("/users/:id/role", adminHandler.UpdateUserRole)
			admin.PUT("/users/:id", adminHandler.UpdateUser)
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
			admin.GET("/updates/status", systemHandler.UpdateStatus)
			admin.POST("/updates/check", systemHandler.CheckUpdates)
			admin.POST("/updates/apply", systemHandler.ApplyUpdate)
			admin.PUT("/updates/config", systemHandler.SaveUpdateConfig)
			admin.GET("/links", linkHandler.ListAdmin)
			admin.POST("/links", linkHandler.Create)
			admin.PUT("/links/:id", linkHandler.Update)
			admin.DELETE("/links/:id", linkHandler.Delete)
			admin.POST("/links/check", linkHandler.CheckAll)
			admin.POST("/links/validate", linkHandler.Validate)
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
