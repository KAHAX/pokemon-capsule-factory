# 如何分享

## 只分享体验网址

- 电脑版：https://pokemon-capsule-factory.pages.dev/
- 手机版：https://pokemon-capsule-factory.pages.dev/mobile/

访问网站不需要仓库权限，也不需要安装软件。

## 发完整源码包

发送 `pokemon-capsule-factory-source-版本号.zip`。对方解压、安装 Node.js 22，按照根目录 README 操作；Windows 也可双击 `start-windows.cmd`。

源码包包含已提交的代码、模型、贴图、音乐和说明。不包含 Git 历史、依赖目录、构建目录、浏览器收藏或原始 Blender 工程。

在 Git 仓库根目录用 PowerShell 生成新的分享包：

```powershell
powershell -NoProfile -File scripts/export-source.ps1
```

输出到 `share/`，同时生成 SHA-256 校验文件。脚本导出 **HEAD 已提交版本**；有未提交改动时会停止，避免发出旧版。ZIP 解压后的副本没有 Git 历史，重新导出需使用 Git 克隆副本。

## 通过 GitHub 分享

仓库：https://github.com/KAHAX/pokemon-capsule-factory

当前是私有仓库。在仓库 Settings → Collaborators 中邀请指定朋友的 GitHub 账号，对方接受后就能浏览、克隆，或点击 Code → Download ZIP。不要分享登录凭据。

如果以后希望所有人都能直接访问源码，需要仓库所有者另行决定是否改为公开。本次整理保留原有权限。

## 可直接转发的说明

> 这是宝可梦扭蛋机网页源码，模型和素材已包含。先安装 Node.js 22，解压后在项目根目录执行 cd web、npm ci、npm run dev，打开终端显示的网址即可。Windows 也可以双击 start-windows.cmd。不需要 Blender、API Key 或额外动画工具。资源约 600 MiB，首次下载和安装需要时间。素材说明见 README。
