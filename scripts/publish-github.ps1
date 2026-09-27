<#
.SYNOPSIS
    通过 GitHub API 发布新版本：创建 Release → 上传镜像包资产 → 更新 releases/latest.json。

.DESCRIPTION
    纯 API 发布（无需人工在网页操作，也不依赖 update-hub）：
      1. POST /repos/{repo}/releases 创建 Release（tag=版本号，已存在则复用）
      2. 上传 inkstone-images.tar 为 Release 资产（同名资产先删后传，支持重复发布）
      3. 计算镜像包 SHA256/大小，写回仓库 releases/latest.json
    发布完成后，各实例在下一个检查周期（默认 15 分钟）内自动拉取更新。

.PARAMETER Token
    GitHub 个人访问令牌（需 repo 权限）。仅经参数传入，不写入任何文件。

.PARAMETER Version
    版本号，如 Beta1.16（与 release.ps1 的 -Version 一致）。

.PARAMETER TarPath
    镜像包路径，默认 D:\blog-platform-release\inkstone-images.tar。

.PARAMETER Repo
    owner/repo，默认 shenwei234/inkstone。

.PARAMETER Notes
    更新说明（写入 Release body 与 latest.json）。

.PARAMETER Branch
    清单所在分支，默认 main。

.EXAMPLE
    .\scripts\publish-github.ps1 -Token ghp_xxx -Version Beta1.16 -Notes "更新说明"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Token,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$TarPath = "D:\blog-platform-release\inkstone-images.tar",

    [string]$Repo = "shenwei234/inkstone",

    [string]$Notes = "",

    [string]$Branch = "main",
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $TarPath)) { throw "镜像包不存在：$TarPath" }

$headers = @{
    Authorization = "Bearer $Token"
    Accept        = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

function Write-Step([string]$msg) { Write-Host "`n===== $msg =====" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

# ---------- 1. 创建（或复用）Release ----------
Write-Step "1/3 创建 GitHub Release（tag=$Version）"
$relBody = @{ tag_name = $Version; name = $Version; body = $Notes; draft = $false; prerelease = $false } | ConvertTo-Json
$release = $null
try {
    $release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/releases" -Headers $headers -Body $relBody -ContentType "application/json"
    Write-Ok "Release $Version 已创建"
}
catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 422) {
        # tag 的 Release 已存在 → 复用
        $release = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$Repo/releases?per_page=30" -Headers $headers |
            Where-Object { $_.tag_name -eq $Version } | Select-Object -First 1
        if (-not $release) { throw "Release 已存在但查询失败" }
        Write-Warn "Release $Version 已存在，复用"
    }
    else { throw }
}

# ---------- 2. 上传镜像包资产 ----------
Write-Step "2/3 上传镜像包资产"
$assetName = Split-Path -Leaf $TarPath
$existing = $release.assets | Where-Object { $_.name -eq $assetName }
if ($existing) {
    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$Repo/releases/assets/$($existing.id)" -Headers $headers | Out-Null
    Write-Warn "已删除同名旧资产，重新上传"
}
$uploadUrl = $release.upload_url -replace '\{.*$', ''
$curlArgs = @(
    "-sSL", "-X", "POST",
    "-H", "Authorization: Bearer $Token",
    "-H", "Content-Type: application/octet-stream",
    "--data-binary", "@$TarPath",
    "$uploadUrl`?name=$assetName"
)
$curlOut = & curl.exe @curlArgs
if ($LASTEXITCODE -ne 0) { throw "资产上传失败（curl 退出码 $LASTEXITCODE）" }
$asset = $curlOut | ConvertFrom-Json
Write-Ok "资产 $assetName 上传完成（$([math]::Round($asset.size/1MB,1)) MB）"

# ---------- 3. 更新 releases/latest.json ----------
Write-Step "3/3 更新版本清单 releases/latest.json"
$sha256 = (Get-FileHash -LiteralPath $TarPath -Algorithm SHA256).Hash.ToLower()
$size = (Get-Item -LiteralPath $TarPath).Length

$current = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$Repo/contents/releases/latest.json?ref=$Branch" -Headers $headers -ErrorAction SilentlyContinue
$sha = if ($current) { $current.sha } else { $null }
$manifest = [ordered]@{
    version     = $Version
    released_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    min_version = ""
    notes       = $Notes
    images      = @(
        [ordered]@{ repo = "inkstone-backend";  tag = "latest"; service = "backend"  },
        [ordered]@{ repo = "inkstone-frontend"; tag = "latest"; service = "frontend" }
    )
    asset       = [ordered]@{
        name   = $assetName
        url    = "https://github.com/$Repo/releases/download/$Version/$assetName"
        sha256 = $sha256
        size   = $size
    }
}
$json = $manifest | ConvertTo-Json -Depth 5
$putBody = @{
    message = "release ${Version}: 更新版本清单"
    content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    branch  = $Branch
}
if ($sha) { $putBody["sha"] = $sha }
$jsonBody = $putBody | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$Repo/contents/releases/latest.json" -Headers $headers -Body $jsonBody -ContentType "application/json" | Out-Null
Write-Ok "latest.json 已更新（version=$Version sha256=$($sha256.Substring(0,12))…）"

Write-Step "完成"
Write-Host "  各实例将在下一个检查周期（默认 15 分钟）内自动拉取更新。"
Write-Host "  立即验证：更新后台 → 检查更新；或重启实例 backend 容器触发首检。"
