<#
.SYNOPSIS
    InkStone 一键打包发布脚本（本地 → 镜像包 git 仓库）。

.DESCRIPTION
    按顺序执行：
      1. 前置检查（git 工作区、版本号格式、changelog 是否已包含该版本）
      2. 自动改写 backend/internal/service/system_service.go 的 AppVersion
      3. 代码预检：gofmt / go vet / go build / npm run build / eslint（可用 -SkipChecks 跳过）
      4. docker build backend + frontend（API 地址用 -ApiUrl 注入）
      5. docker save → inkstone-images.tar，复制到 image-repo 并 commit + push
    完成后手动到推送后台「版本发布」页发布该版本。

.PARAMETER Version
    版本号，如 Beta1.10（必填）。仅允许字母、数字、点、下划线、连字符。

.PARAMETER Notes
    版本说明（可选，仅打印到控制台，不写入任何文件）。

.PARAMETER ApiUrl
    前端构建注入的 API 地址，默认 https://blog.shenv.top/api/v1

.PARAMETER SkipChecks
    跳过长耗时预检（npm build 等）

.PARAMETER DryRun
    预演模式：只做前置检查与改写预览，不构建、不改文件、不提交推送

.EXAMPLE
    .\scripts\release.ps1 -Version Beta1.10

.EXAMPLE
    .\scripts\release.ps1 -Version Beta1.10 -Notes "Markdown 编辑器升级" -SkipChecks

.EXAMPLE
    .\scripts\release.ps1 -Version Beta1.10 -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$Notes = "",

    [string]$ApiUrl = "https://blog.shenv.top/api/v1",

    [switch]$SkipChecks,

    [switch]$DryRun,

    [string]$ReleaseRoot = "D:\blog-platform-release",
    [string]$RepoRoot = "D:\blog-platform"
)

$ErrorActionPreference = "Continue"  # native 命令的 stderr 告警不当致命错误；显式检查 $LASTEXITCODE
Set-StrictMode -Version 2.0

