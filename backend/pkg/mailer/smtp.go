package mailer

import (
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"net/textproto"
	"strconv"
	"strings"
	"time"
)

const dialTimeout = 15 * time.Second

// sendSMTP delivers a plain-text email using net/smtp with explicit timeout
// control. Port 465 uses implicit TLS; 25/587 use STARTTLS when offered.
func sendSMTP(host string, port int, user, pass, fromAddr, fromHeader, to, subject, body string) error {
	addr := host + ":" + strconv.Itoa(port)

	var conn net.Conn
	var err error
	// Resolve with timeout; fall back to plain dial.
	ips, rerr := net.LookupIP(host)
	if rerr != nil || len(ips) == 0 {
		return fmt.Errorf("无法解析 SMTP 服务器地址 %s: %v", host, rerr)
	}
	conn, err = net.DialTimeout("tcp", addr, dialTimeout)
	if err != nil {
		return fmt.Errorf("连接 SMTP 服务器 %s 失败: %v", addr, err)
	}
	_ = conn.SetDeadline(time.Now().Add(60 * time.Second))

	useSSL := port == 465
	client, err := wrapClient(conn, host, useSSL)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("TLS 握手失败(%s:%d): %v", host, port, err)
	}

	ok, _ := client.Extension("STARTTLS")
	if !useSSL && ok {
		cfg := &tls.Config{ServerName: host}
		if err = client.StartTLS(cfg); err != nil {
			_ = client.Close()
			return fmt.Errorf("STARTTLS 升级失败: %v", err)
		}
	}

	if user != "" {
		if authErr := client.Auth(smtp.PlainAuth("", user, pass, host)); authErr != nil {
			// Some servers only support LOGIN.
			if loginErr := authLogin(client, user, pass); loginErr != nil {
				_ = client.Close()
				return fmt.Errorf("SMTP 认证失败: %v / %v", authErr, loginErr)
			}
		}
	}

	if err = client.Mail(fromAddr); err != nil {
		_ = client.Close()
		return fmt.Errorf("服务器拒绝发件人 %s: %v", fromAddr, err)
	}
	if err = client.Rcpt(to); err != nil {
		_ = client.Close()
		return fmt.Errorf("服务器拒绝收件人 %s: %v", to, err)
	}
	w, err := client.Data()
	if err != nil {
		_ = client.Close()
		return fmt.Errorf("打开数据通道失败: %v", err)
	}

	headers := strings.Join([]string{
		"From: " + fromHeader,
		"To: " + to,
		"Subject: " + subject,
		"Date: " + time.Now().Format(time.RFC1123Z),
		"Message-ID: <" + genMessageID(fromAddr) + ">",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		"",
	}, "\r\n")
	b64 := base64.StdEncoding.EncodeToString([]byte(body))
	chunked := chunkString(b64, 76)

	if _, err = w.Write([]byte(headers + chunked + "\r\n.")); err != nil {
		_ = w.Close()
		_ = client.Close()
		return fmt.Errorf("写入邮件内容失败: %v", err)
	}
	if err = w.Close(); err != nil {
		_ = client.Close()
		return fmt.Errorf("服务器接收数据失败: %v", err)
	}
	if err = client.Quit(); err != nil {
		_ = client.Close()
	}
	return nil
}

func wrapClient(conn net.Conn, host string, useSSL bool) (*smtp.Client, error) {
	if !useSSL {
		return smtp.NewClient(conn, host)
	}
	tlsConn := tls.Client(conn, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	if err := tlsConn.Handshake(); err != nil {
		return nil, err
	}
	return smtp.NewClient(tlsConn, host)
}

func authLogin(c *smtp.Client, user, pass string) error {
	ok, mech := c.Extension("AUTH")
	if !ok || !strings.Contains(strings.ToUpper(mech), "LOGIN") {
		return errors.New("服务器不支持 AUTH LOGIN")
	}
	// smtp.Client exposes the underlying connection via the Text field.
	tc := c.Text
	if err := tc.PrintfLine("AUTH LOGIN"); err != nil {
		return err
	}
	if _, err := expectCode(tc, 334); err != nil {
		return err
	}
	if err := tc.PrintfLine("%s", base64.StdEncoding.EncodeToString([]byte(user))); err != nil {
		return err
	}
	if _, err := expectCode(tc, 334); err != nil {
		return err
	}
	if err := tc.PrintfLine("%s", base64.StdEncoding.EncodeToString([]byte(pass))); err != nil {
		return err
	}
	_, err := expectCode(tc, 235)
	return err
}

func expectCode(tc *textproto.Conn, code int) (string, error) {
	expectCode, msg, err := tc.ReadResponse(code)
	if err == nil && expectCode != code {
		return msg, fmt.Errorf("SMTP 响应码 %d（期望 %d）: %s", expectCode, code, msg)
	}
	return msg, err
}

func chunkString(s string, size int) string {
	var b strings.Builder
	for len(s) > size {
		b.WriteString(s[:size])
		b.WriteString("\r\n")
		s = s[size:]
	}
	b.WriteString(s)
	return b.String()
}
