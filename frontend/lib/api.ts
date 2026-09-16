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

// ---------- Captcha API ----------

export interface CaptchaConfig {
  provider: 'none' | 'turnstile' | 'geetest' | 'builtin'
  site_key: string
  geetest_captcha_id?: string
  on_register: boolean
  on_login: boolean
  on_comment: boolean
  on_article: boolean
}

export interface CaptchaChallenge {
  provider: string
  enabled: boolean
  question?: string
  token?: string
}

export function fetchCaptchaChallenge() {
  return api<CaptchaChallenge>('/captcha/challenge')
}

// ---------- Auth API ----------

export function register(
  email: string,
  username: string,
  password: string,
  captcha?: { captcha_token?: string; captcha_answer?: string },
) {
  return api<AuthResponse>('/auth/register', {
    method: 'POST',
    body: { email, username, password, ...captcha },
  })
}

export function login(
  email: string,
  password: string,
  captcha?: { captcha_token?: string; captcha_answer?: string },
) {
  return api<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password, ...captcha },
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
  order?: string
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
  if (params.order) search.set('order', params.order)
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
  captcha_token?: string
  captcha_answer?: string
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

// ---------- Admin Tags API ----------

export function createTag(name: string) {
  return api<{ tag: TagCount }>('/admin/tags', { method: 'POST', body: { name }, auth: true })
}

export function updateTag(id: number, name: string) {
  return api<{ tag: TagCount }>(`/admin/tags/${id}`, { method: 'PUT', body: { name }, auth: true })
}

export function deleteTag(id: number) {
  return api<void>(`/admin/tags/${id}`, { method: 'DELETE', auth: true })
}

export function fetchComments(articleId: number | string) {
  return api<{ comments: CommentItem[] }>(`/articles/${articleId}/comments`)
}

export function postComment(
  articleId: number | string,
  content: string,
  captcha?: { captcha_token?: string; captcha_answer?: string },
) {
  return api<{ comment: CommentItem }>(`/articles/${articleId}/comments`, {
    method: 'POST',
    body: { content, ...captcha },
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

// ---------- Pages API ----------

export interface PageItem {
  id: number
  title: string
  slug: string
  content?: string
  template?: string
  status?: string
  sort_order?: number
  show_in_nav?: boolean
}

export function fetchPageBySlug(slug: string) {
  return api<{ page: PageItem }>(`/pages/${encodeURIComponent(slug)}`)
}

export function fetchAdminPages() {
  return api<{ pages: PageItem[] }>('/admin/pages', { auth: true })
}

export function fetchAdminPage(id: number) {
  return api<{ page: PageItem }>(`/admin/pages/${id}`, { auth: true })
}

export function createPage(input: Partial<PageItem>) {
  return api<{ page: PageItem }>('/admin/pages', { method: 'POST', body: input, auth: true })
}

export function updatePage(id: number, input: Partial<PageItem>) {
  return api<{ page: PageItem }>(`/admin/pages/${id}`, { method: 'PUT', body: input, auth: true })
}

export function deletePage(id: number) {
  return api<void>(`/admin/pages/${id}`, { method: 'DELETE', auth: true })
}

// ---------- Friend Links API ----------

export interface PublicFriendLink {
  id: number
  name: string
  url?: string
  masked_url: string
  icon_url?: string
  description?: string
  available: boolean
}

export interface AdminFriendLink {
  id: number
  name: string
  url: string
  check_url: string
  icon_url: string
  description: string
  sort_order: number
  available: boolean
  last_checked_at: string | null
  created_at: string
}

export interface FriendLinkInput {
  name: string
  url: string
  check_url?: string
  icon_url?: string
  description?: string
  sort_order?: number
}

export function fetchFriendLinks() {
  return api<{ links: PublicFriendLink[] }>('/links')
}

export function fetchAdminLinks() {
  return api<{ links: AdminFriendLink[] }>('/admin/links', { auth: true })
}

export function createFriendLink(input: FriendLinkInput) {
  return api<{ link: AdminFriendLink }>('/admin/links', { method: 'POST', body: input, auth: true })
}

export function updateFriendLink(id: number, input: FriendLinkInput) {
  return api<{ link: AdminFriendLink }>(`/admin/links/${id}`, { method: 'PUT', body: input, auth: true })
}

export function deleteFriendLink(id: number) {
  return api<void>(`/admin/links/${id}`, { method: 'DELETE', auth: true })
}

export function checkAllFriendLinks() {
  return api<{ links: AdminFriendLink[]; checked: number }>('/admin/links/check', {
    method: 'POST',
    auth: true,
  })
}

export function checkFriendLink(id: number) {
  return api<{ available: boolean }>(`/admin/links/${id}/check`, { method: 'POST', auth: true })
}

// ---------- File Manager API ----------

export interface FileAssetItem {
  id: number
  stored_name: string
  original_name: string
  size: number
  mime_type: string
  url: string
  created_at: string
}

export interface FileListResponse {
  files: FileAssetItem[]
  total: number
  page: number
  page_size: number
  total_size: number
  max_upload_mb: number
}

export function fetchFiles(params: { page?: number; page_size?: number; q?: string } = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.q) search.set('q', params.q)
  const qs = search.toString()
  return api<FileListResponse>(`/admin/files${qs ? `?${qs}` : ''}`, { auth: true })
}

export function deleteFile(id: number) {
  return api<void>(`/admin/files/${id}`, { method: 'DELETE', auth: true })
}

export function fileDownloadUrl(id: number) {
  return `${API_BASE}/admin/files/${id}/download`
}

/** Downloads a file through the authenticated API and triggers a browser save. */
export async function downloadFile(id: number, filename: string): Promise<void> {
  const token = getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/admin/files/${id}/download`, { headers })
  if (!res.ok) {
    let message = `下载失败 (${res.status})`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') message = data.error
    } catch {
      // keep default
    }
    throw new ApiError(res.status, message)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Uploads a file with progress reporting (XHR, since fetch has no upload progress). */
export function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ file: FileAssetItem }> {
  return new Promise((resolve, reject) => {
    const token = getAccessToken()
    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/admin/files`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new ApiError(xhr.status, '响应解析失败'))
        }
      } else {
        let message = `上传失败 (${xhr.status})`
        try {
          const data = JSON.parse(xhr.responseText)
          if (data && typeof data.error === 'string') message = data.error
        } catch {
          // keep default
        }
        reject(new ApiError(xhr.status, message))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, '网络错误，上传失败'))
    xhr.send(form)
  })
}

