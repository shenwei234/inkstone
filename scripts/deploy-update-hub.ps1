<#
.SYNOPSIS
    部署更新推送后台 update-hub 到服务器（update.shenv.top）。

.DESCRIPTION
    update-hub 是纯静态站（Next.js output:'export'），服务器用 nginx 直接托管：
      1. 本地 npm run build 产出 out/
      2. scp 到服务器 /opt/update-hub/
      3. nginx -t && systemctl reload nginx
    无容器/无端口/无后端进程，部署即覆盖。

.PARAMETER Host
    服务器地址，默认 47.116.16.181。

.PARAMETER Dir
    服务器部署目录，默认 /opt/update-hub。

.PARAMETER SkipBuild
    跳过本地构建（直接用已存在的 out/）。

.EXAMPLE
    .\scripts\deploy-update-hub.ps1
#>
[CmdletBinding()]
param(
    [string]$Host_ = "47.116.16.181",
    [string]$Dir = "/opt/update-hub",
    [string]$RepoRoot = "D:\blog-platform",
    [switch]$SkipBuild,
)

$ErrorActionPreference = "Stop"
$hubDir = Join-Path $RepoRoot "update-hub"

function Write-Step([string]$msg) { Write-Host "`n===== $msg =====" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }

# ---------- 1. 本地构建 ----------
if ($SkipBuild) {
    Write-Step "1/3 构建（跳过）"
}
else {
    Write-Step "1/3 本地构建 update-hub"
    Push-Location $hubDir
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build 失败" }
        Write-Ok "构建完成（out/）"
    }
    finally { Pop-Location }
}

$outDir = Join-Path $hubDir "out"
if (-not (Test-Path (Join-Path $outDir "index.html"))) {
    throw "未找到构建产物：$outDir\index.html（去掉 -SkipBuild 或先构建）"
}

# ---------- 2. 上传 ----------
Write-Step "2/3 上传到服务器 ${Host_}:${Dir}"
$sshTarget = "root@$Host_"
& ssh -o BatchMode=yes $sshTarget "mkdir -p $Dir && rm -rf ${Dir}/*"
if ($LASTEXITCODE -ne 0) { throw "ssh 准备目录失败" }
& scp -o BatchMode=yes -r "$outDir\*" "${sshTarget}:${Dir}/"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败" }
Write-Ok "已上传并覆盖"

# ---------- 3. 重载 nginx ----------
Write-Step "3/3 重载 nginx"
& ssh -o BatchMode=yes $sshTarget "nginx -t && systemctl reload nginx"
if ($LASTEXITCODE -ne 0) { throw "nginx 重载失败（配置错误？检查 /etc/nginx/conf.d/update.conf）" }
Write-Ok "已重载"

Write-Host ""
Write-Host "  访问：https://update.shenv.top"
Write-Host "  说明：静态站无容器/端口；前缀配置在 /etc/nginx/conf.d/update.conf（root=$Dir）"
