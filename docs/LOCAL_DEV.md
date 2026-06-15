# 本地长期开发环境

## 前置工具

- Node.js 20 或更高版本
- npm 10 或更高版本
- 现代 Chromium 浏览器，Playwright 会在安装后提供测试浏览器

## 首次配置

```powershell
npm install
npx playwright install chromium
```

当前项目已配置 GitHub Pages 和 Supabase 公开客户端配置：

- Pages 根地址：`https://lizi510524.github.io/ShuaTi/`
- PWA 地址：`https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/`
- 本地地址：`http://127.0.0.1:4174/`

`wo-ai-shuati-pro/config.js` 中的 `supabaseAnonKey` 是浏览器端公开 key；不要把 Supabase 的 `service_role` key 写进前端文件。

需要云同步时：

1. 在 Supabase 创建项目。
2. 执行 `wo-ai-shuati-pro/supabase/schema.sql`。
3. 确认 `wo-ai-shuati-pro/config.js` 的 `appUrl` 是 `https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/`。
4. 在 Supabase Auth 中启用 Email 登录，并把本地和 Pages 地址加入 Redirect URLs。

## 常用命令

```powershell
npm run dev
```

打开 `http://127.0.0.1:4174/`。

```powershell
npm test
```

生成最小 Excel 题库 fixture，自动启动本地服务，并用 Playwright 在移动端视口跑一遍导入、生成练习、发现页、我的页流程。

可以覆盖默认端口和测试文件：

```powershell
$env:PORT = "5173"
$env:SMOKE_BASE_URL = "http://127.0.0.1:5173/"
$env:SMOKE_XLSX = "D:\path\to\bank.xlsx"
npm run dev
npm run test:app
```

## 项目维护要点

- 应用本体保持无构建工具：`wo-ai-shuati-pro/index.html` 直接加载 `app.js`。
- 本地数据在 IndexedDB，调试异常导入时先清空站点数据。
- Service Worker 会缓存静态资源；开发时如遇旧代码，先在浏览器 DevTools 的 Application 面板 unregister service worker 并清缓存。
- `config.js` 可能包含 Supabase 配置，提交前确认没有真实密钥或私有项目地址。

## Git 协作建议

如果你已经被加入 `LiZi510524/ShuaTi` 并拥有 push 权限，推荐直接维护原仓库：

```powershell
git switch main
git pull --ff-only
git switch -c feat/短功能名
```

每个功能或修复走短分支，提交前运行 `npm test`，然后 push 分支并发 PR。

如果你没有原仓库写权限，再维护自己的 fork：

```powershell
git remote rename origin upstream
git remote add origin https://github.com/你的用户名/ShuaTi.git
git fetch --all
```

这种模式下，从 `upstream/main` 更新本地，从自己的 `origin` 推分支，PR 目标仍然选 `LiZi510524/ShuaTi`。
