# 部署说明

## 现有网站

- 仓库：KAHAX/pokemon-capsule-factory
- 正式分支：main
- Cloudflare Pages 项目：pokemon-capsule-factory
- 正式网址：https://pokemon-capsule-factory.pages.dev/
- 手机入口：https://pokemon-capsule-factory.pages.dev/mobile/

推送到 main 会触发现有 Cloudflare Pages 自动构建。更新现有项目即可保留网址，无需新建项目。

| 构建设置 | 值 |
| --- | --- |
| Framework preset | None |
| Root directory | web |
| Build command | npm run build |
| Build output directory | dist（相对于 web） |
| Node.js | 22，由 web/.node-version 指定 |

不需要 API Key、数据库或额外环境变量，也不依赖开发者电脑上的 5180 服务。

## 部署自己的副本

1. 将完整源码放入自己的 Git 仓库，保留 web/public 和 package-lock.json。
2. 关联自己的 Cloudflare Pages 项目，使用上面的设置。
3. 构建后检查首页、/mobile/、开球和图鉴。

也可在 web 目录运行 npm ci 和 npm run build，将 web/dist 的全部内容放到静态网站根路径。资源使用 /assets/... 地址，不能直接部署到 /some-subfolder/ 子路径而不修改配置。

## 更新前检查

在 web 目录执行：

```sh
npm run build
node scripts/test-card-preview-driving.mjs
node scripts/test-asset-transfer.mjs
```

在浏览器确认新卡收藏、打开图鉴、连续切卡、开球展示和手机版入口。自动化检查不等同于真实手机性能测试。

模型使用分块传输，分块也需要部署；不要把未使用的巨型原始模型或本地备份放回 public。现有 public/_headers 包含资源缓存设置。
