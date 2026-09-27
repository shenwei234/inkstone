// GitHub API 封装：更新推送后台通过 Contents API 维护版本清单，
// 通过 Releases API 发布镜像包资产。全程在浏览器直连 GitHub（无服务端）。

import type {
  GitHubUser,
  Manifest,
  ReleaseAssetInfo,
  ReleaseInfo,
} from './types'
import { Sha256Stream } from './sha256'

const API = 'https://api.github.com'

// currentBranch：目标仓库的默认分支（main / master / 其他），
// 各接口默认走它；Hub 加载时先 ensureBranch() 探测一次。
let currentBranch = 'main'

/** 探测并记录仓库默认分支（失败回退 main） */
export async function ensureBranch(token: string, repo: string): Promise<string> {
  try {
    const data = await gh<{ default_branch?: string }>(token, `/repos/${repo}`)
    if (data.default_branch) currentBranch = data.default_branch
  } catch {
    // 拿不到默认分支时保持 main
  }
  return currentBranch
}

const defaultBranch = () => currentBranch

/** 当前探测到的仓库默认分支名（展示/调试用） */
export function currentBranchName(): string {
  return currentBranch
}

/** 镜像清单默认定义（发布与回退共用，与后端 validateManifestImages 白名单一致） */
export const defaultImages = [
  { repo: 'inkstone-backend', tag: 'latest', service: 'backend' },
  { repo: 'inkstone-frontend', tag: 'latest', service: 'frontend' },
]

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = `GitHub API ${res.status}`
    try {
      const body = JSON.parse(text) as { message?: string }
      if (body.message) msg = body.message
    } catch {
      // 保留默认信息
    }
    throw new GitHubError(res.status, msg)
  }
  return (text ? JSON.parse(text) : null) as T
}

/** 验证 token 并返回登录用户 */
export function fetchUser(token: string) {
  return gh<GitHubUser>(token, '/user')
}

/** 读取仓库文本文件（不存在返回 null） */
export async function getFile(
  token: string,
  repo: string,
  path: string,
  branch = defaultBranch()
): Promise<{ content: string; sha: string } | null> {
  try {
    const data = await gh<{ content?: string; sha?: string; encoding?: string }>(
      token,
      `/repos/${repo}/contents/${path}?ref=${branch}`
    )
    const content = data.content
      ? decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))
      : ''
    return { content, sha: data.sha ?? '' }
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null
    throw e
  }
}

/** 写入仓库文本文件（新建或更新） */
export function putFile(
  token: string,
  repo: string,
  path: string,
  content: string,
  sha: string | undefined,
  message: string,
  branch = defaultBranch()
) {
  const body: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  }
  if (sha) body.sha = sha
  return gh(token, `/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** 创建 Release（已存在时返回现有） */
export async function createRelease(
  token: string,
  repo: string,
  tag: string,
  name: string,
  body: string
): Promise<ReleaseInfo> {
  try {
    return await gh<ReleaseInfo>(token, `/repos/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({ tag_name: tag, name, body, draft: false, prerelease: false }),
    })
  } catch (e) {
    if (e instanceof GitHubError && e.status === 422) {
      // tag 的 release 已存在 → 复用
      const list = await listReleases(token, repo)
      const found = list.find((r) => r.tag_name === tag)
      if (found) return found
    }
    throw e
  }
}

/** 删除 Release 资产（重复发布同名资产时先删后传） */
export function deleteReleaseAsset(token: string, repo: string, assetId: number) {
  return gh(token, `/repos/${repo}/releases/assets/${assetId}`, { method: 'DELETE' })
}

/** 仓库 Release 列表 */
export function listReleases(token: string, repo: string): Promise<ReleaseInfo[]> {
  return gh<ReleaseInfo[]>(token, `/repos/${repo}/releases?per_page=30`)
}

/**
 * 上传 Release 资产（XHR 以支持上传进度回调）。
 * uploadUrlTemplate 形如 https://uploads.github.com/.../assets{?name,label}
 */
export function uploadReleaseAsset(
  token: string,
  uploadUrlTemplate: string,
  name: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<ReleaseAssetInfo> {
  const url = `${uploadUrlTemplate.replace(/\{.*$/, '')}?name=${encodeURIComponent(name)}`
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const asset = JSON.parse(xhr.responseText) as {
            id: number
            name: string
            size: number
            browser_download_url: string
          }
          resolve({
            id: asset.id,
            name: asset.name,
            size: asset.size,
            download_count: 0,
            url: asset.browser_download_url,
          })
        } catch {
          reject(new Error('上传响应解析失败'))
        }
      } else {
        let msg = `上传失败（${xhr.status}）`
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string }
          if (body.message) msg = body.message
          // 同名资产已存在时按已有资产跳过（重复发布场景）
        } catch {
          // 保留默认信息
        }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误，上传被中断'))
    xhr.send(file)
  })
}

/** 读取版本清单（不存在返回 null） */
export async function getManifest(
  token: string,
  repo: string,
  branch = defaultBranch()
): Promise<{ manifest: Manifest; sha: string } | null> {
  const file = await getFile(token, repo, 'releases/latest.json', branch)
  if (!file) return null
  try {
    const manifest = JSON.parse(file.content) as Manifest
    return { manifest, sha: file.sha }
  } catch {
    throw new Error('版本清单 JSON 解析失败，请检查仓库 releases/latest.json')
  }
}

