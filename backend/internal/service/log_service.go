package service

import (
	"log"
	"time"

	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
)

// LogService records and queries operation logs. Recording is asynchronous so
// it never slows down the request path.
type LogService struct {
	repo  *repository.OperationLogRepository
	queue chan model.OperationLog
}

func NewLogService(repo *repository.OperationLogRepository) *LogService {
	s := &LogService{
		repo:  repo,
		queue: make(chan model.OperationLog, 1024),
	}
	go s.worker()
	go s.cleanupLoop()
	return s
}

// Entry describes one operation to be logged.
type Entry struct {
	UserID    uint
	Username  string
	Category  string
	Action    string
	Detail    string
	IP        string
	UserAgent string
	Success   bool
}

// Record queues a log entry (non-blocking).
func (s *LogService) Record(e Entry) {
	if s == nil {
		return
	}
	entry := model.OperationLog{
		UserID:    e.UserID,
		Username:  e.Username,
		Category:  e.Category,
		Action:    e.Action,
		Detail:    e.Detail,
		IP:        e.IP,
		UserAgent: truncate(e.UserAgent, 250),
		Success:   e.Success,
		CreatedAt: time.Now(),
	}
	select {
	case s.queue <- entry:
	default:
		// 队列满时丢弃，避免拖慢请求
	}
}

func (s *LogService) worker() {
	for entry := range s.queue {
		if err := s.repo.Create(&entry); err != nil {
			log.Printf("[oplog] write failed: %v", err)
		}
	}
}

// cleanupLoop 保留最近 90 天日志。
func (s *LogService) cleanupLoop() {
	for {
		time.Sleep(24 * time.Hour)
		_ = s.repo.Cleanup(time.Now().AddDate(0, 0, -90).Format("2006-01-02 15:04:05"))
	}
}

func (s *LogService) List(q repository.OperationLogQuery) ([]model.OperationLog, int64, error) {
	return s.repo.List(q)
}

func (s *LogService) Stats() (map[string]int64, error) {
	return s.repo.CountByCategory()
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
