# ShuaTi

面向大学生期末复习的刷题工具集合，目前包含两部分：

1. 从学习通/超星提交结果页导出题库。
2. `我爱刷题 Pro` PWA 轻应用，用于导入题库、刷题、错题复习和后续云同步。

## 项目结构

```text
.
├─ expert_script/
│  ├─ chaoxing-source-export.user.js   # 学习通提交结果页导题油猴脚本
│  └─ 导题模板.xlsx                      # Excel 导题模板
├─ wo-ai-shuati-pro/
│  ├─ index.html
│  ├─ app.js
│  ├─ cloud.js                         # Supabase 云端接口层
│  ├─ config.example.js                 # 云端配置示例
│  ├─ config.js                         # 本地占位配置
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  ├─ styles.css
│  └─ supabase/schema.sql               # Supabase 数据库结构和 RLS
└─ 知识点生成流程.md
```

## 一、从学习通导出题库

### 安装脚本

1. 浏览器安装 Tampermonkey / 篡改猴 / 油猴。
2. 新建脚本。
3. 把 `expert_script/chaoxing-source-export.user.js` 的内容复制进去并保存。
4. 打开学习通/超星已经提交后的作业详情页。
5. 页面右下角会出现“学习通导题导出”面板。

### 导出方式

在提交结果页点击：

- `后台导出 Excel`：导出可被刷题 App 导入的 `.xlsx`。
- `导出调试 JSON`：如果识别不准，用于排查页面结构。

脚本只读取提交结果页里已经显示的题目和 **正确答案**，不会自动答题，也不会替你提交。

### Excel 模板规范

兼容 `expert_script/导题模板.xlsx`：

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| 题干 | 正确答案 | 解析 | 选项A | 选项B | 选项C | 选项D | 选项E | 选项F | 选项G |

题型识别规则：

- `A` / `B` / `C`：单选题。
- `AB` / `ACD` / `ABCD`：多选题。
- `正确` / `错误` / `对` / `错` / `√` / `×` / `Y` / `N`：判断题。
- 题干含 `{答案}` 或没有选项时，按填空题处理。

## 二、我爱刷题 Pro App

目录：`wo-ai-shuati-pro/`

这是一个静态 PWA，可以在 iPhone Safari 中添加到主屏幕使用。

### 当前能力

- 导入 `.xlsx` 题库。
- 多题库管理：题库名、课程、章节、标签。
- 顺序刷题、随机刷题、错题、收藏、未做题。
- 单选、多选、判断、基础填空。
- 答题后显示正确答案和解析。
- 错题本、收藏、统计。
- 本地 IndexedDB 保存数据。
- JSON 备份与恢复。
- Pro 云端接口：邮箱登录、Apple 登录入口、公开题库、个人主页、题库 ID 分享、练习记录同步。

### 本地运行

```powershell
cd wo-ai-shuati-pro
python -m http.server 4174
```

打开：

```text
http://localhost:4174/
```

### iPhone 使用

1. 将 `wo-ai-shuati-pro/` 部署到 HTTPS 静态网站。
2. 用 iPhone Safari 打开网址。
3. 点击分享按钮。
4. 选择“添加到主屏幕”。

### 云同步配置

如果只本地刷题，不需要配置云端。

如果要启用登录、云同步、公开题库和个人主页：

1. 创建 Supabase 项目。
2. 在 Supabase SQL Editor 新建 Query，复制并运行 `wo-ai-shuati-pro/supabase/schema.sql`。
3. 填写 `wo-ai-shuati-pro/config.js`。当前项目使用：

```js
export const PRO_CONFIG = {
  supabaseUrl: "https://vsrafuabubzwfnesryju.supabase.co",
  supabaseAnonKey: "sb_publishable_8zf8ucL8uQjj-3F6PYMlWA_VY1fm69F",
  appUrl: "https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/",
};
```

4. 在 Supabase Auth 中启用 Email 登录。
5. 在 Auth 的 URL Configuration 中设置：
   - `Site URL`：`https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/`
   - `Redirect URLs`：`https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/`、`https://lizi510524.github.io/ShuaTi/` 和 `http://localhost:4174/`

### GitHub Pages 发布

推荐直接用 GitHub Pages 发布这个静态 PWA：

1. 进入 GitHub 仓库 `LiZi510524/ShuaTi`。
2. 打开 `Settings` -> `Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. `Branch` 选择 `main`，目录选择 `/ (root)`，保存。
5. 之后每次把代码 push 到 `main`，GitHub Pages 会自动更新。

线上地址：

```text
https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/
```

根地址会自动跳转到 Pro App：

```text
https://lizi510524.github.io/ShuaTi/
```

`supabaseAnonKey` 是公开客户端 key；不要把 Supabase 的 `service_role` key 写进前端文件。

Apple ID 登录还需要额外配置 Apple Developer 的 Sign in with Apple。

## 开发说明

本项目目前尽量保持无构建工具、无后端依赖：

- App 是静态 HTML/CSS/JS。
- Excel 解析在浏览器端完成。
- 本地数据使用 IndexedDB。
- 云端能力通过 Supabase REST/Auth 接口接入。

后续计划：

- 优化题库广场和个人主页。
- 增加题库版本管理。
- 增加云端进度拉取与冲突合并。
- 优化 iPhone 上的导入体验。
