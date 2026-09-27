<#
.SYNOPSIS
    InkStone 一键打包发布脚本（本地构建 → 镜像包）。

.DESCRIPTION
    按顺序执行：
      1. 前置检查（git 工作区、版本号格式、changelog 是否已包含该版本）
      2. 自动改写 backend/internal/service/system_service.go 的 AppVersion
      3. 代码预检：gofmt / go vet / go build / npm run build / eslint（可用 -SkipChecks 跳过）
      4. docker build backend + frontend（API 地址用 -ApiUrl 注入）
      5. docker save → inkstone-images.tar，复制到 image-repo 并 commit + push
      6. 版本化产物输出到 -ImagesDir（默认 D:\images）：
         - inkstone-images-<Version>.tar（分发用镜像包，含版本号）
         - release-notes-<Version>.md（更新说明：SHA256/大小/包含镜像/changelog/三种部署方式/回滚）
     完成后分发版本化 tar，或在更新推送后台发布（实例自动更新）。

.PARAMETER Version
    版本号，如 Beta1.20（必填）。仅允许字母、数字、点、下划线、连字符。

.PARAMETER Notes
    版本说明（可选；会写入产物 release-notes-<Version>.md 的发布备注）。

.PARAMETER ApiUrl
    前端构建注入的 API 地址，默认 https://blog.shenv.top/api/v1

.PARAMETER SkipChecks
    跳过长耗时预检（npm build 等）

.PARAMETER DryRun
    预演模式：只做前置检查与改写预览，不构建、不改文件、不提交推送

.PARAMETER ReleaseRoot
    中转产物根目录，默认 D:\blog-platform-release

.PARAMETER RepoRoot
    源码仓库目录，默认 D:\blog-platform

.PARAMETER ImagesDir
    版本化产物目录，默认 D:\images

.EXAMPLE
    .\scripts\release.ps1 -Version Beta1.20

.EXAMPLE
    .\scripts\release.ps1 -Version Beta1.20 -Notes "编辑器升级" -SkipChecks

.EXAMPLE
    .\scripts\release.ps1 -Version Beta1.20 -DryRun
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

    [string]$RepoRoot = "D:\blog-platform",

    [string]$ImagesDir = "D:\images"
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
$sysRaw = [System.IO.File]::ReadAllText($systemFile, [System.Text.Encoding]::UTF8)
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

