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

export interface SiteSettings {
  allow_registration: boolean
  site_name: string
  site_description: string
  site_logo?: string
  site_favicon?: string
  sidebar_position?: 'right' | 'left'
  site_icp: string
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_from: string
  smtp_pass_set?: boolean
  upload_max_mb?: number
  upload_speed_kb?: number
  download_speed_kb?: number
  security_enabled?: boolean
  security_api_max?: number
  security_login_max?: number
  security_register_max?: number
  security_comment_max?: number
  security_block_minutes?: number
  captcha_provider?: 'none' | 'turnstile' | 'builtin'
  captcha_site_key?: string
  captcha_on_register?: boolean
  captcha_on_login?: boolean
  captcha_on_comment?: boolean
  captcha_on_article?: boolean
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
