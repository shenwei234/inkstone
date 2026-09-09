package mailer

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/blog-platform/backend/internal/service"
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
	siteName := all[service.SettingSiteName]
	port := 465
	if p, err := strconv.Atoi(all[service.SettingSMTPPort]); err == nil && p > 0 {
		port = p
	}

	if host == "" || user == "" || pass == "" {
		return errors.New("邮箱服务尚未配置，请在后台「网站管理」中填写 SMTP 信息")
	}

	fromAddr := user
	displayFrom := user
	if from != "" {
		displayFrom = from
		// Extract bare address from "Name <addr>" form for the envelope.
		if i := indexOf(from, '<'); i >= 0 && indexOf(from, '>') > i {
			fromAddr = from[i+1 : indexOf(from, '>')]
		} else {
			fromAddr = from
		}
	}
	fromHeader := displayFrom
	if siteName != "" && indexOf(displayFrom, '<') < 0 {
		fromHeader = fmt.Sprintf("%s <%s>", siteName, fromAddr)
	}

	messageID := genMessageID(fromAddr)
	_ = messageID

	if err := sendSMTP(host, port, user, pass, fromAddr, fromHeader, to, subject, body); err != nil {
		log.Printf("[mailer] send FAILED to=%s via %s:%d as %s: %v", to, host, port, fromAddr, err)
		return err
	}
	log.Printf("[mailer] sent OK to=%s via %s:%d as %s", to, host, port, fromAddr)
	return nil
}

func genMessageID(fromAddr string) string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%d@%s", time.Now().UnixNano(), domainOf(fromAddr))
	}
	return fmt.Sprintf("%s@%s", hex.EncodeToString(buf), domainOf(fromAddr))
}

func domainOf(addr string) string {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == '@' {
			return addr[i+1:]
		}
	}
	return addr
}

func indexOf(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}
