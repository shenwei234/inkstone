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

// maxDetailRunes caps the detail column (gorm size:500) so a long title or URL
// can never break the INSERT with a value-too-long error.
const maxDetailRunes = 500

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
		Detail:    truncate(e.Detail, maxDetailRunes),
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

// Export returns all logs matching the filter (capped), for CSV download.
func (s *LogService) Export(q repository.OperationLogQuery) ([]model.OperationLog, error) {
	return s.repo.Export(q)
}

// LogOverview aggregates headline counters for the admin dashboard.
type LogOverview struct {
	Total      int64            `json:"total"`
	Today      int64            `json:"today"`
	Failed     int64            `json:"failed"`
	ByCategory map[string]int64 `json:"by_category"`
}

func (s *LogService) Overview() (LogOverview, error) {
	total, err := s.repo.CountAll()
	if err != nil {
		return LogOverview{}, err
	}
	today, err := s.repo.CountToday()
	if err != nil {
		return LogOverview{}, err
	}
	failed, err := s.repo.CountFailed()
	if err != nil {
		return LogOverview{}, err
	}
	byCategory, err := s.repo.CountByCategory()
	if err != nil {
		return LogOverview{}, err
	}
	return LogOverview{
		Total:      total,
		Today:      today,
		Failed:     failed,
		ByCategory: byCategory,
	}, nil
}

// Stats returns log counts grouped by category.
func (s *LogService) Stats() (map[string]int64, error) {
	return s.repo.CountByCategory()
}

// truncate 按「字符」截断，避免切断 UTF-8 多字节序列产生非法 rune。
func truncate(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
