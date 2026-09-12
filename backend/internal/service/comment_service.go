package service

import (
	"strings"

	"github.com/shenwei/inkstone/backend/internal/model"
	"github.com/shenwei/inkstone/backend/internal/repository"
)

type CommentService struct {
	comments *repository.CommentRepository
	articles *repository.ArticleRepository
}

func NewCommentService(comments *repository.CommentRepository, articles *repository.ArticleRepository) *CommentService {
	return &CommentService{comments: comments, articles: articles}
}

func (s *CommentService) Create(articleID, userID uint, content string) (*model.Comment, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, NewValidationError("评论内容不能为空")
	}
	if len([]rune(content)) > 1000 {
		return nil, NewValidationError("评论最长 1000 个字符")
	}
	if _, err := s.articles.FindByID(articleID); err != nil {
		return nil, err
	}
	comment := &model.Comment{
		ArticleID: articleID,
		UserID:    userID,
		Content:   content,
	}
	if err := s.comments.Create(comment); err != nil {
		return nil, err
	}
	return s.comments.FindByID(comment.ID)
}

func (s *CommentService) ListByArticle(articleID uint) ([]model.Comment, error) {
	return s.comments.ListByArticle(articleID)
}

// Delete allows the comment author or an admin to remove a comment.
func (s *CommentService) Delete(commentID, userID uint, isAdmin bool) error {
	comment, err := s.comments.FindByID(commentID)
	if err != nil {
		return err
	}
	if !isAdmin && comment.UserID != userID {
		return ErrForbidden
	}
	return s.comments.Delete(commentID)
}

func (s *CommentService) ListAll(page, pageSize int) ([]model.Comment, int64, error) {
	return s.comments.ListAll(page, pageSize)
}

func (s *CommentService) DeleteAny(commentID uint) error {
	return s.comments.Delete(commentID)
}

func (s *CommentService) ListByUser(userID uint, page, pageSize int) ([]model.Comment, int64, error) {
	return s.comments.ListByUser(userID, page, pageSize)
}
