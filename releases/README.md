# releases/ — 版本发布清单目录

实例端（各博客站点的 backend）从这里拉取更新信息，无需任何服务器操作。

## latest.json（版本清单）

```json
{
  "version": "Beta1.16",
  "released_at": "2026-10-01T00:00:00Z",
  "min_version": "Beta1.5",
  "notes": "更新说明（支持多行）",
  "images": [
    { "repo": "inkstone-backend", "tag": "latest", "service": "backend" },
    { "repo": "inkstone-frontend", "tag": "latest", "service": "frontend" }
  ],
  "asset": {
    "name": "inkstone-images.tar",
    "url": "https://github.com/<owner>/<repo>/releases/download/Beta1.16/inkstone-images.tar",
    "sha256": "<sha256sum 输出>",
    "size": 123456789
  }
}
```

| 字段 | 说明 |
|---|---|
| `version` | 新版本号（必须大于实例当前版本，比较规则见 backend `compareVersion`） |
| `min_version` | 能自动更新到该版本的最低版本；低于它的实例只提示不自动更新 |
| `images[].service` | compose 服务名，用于定位要替换的容器（backend / frontend） |
| `asset.url` | GitHub Release 资产下载地址（实例端自动走加速源） |
| `asset.sha256` | 镜像包 SHA256（发布时由 update-hub 计算填写；留空跳过校验） |

## 镜像包

`inkstone-images.tar` 由 `scripts/release.ps1` 产出（`docker save` 两个镜像），
上传为对应版本 tag 的 GitHub Release 资产。推荐通过 `update-hub` 更新推送后台发布，
也可手动 `gh release upload`。

注意文件在仓库里只保留模板；真实大包放 GitHub Releases（不进 git）。