/** 写回版本清单 */
export function putManifest(
  token: string,
  repo: string,
  manifest: Manifest,
  sha: string,
  branch = defaultBranch()
) {
  return putFile(
    token,
    repo,
    'releases/latest.json',
    `${JSON.stringify(manifest, null, 2)}\n`,
    sha,
    `release ${manifest.version}: 更新版本清单`,
    branch
  )
}

/** 读取加速源配置 releases/mirrors.json（不存在返回仓库默认列表） */
export async function getMirrors(
  token: string,
  repo: string,
  branch = defaultBranch()
): Promise<{ mirrors: string[]; sha: string }> {
  const file = await getFile(token, repo, 'releases/mirrors.json', branch)
  if (!file) {
    return {
      mirrors: [
        'https://ghfast.top/',
        'https://gh-proxy.com/',
        'https://ghproxy.net/',
        'https://ghproxy.cn/',
        'https://mirror.ghproxy.com/',
      ],
      sha: '',
    }
  }
  const parsed = JSON.parse(file.content) as { mirrors?: string[] }
  return { mirrors: parsed.mirrors ?? [], sha: file.sha }
}

/** 写回加速源配置 */
export function putMirrors(token: string, repo: string, mirrors: string[], sha: string, branch = defaultBranch()) {
  return putFile(
    token,
    repo,
    'releases/mirrors.json',
    `${JSON.stringify({ mirrors, updated_at: new Date().toISOString() }, null, 2)}\n`,
    sha,
    'chore: 更新 GitHub 加速源列表',
    branch
  )
}

/** 流式计算文件 SHA256（分块读取，避免大文件内存峰值） */
export async function sha256Hex(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const stream = new Sha256Stream()
  const chunkSize = 4 << 20 // 4MB 一块
  for (let start = 0; start < file.size; start += chunkSize) {
    const end = Math.min(start + chunkSize, file.size)
    const buf = await file.slice(start, end).arrayBuffer()
    stream.update(new Uint8Array(buf))
    onProgress?.(Math.round((end / Math.max(file.size, 1)) * 100))
  }
  return stream.hex()
}

/** 从 URL 流式下载并计算 SHA256（回退清单时自动获取历史资产哈希；分块避免内存峰值） */
export async function sha256FromURL(url: string, onProgress?: (pct: number) => void): Promise<string> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`下载失败（${res.status}）`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const stream = new Sha256Stream()
  const reader = res.body.getReader()
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      stream.update(value)
      received += value.length
      if (total > 0) onProgress?.(Math.round((received / total) * 100))
    }
  }
  onProgress?.(100)
  return stream.hex()
}

/** 更新 Release 名称/说明（复用旧 tag 重新发布时同步内容） */
export function updateRelease(
  token: string,
  repo: string,
  releaseId: number,
  patch: { name?: string; body?: string }
) {
  return gh<ReleaseInfo>(token, `/repos/${repo}/releases/${releaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/** 删除 Release（下架错误版本；默认一并删除 tag ref） */
export async function deleteRelease(token: string, repo: string, releaseId: number, deleteTag = true) {
  let tagName = ''
  if (deleteTag) {
    const rel = await gh<ReleaseInfo>(token, `/repos/${repo}/releases/${releaseId}`).catch(() => null)
    tagName = rel?.tag_name ?? ''
  }
  await gh(token, `/repos/${repo}/releases/${releaseId}`, { method: 'DELETE' })
  if (deleteTag && tagName) {
    // 删除 tag ref 失败不阻塞（无权限时静默跳过）
    await gh(token, `/repos/${repo}/git/refs/tags/${encodeURIComponent(tagName)}`, { method: 'DELETE' }).catch(
      () => null
    )
  }
}

/** 取指定 tag 的 Release（不存在返回 null） */
export async function getReleaseByTag(
  token: string,
  repo: string,
  tag: string
): Promise<ReleaseInfo | null> {
  try {
    return await gh<ReleaseInfo>(token, `/repos/${repo}/releases/tags/${tag}`)
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null
    throw e
  }
}

/** token 权限范围（响应头 x-oauth-scopes，classic token 才有） */
export async function fetchScopes(token: string): Promise<string[]> {
  const res = await fetch(`${API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  const scopes = res.headers.get('x-oauth-scopes') ?? ''
  return scopes.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * 把 latest.json 回退到指定历史 Release（发布错误版本时的救命功能）。
 * 历史资产的 sha256 无法从 GitHub API 获取，由调用方下载计算后传入。
 */
export function rollbackManifest(
  token: string,
  repo: string,
  release: ReleaseInfo,
  sha256: string,
  currentSHA: string,
  minVersion = '',
  branch = defaultBranch()
) {
  const asset = release.assets.find((a) => a.name === 'inkstone-images.tar') ?? release.assets[0]
  if (!asset) throw new Error('该 Release 没有镜像包资产')
  // 资产下载地址用标准格式（API 返回的 browser_download_url 等价）
  const assetURL = `https://github.com/${repo}/releases/download/${release.tag_name}/${asset.name}`
  const manifest: Manifest = {
    version: release.tag_name,
    released_at: release.published_at || new Date().toISOString(),
    min_version: minVersion,
    notes: release.body || release.name,
    images: defaultImages,
    asset: {
      name: asset.name,
      url: assetURL,
      sha256,
      size: asset.size,
    },
  }
  return putManifest(token, repo, manifest, currentSHA, branch)
}

/** 从当前版本号推导下一个建议版本号（Beta1.15 → Beta1.16） */
export function suggestNextVersion(current: string): string {
  const m = current.match(/^(.*?)(\d+)$/)
  if (!m) return current
  return `${m[1]}${Number(m[2]) + 1}`
}

/** 字节数格式化 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
