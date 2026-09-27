// 更新推送后台的类型定义（与后端 UpdateManifest 对应）。

export interface ManifestAsset {
  name: string
  url: string
  sha256: string
  size: number
}

export interface ManifestImage {
  repo: string
  tag: string
  service: string
}

export interface Manifest {
  version: string
  released_at: string
  min_version: string
  notes: string
  images: ManifestImage[]
  asset: ManifestAsset
}

export interface GitHubUser {
  login: string
  avatar_url: string
  name: string | null
}

export interface ReleaseAssetInfo {
  id: number
  name: string
  size: number
  download_count: number
  /** 资产下载地址（上传接口返回 browser_download_url） */
  url?: string
}

export interface ReleaseInfo {
  id: number
  tag_name: string
  name: string
  body?: string
  draft: boolean
  prerelease: boolean
  published_at: string
  /** 资产上传地址模板（含 {?name,label} 占位符） */
  upload_url: string
  assets: ReleaseAssetInfo[]
}

export interface MirrorsConfig {
  mirrors: string[]
}

export interface RepoFile {
  /** 解码后的文本内容 */
  content: string
  /** GitHub 侧文件 blob sha，更新时必须带上 */
  sha: string
}
