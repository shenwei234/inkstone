package service

import (
	"strings"

	"github.com/blog-platform/backend/internal/model"
	"github.com/blog-platform/backend/internal/repository"
)

var validPageTemplates = map[string]bool{
	model.PageTemplateDefault:   true,
	model.PageTemplateFullwidth: true,
	model.PageTemplateLanding:   true,
}

type PageService struct {
	pages *repository.PageRepository
}

func NewPageService(pages *repository.PageRepository) *PageService {
	return &PageService{pages: pages}
}

type PageInput struct {
	Title     string
	Content   string
	Template  string
	Status    string
	SortOrder int
	ShowInNav bool
}

func normalizePageInput(input *PageInput) error {
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		return NewValidationError("页面标题不能为空")
	}
	if len([]rune(input.Title)) > 200 {
		return NewValidationError("页面标题最长 200 个字符")
	}
	if !validPageTemplates[input.Template] {
		input.Template = model.PageTemplateDefault
	}
	if input.Status != "published" && input.Status != "draft" {
		input.Status = "published"
	}
	return nil
}

func (s *PageService) Create(input PageInput) (*model.Page, error) {
	if err := normalizePageInput(&input); err != nil {
		return nil, err
	}
	page := &model.Page{
		Title:     input.Title,
		Slug:      s.pages.NormalizePageSlug(input.Title, "page"),
		Content:   input.Content,
		Template:  input.Template,
		Status:    input.Status,
		SortOrder: input.SortOrder,
		ShowInNav: input.ShowInNav,
	}
	if err := s.pages.Create(page); err != nil {
		return nil, err
	}
	return page, nil
}

func (s *PageService) Update(id uint, input PageInput) (*model.Page, error) {
	if err := normalizePageInput(&input); err != nil {
		return nil, err
	}
	page, err := s.pages.FindByID(id)
	if err != nil {
		return nil, err
	}
	page.Title = input.Title
	page.Content = input.Content
	page.Template = input.Template
	page.Status = input.Status
	page.SortOrder = input.SortOrder
	page.ShowInNav = input.ShowInNav
	if err := s.pages.Update(page); err != nil {
		return nil, err
	}
	return page, nil
}

func (s *PageService) Delete(id uint) error {
	return s.pages.Delete(id)
}

func (s *PageService) GetByID(id uint) (*model.Page, error) {
	return s.pages.FindByID(id)
}

func (s *PageService) GetBySlug(slug string) (*model.Page, error) {
	return s.pages.FindBySlug(slug)
}

func (s *PageService) List(includeUnpublished bool) ([]model.Page, error) {
	return s.pages.List(includeUnpublished)
}