// ---------- System / Account API ----------

export interface SystemInfo {
  name: string
  version: string
  go_version: string
  uptime: string
  author: string
}

export interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

export interface UpdateCheckResult {
  current: string
  latest: string
  has_update: boolean
  notes?: string[]
  download_url?: string
  message: string
  manifest_url: string
}

export function fetchSystemInfo() {
  return api<{ info: SystemInfo }>('/system/info')
}

export function fetchUpdateInfo() {
  return api<{ current: string; changelog: ChangelogEntry[]; manifest_url: string }>('/admin/updates', {
    auth: true,
  })
}

export function checkSystemUpdates() {
  return api<UpdateCheckResult>('/admin/updates/check', { method: 'POST', auth: true })
}

export function saveUpdateManifest(url: string) {
  return api<{ message: string }>('/admin/updates/manifest', {
    method: 'PUT',
    body: { manifest_url: url },
    auth: true,
  })
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api<{ message: string }>('/auth/password', {
    method: 'PUT',
    body: { current_password: currentPassword, new_password: newPassword },
    auth: true,
  })
}

export function updateProfile(username: string) {
  return api<{ user: User }>('/auth/profile', { method: 'PUT', body: { username }, auth: true })
}

export function fetchMyComments(params: { page?: number; page_size?: number } = {}) {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.page_size) search.set('page_size', String(params.page_size))
  const qs = search.toString()
  return api<{ comments: CommentItem[]; total: number }>(`/auth/my-comments${qs ? `?${qs}` : ''}`, {
    auth: true,
  })
}

// ---------- Site Settings API ----------

export function fetchSiteConfig() {
  return api<
    Partial<SiteSettings> & {
      config?: Partial<SiteSettings>
      nav_menu?: unknown
      sidebar_widgets?: unknown
    }
  >('/site-config').then((res) => {
    // Backend returns { config: {...} } — unwrap for flat consumption.
    const cfg = (res as { config?: Partial<SiteSettings> }).config
    const flat = cfg ?? (res as Partial<SiteSettings>)
    return Object.assign(flat, {
      nav_menu: (res as { nav_menu?: unknown }).nav_menu,
      sidebar_widgets: (res as { sidebar_widgets?: unknown }).sidebar_widgets,
    }) as Partial<SiteSettings> & { nav_menu?: unknown; sidebar_widgets?: unknown }
  })
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
