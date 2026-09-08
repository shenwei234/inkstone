package mailer

import (
	"errors"
	"strconv"

	"github.com/blog-platform/backend/internal/service"
	"gopkg.in/gomail.v2"
)

// Mailer sends emails using SMTP settings stored in the site settings table.
type Mailer struct {
	settings *service.SettingsService
}

func New(settings *service.SettingsService) *Mailer {
	return &Mailer{settings: settings}
}

// Send delivers a plain-text email. Returns an error when SMTP is not
// configured or the transport fails.
func (m *Mailer) Send(to, subject, body string) error {
	all, err := m.settings.All()
	if err != nil {
		return err
	}

	host := all[service.SettingSMTPHost]
	user := all[service.SettingSMTPUser]
	pass := all[service.SettingSMTPPass]
	from := all[service.SettingSMTPFrom]
	port := 465
	if p, err := strconv.Atoi(all[service.SettingSMTPPort]); err == nil && p > 0 {
		port = p
	}

	if host == "" || user == "" || pass == "" {
		return errors.New("邮箱服务尚未配置，请在后台「网站管理」中填写 SMTP 信息")
	}
	if from == "" {
		from = user
	}

	dialer := gomail.NewDialer(host, port, user, pass)
	message := gomail.NewMessage()
	message.SetHeader("From", from)
	message.SetHeader("To", to)
	message.SetHeader("Subject", subject)
	message.SetBody("text/plain; charset=utf-8", body)
	return dialer.DialAndSend()
}
