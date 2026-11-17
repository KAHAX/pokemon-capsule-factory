# 宝可梦扭蛋机 · Pokémon Capsule Works

可交互的 3D 宝可梦扭蛋机场景：转动扭蛋机、打开精灵球、旋转观察宝可梦，并收藏成动态卡牌。包含霓虹招牌、场景精灵、问号箱奖励和独立手机入口。

**[在线体验](https://pokemon-capsule-factory.pages.dev/) · [手机入口](https://pokemon-capsule-factory.pages.dev/mobile/) · [分享源码](docs/SHARING.md) · [部署说明](docs/DEPLOYMENT.md)**

## 下载后怎么运行

安装 **Node.js 22**（包含 npm）。源码 ZIP 解压后，在项目根目录打开终端：

```sh
cd web
npm ci
npm run dev -- --port 5174
```

打开终端显示的网址，通常为 http://localhost:5174/；手机入口为 http://localhost:5174/mobile/。端口被占用时，以终端显示的地址为准。

Windows 也可以双击根目录的 **start-windows.cmd**：首次安装依赖，随后启动网页并打开浏览器。首次安装需要联网；模型、贴图和音乐已包含在源码中。

**不需要 Blender、API Key、数据库或 localhost:5180。** 不要直接双击 HTML 文件，3D 资源需要通过本地服务加载。

有仓库权限时，也可以先克隆：

```sh
git clone --depth 1 https://github.com/KAHAX/pokemon-capsule-factory.git
cd pokemon-capsule-factory
```

再执行上面的运行命令。

## 目录结构

```text
pokemon-capsule-factory/
├─ README.md                 阅读入口
├─ start-windows.cmd         Windows 启动入口
├─ docs/                     分享、部署、版本说明
│  └─ reports/               历史优化报告，不参与运行
├─ scripts/export-source.ps1 导出已提交版本的源码 ZIP
└─ web/
   ├─ index.html             电脑版入口
   ├─ mobile/index.html      独立手机版入口
   ├─ src/                   场景、交互、卡牌与界面
   ├─ public/                模型、贴图、音乐、解码器和素材署名
   ├─ scripts/               资源处理与检查工具
   ├─ package.json           依赖和命令
   └─ package-lock.json      固定依赖版本
```

技术栈：JavaScript ES Modules、Three.js、Vite、Rapier。修改 `web/src` 后，开发服务会重新加载。

| 想修改的内容 | 主要文件（相对于 web/src） |
| --- | --- |
| 页面初始化、场景连接 | `main.js` |
| 扭蛋机、出球时机 | `machine.js`、`chamber.js`、`output-animation.js` |
| 精灵球与宝可梦展示 | `focus.js` |
| 图鉴、卡牌 | `pokedex-pack.js`、`holo-card.js`、`card/` |
| 闪光效果 | `collection-effects.js`、`shiny-sparkles.js` |
| 招牌、问号箱交互 | `sign-interaction.js`、`box-interaction.js` |
| 手机画质 | `mobile-performance.js`、`mobile-rendering.js` |

## 构建与检查

以下命令在 `web` 目录执行：

```sh
npm run build
npm run preview -- --port 4173
```

构建产物为 `web/dist/`，预览地址为 http://localhost:4173/。

```sh
node scripts/test-card-preview-driving.mjs
node scripts/test-asset-transfer.mjs
```

## 资源与常见问题

- 完整源码包含约 **600 MiB 的运行资源**，下载与首次加载需要时间。分享 ZIP 不含依赖目录和 Git 历史。
- **保留整个 web/public**。模型会使用 `src/transfer-manifest.json` 和 `src/mobile-transfer-manifest.json` 对应的分块，不能只复制 `.glb` 或 `src`。
- 收藏保存在访问者的浏览器中，不随源码分享；不同浏览器或域名不会自动同步。
- `/` 是电脑版，`/mobile/` 是独立手机版，不自动跳转。手机表现取决于设备和浏览器。
- `npm run sync` 仅用于开发者从另一个本地项目导入精灵，普通运行和部署不要执行。新增动画只保留实际用到的动作。
- 本仓库包含网页运行源码和已导出的资源，**不包含原始 Blender .blend 工程**。

## 分享与素材说明

仓库目前为**私有仓库**，未授权用户无法直接打开 GitHub 链接。可发送完整源码 ZIP，或给指定 GitHub 用户添加协作者权限，详见 [分享指南](docs/SHARING.md)。

宝可梦名称、角色和相关美术属于各自权利人。已有第三方素材署名和许可保存在 [web/public/credits](web/public/credits)。本仓库没有为所有代码与素材统一授予开源许可；分享源码不等于授予第三方素材的商业使用权。

[详细版本说明](docs/VERSION-NOTES.md) · [历史优化报告](docs/reports/)
