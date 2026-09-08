import type {
  Article,
  ArticleListResponse,
  AuthResponse,
  User,
  AdminStats,
  AdminUserListResponse,
  CategoryCount,
  TagCount,
  CommentItem,
  ReactionStats,
  SiteSettings,
} from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'

const ACCESS_KEY = 'blog_access_token'
const REFRESH_KEY = 'blog_refresh_token'

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS_KEY)
}

export function saveTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) return false

  // Coalesce concurrent refresh attempts into a single request.
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        })
        if (!res.ok) return false
        const data = (await res.json()) as AuthResponse
        saveTokens(data.token.access_token, data.token.refresh_token)
        return true
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false } = options

  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  let token = auth ? getAccessToken() : null
  let res = await doFetch(token)

  // On 401 with auth, attempt one token refresh then retry.
  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      token = getAccessToken()
      res = await doFetch(token)
    } else {
      clearTokens()
    }
  }

  if (!res.ok) {
    let message = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') message = data.error
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- Auth API ----------

export function register(email: string, username: string, password: string) {
  return api<AuthResponse>('/auth/register', {
    method: 'POST',
    body: { email, username, password },
  })
}

export function login(email: string, password: string) {
  return api<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export function fetchMe() {
  return api<{ user: User }>('/auth/me', { auth: true })
}

// ---------- Articles API ----------

export interface ArticleListParams {
  page?: number
  page_size?: number
  status?: string
  author_id?: number
  category?: string
  tag?: string
  q?: string
}

export function fetchArticles(params: ArticleListParams = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.status) search.set('status', params.status)
  if (params.author_id) search.set('author_id', String(params.author_id))
  if (params.category) search.set('category', params.category)
  if (params.tag) search.set('tag', params.tag)
  if (params.q) search.set('q', params.q)
  const qs = search.toString()
  return api<ArticleListResponse>(`/articles${qs ? `?${qs}` : ''}`, {
    auth: Boolean(params.status && params.status !== 'published'),
  })
}

export function fetchArticle(id: number | string) {
  return api<{ article: Article }>(`/articles/${id}`)
}

export function fetchArticleBySlug(slug: string) {
  return api<{ article: Article }>(`/articles/slug/${encodeURIComponent(slug)}`)
}

export function createArticle(input: {
  title: string
  content: string
  status: string
  category_id?: number | null
  tags?: string[]
}) {
  return api<{ article: Article }>('/articles', { method: 'POST', body: input, auth: true })
}

export function updateArticle(
  id: number,
  input: Partial<{
    title: string
    content: string
    status: string
    category_id: number | null
    tags: string[]
  }>,
) {
  return api<{ article: Article }>(`/articles/${id}`, { method: 'PUT', body: input, auth: true })
}

export function deleteArticle(id: number) {
  return api<void>(`/articles/${id}`, { method: 'DELETE', auth: true })
}

// ---------- Engagement API ----------

export function fetchCategories() {
  return api<{ categories: CategoryCount[] }>('/categories')
}

export function fetchTags() {
  return api<{ tags: TagCount[] }>('/tags')
}

export function fetchComments(articleId: number | string) {
  return api<{ comments: CommentItem[] }>(`/articles/${articleId}/comments`)
}

export function postComment(articleId: number | string, content: string) {
  return api<{ comment: CommentItem }>(`/articles/${articleId}/comments`, {
    method: 'POST',
    body: { content },
    auth: true,
  })
}

export function deleteComment(id: number) {
  return api<void>(`/comments/${id}`, { method: 'DELETE', auth: true })
}

export function fetchReactions(articleId: number | string) {
  return api<ReactionStats>(`/articles/${articleId}/reactions`, { auth: true })
}

export function toggleReaction(articleId: number | string, type: 'like' | 'favorite') {
  return api<{ active: boolean; count: number }>(`/articles/${articleId}/reactions`, {
    method: 'POST',
    body: { type },
    auth: true,
  })
}

// ---------- Admin API ----------

export type { AdminStats, AdminUser, AdminUserListResponse } from './types'

export function fetchAdminStats() {
  return api<AdminStats>('/admin/stats', { auth: true })
}

export function fetchAdminComments(params: { page?: number; page_size?: number } = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  const qs = search.toString()
  return api<{ comments: CommentItem[]; total: number }>(`/admin/comments${qs ? `?${qs}` : ''}`, {
    auth: true,
  })
}

export function deleteAdminComment(id: number) {
  return api<void>(`/admin/comments/${id}`, { method: 'DELETE', auth: true })
}

// ---------- Uploads API ----------

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const token = getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', headers, body: form })
  if (!res.ok) {
    let message = `上传失败 (${res.status})`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') message = data.error
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message)
  }
  const data = (await res.json()) as { url: string }
  return data.url
}

// ---------- Site Settings API ----------

export function fetchSiteConfig() {
  return api<Partial<SiteSettings> & { config?: Partial<SiteSettings> }>('/site-config').then(
    (res) => {
      // Backend returns { config: {...} } — unwrap for flat consumption.
      const cfg = (res as { config?: Partial<SiteSettings> }).config
      return cfg ?? (res as Partial<SiteSettings>)
    },
  )
}

export function fetchAdminSettings() {
  return api<{ settings: SiteSettings }>('/admin/settings', { auth: true })
}

export function updateAdminSettings(settings: Partial<SiteSettings> & { smtp_pass?: string }) {
  return api<{ settings: SiteSettings }>('/admin/settings', {
    method: 'PUT',
    body: { settings },
    auth: true,
  })
}

export function sendTestMail(to: string) {
  return api<{ message: string }>('/admin/settings/test-mail', {
    method: 'POST',
    body: { to },
    auth: true,
  })
}

export function fetchAdminUsers(params: { page?: number; page_size?: number; q?: string } = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.q) search.set('q', params.q)
  const qs = search.toString()
  return api<AdminUserListResponse>(`/admin/users${qs ? `?${qs}` : ''}`, { auth: true })
}

export function updateAdminUserRole(id: number, role: 'admin' | 'user') {
  return api<{ message: string }>(`/admin/users/${id}/role`, {
    method: 'PUT',
    body: { role },
    auth: true,
  })
}

export function createAdminUser(input: {
  email: string
  username: string
  password: string
  role: 'admin' | 'user'
}) {
  return api<{ user: User }>('/admin/users', { method: 'POST', body: input, auth: true })
}

export function setUserStatus(id: number, status: 'active' | 'banned') {
  return api<{ message: string }>(`/admin/users/${id}/status`, {
    method: 'PUT',
    body: { status },
    auth: true,
  })
}

export function deleteAdminUser(id: number) {
  return api<void>(`/admin/users/${id}`, { method: 'DELETE', auth: true })
}

export function fetchAdminArticles(params: { page?: number; page_size?: number; status?: string } = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.status) search.set('status', params.status)
  const qs = search.toString()
  return api<ArticleListResponse>(`/admin/articles${qs ? `?${qs}` : ''}`, { auth: true })
}

export function setAdminArticleStatus(id: number, status: 'draft' | 'published') {
  return api<{ article: Article }>(`/admin/articles/${id}/status`, {
    method: 'PUT',
    body: { status },
    auth: true,
  })
}

export function deleteAdminArticle(id: number) {
  return api<void>(`/admin/articles/${id}`, { method: 'DELETE', auth: true })
}