Write-Step "4/6 导出镜像包 + 版本化产物"
if ($DryRun) {
    Write-Warn "[DryRun] docker save -o $tarOut inkstone-backend:latest inkstone-frontend:latest"
    Write-Warn "[DryRun] 版本化产物将输出到 $ImagesDir\inkstone-images-$Version.tar 与 $ImagesDir\release-notes-$Version.md"
}
else {
    if (Test-Path -LiteralPath $tarOut) { Remove-Item -LiteralPath $tarOut -Force }
    & docker save -o $tarOut inkstone-backend:latest inkstone-frontend:latest
    if ($LASTEXITCODE -ne 0) { throw "docker save 失败" }
    $sizeBytes = (Get-Item -LiteralPath $tarOut).Length
    $sizeMB = [math]::Round($sizeBytes / 1MB, 1)
    Copy-Item -LiteralPath $tarOut -Destination (Join-Path $imageRepo "inkstone-images.tar") -Force
    Write-Ok "inkstone-images.tar（$sizeMB MB）已复制到 image-repo（固定名，服务器协作约定）"

    # ---------- 版本化产物目录（D:\images）----------
    if (-not (Test-Path -LiteralPath $ImagesDir)) { New-Item -ItemType Directory -Path $ImagesDir | Out-Null }
    $versionedTar = Join-Path $ImagesDir "inkstone-images-$Version.tar"
    Copy-Item -LiteralPath $tarOut -Destination $versionedTar -Force
    Write-Ok "版本化镜像包：$versionedTar（$sizeMB MB）"

    $sha256 = (Get-FileHash -LiteralPath $tarOut -Algorithm SHA256).Hash.ToLower()
    $backendID = (& docker image inspect inkstone-backend:latest --format '{{.Id}}' 2>$null) -join ''
    $frontendID = (& docker image inspect inkstone-frontend:latest --format '{{.Id}}' 2>$null) -join ''

    # 从 changelog 提取本版本条目（[^}]* 不跨条目，条目内无右花括号）
    $changelogItems = @()
    $clMatch = [regex]::Match($sysRaw, '(?s)Version:\s*"' + [regex]::Escape($Version) + '".*?Items:\s*\[\]string\{(?<items>[^}]*)\}')
    if ($clMatch.Success) {
        $clMatch.Groups['items'].Value -split "`n" | ForEach-Object {
            if ($_ -match '"([^"]+)"') { $changelogItems += $Matches[1] }
        }
    }
    $notesLines = @()
    foreach ($item in $changelogItems) { $notesLines += "- $item" }
    if ($Notes) { $notesLines += "" ; $notesLines += "发布备注：$Notes" }
    $notesBlock = ($notesLines -join "`n")

    $noteFile = Join-Path $ImagesDir "release-notes-$Version.md"
    $noteText = @"
# InkStone $Version 更新包

- 版本号：$Version
- 生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
- 镜像包：inkstone-images-$Version.tar（$sizeMB MB / $sizeBytes 字节）
- 镜像包 SHA256：``$sha256``
- 包含镜像：inkstone-backend:latest（$backendID）、inkstone-frontend:latest（$frontendID）

## 更新内容

$notesBlock

## 部署方式（任选）

### 方式一：服务器本地 git（image-repo，release 时已自动 push）

``````bash
cd /opt/inkstone-images/repo
git fetch --depth=1 /srv/git/inkstone-images.git main && git reset --hard FETCH_HEAD
docker load -i inkstone-images.tar
cd /opt/inkstone-deploy && docker compose -f docker-compose.yml up -d
``````

### 方式二：scp + docker load

``````powershell
scp "$versionedTar" root@<服务器IP>:/opt/
ssh root@<服务器IP> "docker load -i /opt/inkstone-images-$Version.tar && cd /opt/inkstone-deploy && docker compose -f docker-compose.yml up -d"
``````

### 方式三：GitHub Release + 更新推送后台（建议，全自动）

在 https://update.shenv.top 发布新版本（版本号 $Version，上传本目录的 inkstone-images-$Version.tar），
各实例将在下一个检查周期（默认 15 分钟）自动完成 下载 → SHA256 校验 → 容器替换，失败自动回滚。

## 回滚

- 自动：部署阶段健康检查 / 运行版本核对失败 → agent 自动回滚到更新前版本
- 手动：任一站后台「系统更新 → 更新历史 → 回滚到上一版本」，无需登录服务器

部署前建议先备份数据库：

``````bash
docker exec inkstone-postgres pg_dump -U blog blog_platform > /opt/backup_blog_pre-$Version.sql
``````
"@
    [System.IO.File]::WriteAllText($noteFile, $noteText, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "更新说明：$noteFile"
}

Write-Step "5/6 提交镜像包仓库"
$commitMsg = "release ${Version}: $(if ($Notes) { $Notes } else { 'build' })"
if ($DryRun) {
    Write-Warn "[DryRun] 将提交并推送 image-repo：$commitMsg"
}
else {
    # -A 会同时带上仓库文件的改动（.env 被 .gitignore 排除）
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
Write-Host "  镜像包（中转）  : $tarOut"
Write-Host "  镜像包（分发）  : $(Join-Path $ImagesDir "inkstone-images-$Version.tar")"
Write-Host "  更新说明        : $(Join-Path $ImagesDir "release-notes-$Version.md")"
Write-Host "  提交            : $commitMsg"
Write-Host "  说明            : $notesText"
Write-Host ""
Write-Host "  后续步骤："
Write-Host "   1. 提交源码仓库改动（AppVersion / changelog / 功能代码）：git add -A; git commit; git push"
Write-Host "   2. 分发镜像：$ImagesDir\ 下的 inkstone-images-$Version.tar + release-notes-$Version.md（说明含 SHA256 与部署命令）"
Write-Host "   3. 或打开更新推送后台 update-hub → 发布新版本（版本号 $Version，上传版本化 tar）"
Write-Host "   4. 发布后各实例在下一个检查周期（默认 15 分钟）内自动完成 下载→校验→替换容器"
Write-Host "   5. 紧急回滚：任一站后台「系统更新 → 更新历史 → 回滚到上一版本」，无需登录服务器"
