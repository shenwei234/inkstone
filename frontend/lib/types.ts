export interface User {
  id: number
  email: string
  username: string
  role: 'admin' | 'user'
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in: number
}

export interface AuthResponse {
  user: User
  token: TokenPair
}

export interface ArticleAuthor {
  id: number
  username: string
}

export interface TaxonomyItem {
  id: number
  name: string
  slug: string
}

export interface Article {
  id: number
  title: string
  slug: string
  content: string
  status: 'draft' | 'published'
  views: number
  category?: TaxonomyItem | null
  tags?: TaxonomyItem[]
  published_at: string | null
  created_at: string
  updated_at: string
  author: ArticleAuthor
}

export interface CategoryCount extends TaxonomyItem {
  article_count: number
}

export interface TagCount extends TaxonomyItem {
  article_count: number
}

export interface CommentItem {
  id: number
  article_id: number
  article_title?: string
  article_slug?: string
  content: string
  created_at: string
  author: {
    id: number
    username: string
  }
}

export interface ReactionStats {
  likes: number
  favorites: number
  liked?: boolean
  favorited?: boolean
}

export interface ArticleListResponse {
  articles: Article[]
  total: number
  page: number
  page_size: number
}

export interface Pagination {
  page: number
  page_size: number
  total: number
}

export interface AdminStats {
  total_users: number
  total_articles: number
  published_articles: number
  draft_articles: number
}

export interface AdminUser {
  id: number
  email: string
  username: string
  role: 'admin' | 'user'
  status: 'active' | 'banned'
  created_at: string
}

export interface AdminUserListResponse {
  users: AdminUser[]
  total: number
  page: number
  page_size: number
}
