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
  cover?: string
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
  email_code_on_register?: string
  email_code_on_login?: string
  geetest_enabled?: boolean
  geetest_captcha_id?: string
  geetest_captcha_key?: string
  geetest_captcha_key_set?: boolean
  geetest_on_login?: boolean
  geetest_on_register?: boolean
  geetest_on_comment?: boolean
  site_wallpaper?: string
  wallpaper_opacity?: string
  wallpaper_blur?: string
  article_sidebar?: string
  maintenance_mode?: boolean
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

// ---------- 系统更新 ----------
export interface UpdateRemote {
  version: string
  released_at: string
  notes: string
  size: number
  sha256: string
  asset_url: string
  mirror: string
  min_version: string
}

export interface UpdateRecord {
  id: number
  type: 'update' | 'rollback'
  from_version: string
  to_version: string
  status: 'running' | 'success' | 'failed'
  phase: string
  progress: number
  mirror: string
  sha256: string
  rollback_tag: string
  triggered_by: string
  detail: string
  started_at: string
  finished_at: string | null
}

export interface UpdateState {
  docker: { available: boolean; socket: string; message: string }
  current_version: string
  settings: {
    auto_update: boolean
    interval_mins: number
    repo: string
    mirrors: string[]
  }
  remote: UpdateRemote | null
  checked_at: string | null
  has_update: boolean
  last_error: string
  task: UpdateRecord | null
  history: UpdateRecord[]
  rollback_tag: string
}

export interface UpdateSettingsInput {
  auto_update?: boolean
  interval_mins?: number
  repo?: string
  mirrors?: string[]
}

export interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

export interface MirrorLatency {
  url: string
  latency_ms: number
  asset_url?: string
  download_latency_ms: number
  direct: boolean
  from: string
}

// ---------- 友链自助申请 ----------
export interface LinkApplication {
  id: number
  site_name: string
  url: string
  description: string
  icon_url: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  reviewed_by: number
  reviewed_at: string | null
  created_at: string
}

export interface SubmitLinkApplicationInput {
  site_name: string
  url: string
  description?: string
  icon_url?: string
  email?: string
}