function Write-Step([string]$msg) { Write-Host "`n===== $msg =====" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

# 版本号白名单（与后端 versionPattern 一致，防注入 tag/命令）
if ($Version -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    throw "版本号含非法字符: $Version"
}

$backendDir = Join-Path $RepoRoot "backend"
$frontendDir = Join-Path $RepoRoot "frontend"
$imageRepo = Join-Path $ReleaseRoot "image-repo"
$tarOut = Join-Path $ReleaseRoot "inkstone-images.tar"

Write-Step "1/6 前置检查"
foreach ($d in @($RepoRoot, $backendDir, $frontendDir, $imageRepo)) {
    if (-not (Test-Path -LiteralPath $d)) { throw "目录不存在: $d" }
}

$dirty = & git -C $RepoRoot status --porcelain
if ($dirty) {
    Write-Warn "源码仓库有未提交改动，建议先 commit："
    $dirty | ForEach-Object { Write-Host "    $_" }
}

$systemFile = Join-Path $backendDir "internal\service\system_service.go"
$sysRaw = [System.IO.File]::ReadAllText($systemFile)
if ($sysRaw -notmatch '(?m)^const AppVersion = "([^"]+)"') { throw "未找到 AppVersion 定义: $systemFile" }
$oldVersion = $Matches[1]
$needle = 'Version: "' + $Version + '"'
if (-not $sysRaw.Contains($needle)) {
    # changelog 尚未包含该版本 → 提醒手动编辑（脚本不替你编造更新说明）
    Write-Warn "changelog 中还没有 $Version 条目，请在 system_service.go 的 changelog 列表首条补充说明"
}
Write-Ok "当前 AppVersion=$oldVersion → 目标 $Version"

Write-Step "2/6 改写 AppVersion + 预检"
if ($DryRun) {
    Write-Warn "[DryRun] 将把 AppVersion 改为 $Version（system_service.go），并在 changelog 首条插入条目"
}
else {
    $newSys = [regex]::Replace($sysRaw, '(?m)^const AppVersion = "[^"]+"', "const AppVersion = `"$Version`"", 1)
    [System.IO.File]::WriteAllText($systemFile, $newSys, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "AppVersion 已改为 $Version"
}

if ($DryRun) {
    Write-Warn "[DryRun] 跳过代码预检"
}
elseif (-not $SkipChecks) {
    Push-Location $backendDir
    try {
        & gofmt -w .
        if ($LASTEXITCODE -ne 0) { throw "gofmt 失败" }
        & go vet ./...
        if ($LASTEXITCODE -ne 0) { throw "go vet 失败" }
        & go build -o server.exe ./cmd/server
        if ($LASTEXITCODE -ne 0) { throw "go build 失败" }
        & go test ./internal/service/
        if ($LASTEXITCODE -ne 0) { throw "go test 失败" }
        Write-Ok "后端 gofmt/vet/build/test 通过"
    }
    finally { Pop-Location }

    Push-Location $frontendDir
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build 失败" }
        & npx eslint app components lib --ext .ts,.tsx
        if ($LASTEXITCODE -ne 0) { throw "eslint 失败" }
        Write-Ok "前端 build/eslint 通过"
    }
    finally { Pop-Location }
}
else {
    Write-Warn "已跳过代码预检（-SkipChecks）"
}

Write-Step "3/6 构建镜像"
if ($DryRun) {
    Write-Warn "[DryRun] docker build -t inkstone-backend:latest $backendDir"
    Write-Warn "[DryRun] docker build -t inkstone-frontend:latest --build-arg NEXT_PUBLIC_API_URL=$ApiUrl $frontendDir"
}
else {
    & docker build -q -t inkstone-backend:latest $backendDir
    if ($LASTEXITCODE -ne 0) { throw "backend 镜像构建失败" }
    & docker build -q -t inkstone-frontend:latest --build-arg "NEXT_PUBLIC_API_URL=$ApiUrl" $frontendDir
    if ($LASTEXITCODE -ne 0) { throw "frontend 镜像构建失败" }
    Write-Ok "inkstone-backend:latest / inkstone-frontend:latest 构建完成（API=$ApiUrl）"
}

Write-Step "4/6 导出镜像包"
if ($DryRun) {
    Write-Warn "[DryRun] docker save -o $tarOut inkstone-backend:latest inkstone-frontend:latest"
}
else {
    if (Test-Path -LiteralPath $tarOut) { Remove-Item -LiteralPath $tarOut -Force }
    & docker save -o $tarOut inkstone-backend:latest inkstone-frontend:latest
    if ($LASTEXITCODE -ne 0) { throw "docker save 失败" }
    $sizeMB = [math]::Round((Get-Item -LiteralPath $tarOut).Length / 1MB, 1)
    Copy-Item -LiteralPath $tarOut -Destination (Join-Path $imageRepo "inkstone-images.tar") -Force
    Write-Ok "inkstone-images.tar（$sizeMB MB）已复制到 image-repo"
}

Write-Step "5/6 提交镜像包仓库"
$commitMsg = "release ${Version}: $(if ($Notes) { $Notes } else { 'build' })"
if ($DryRun) {
    Write-Warn "[DryRun] 将提交并推送 image-repo：$commitMsg"
}
else {
    # -A 会同时带上 docker-compose.offline.yml 等仓库文件的改动（.env 被 .gitignore 排除）
    & git -C $imageRepo add -A
    & git -C $imageRepo commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) { throw "image-repo commit 失败（tar 无变化？）" }
    $remote = & git -C $imageRepo remote get-url origin 2>$null
    if ($remote) {
        & git -C $imageRepo push origin main
        if ($LASTEXITCODE -ne 0) { throw "git push 失败（remotes: $remote）" }
        Write-Ok "已推送 $remote"
    }
    else {
        Write-Warn "image-repo 未配置 origin，跳过推送。配置示例："
        Write-Host "    git -C `"$imageRepo`" remote add origin ssh://root@<服务器IP>/srv/git/inkstone-images.git"
    }
}

Write-Step "6/6 完成"
$notesText = if ($Notes) { $Notes } else { "（无）" }
Write-Host "  镜像包 : $tarOut"
Write-Host "  提交   : $commitMsg"
Write-Host "  说明   : $notesText"
Write-Host ""
Write-Host "  后续步骤："
Write-Host "   1. 提交源码仓库改动（AppVersion / changelog / 功能代码）：git add -A; git commit"
Write-Host "   2. 推送后台 https://update.shenv.top 「版本发布」页：创建并发布版本 $Version"
Write-Host "      → 各实例 15 秒内自动完成更新（auto 开启时零人工；关闭时博客后台手动「立即更新」）"
Write-Host "   3. 观察：博客后台「系统更新」页日志，或推送后台「客户端实例」页的心跳/状态"
Write-Host "   4. 紧急回滚（服务器上）：docker tag inkstone-backend:rollback-<时间> inkstone-backend:latest && docker compose -f docker-compose.offline.yml up -d"
Write-Host "      （正常情况下版本不符会自动回滚；此命令用于新镜像起不来等场景）"
