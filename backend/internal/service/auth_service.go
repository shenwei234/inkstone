package service

import (
	"errors"
	"regexp"
	"strings"

	"github.com/blog-platform/backend/internal/model"
	"github.com/blog-platform/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrValidation         = errors.New("validation failed")
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type AuthService struct {
	users  *repository.UserRepository
	tokens *TokenManager
}

func NewAuthService(users *repository.UserRepository, tokens *TokenManager) *AuthService {
	return &AuthService{users: users, tokens: tokens}
}

type RegisterInput struct {
	Email    string
	Username string
	Password string
}

func (s *AuthService) Register(input RegisterInput) (*model.User, *TokenPair, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	username := strings.TrimSpace(input.Username)
	password := input.Password

	if !emailRegex.MatchString(email) {
		return nil, nil, NewValidationError("邮箱格式不正确")
	}
	if l := len([]rune(username)); l < 2 || l > 32 {
		return nil, nil, NewValidationError("用户名长度需在 2-32 个字符之间")
	}
	if l := len(password); l < 8 || l > 72 {
		return nil, nil, NewValidationError("密码长度需在 8-72 个字符之间")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, err
	}

	user := &model.User{
		Email:        email,
		Username:     username,
		PasswordHash: string(hash),
		Role:         model.RoleUser,
	}
	if err := s.users.Create(user); err != nil {
		if errors.Is(err, repository.ErrEmailTaken) {
			return nil, nil, NewValidationError("该邮箱已被注册")
		}
		return nil, nil, err
	}

	pair, err := s.tokens.GeneratePair(user.ID, user.Role)
	if err != nil {
		return nil, nil, err
	}
	return user, pair, nil
}

func (s *AuthService) Login(email, password string) (*model.User, *TokenPair, error) {
	user, err := s.users.FindByEmail(strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, ErrInvalidCredentials
	}
	pair, err := s.tokens.GeneratePair(user.ID, user.Role)
	if err != nil {
		return nil, nil, err
	}
	return user, pair, nil
}

func (s *AuthService) Refresh(refreshToken string) (*model.User, *TokenPair, error) {
	claims, err := s.tokens.Parse(refreshToken, TokenTypeRefresh)
	if err != nil {
		return nil, nil, errors.New("invalid refresh token")
	}
	user, err := s.users.FindByID(claims.UserID)
	if err != nil {
		return nil, nil, errors.New("user no longer exists")
	}
	pair, err := s.tokens.GeneratePair(user.ID, user.Role)
	if err != nil {
		return nil, nil, err
	}
	return user, pair, nil
}

func (s *AuthService) GetUserByID(id uint) (*model.User, error) {
	return s.users.FindByID(id)
}

type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

func NewValidationError(msg string) error {
	return &ValidationError{Message: msg}
}
