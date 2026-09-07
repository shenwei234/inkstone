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

export interface Article {
  id: number
  title: string
  slug: string
  content: string
  status: 'draft' | 'published'
  published_at: string | null
  created_at: string
  updated_at: string
  author: ArticleAuthor
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
