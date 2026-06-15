# 我爱刷题 Pro

这是“我爱刷题”的 Pro 版 PWA。基础版保持纯本地离线使用；Pro 版在本地题库能力上增加：

- 邮箱登录
- Supabase 云同步
- 公开发布题库
- 通过用户名查看公开主页
- 通过题库 ID 保存别人整理的题库
- 本地 IndexedDB 离线刷题和 JSON 备份

## 本地运行

```powershell
cd D:\iCloudDrive\codex\xithink\wo-ai-shuati-pro
python -m http.server 4174
```

浏览器打开：

```text
http://localhost:4174/
```

## 云端配置

当前项目已经填好 `config.js`：

```js
export const PRO_CONFIG = {
  supabaseUrl: "https://vsrafuabubzwfnesryju.supabase.co",
  supabaseAnonKey: "sb_publishable_8zf8ucL8uQjj-3F6PYMlWA_VY1fm69F",
  appUrl: "https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/",
};
```

`supabaseAnonKey` 是浏览器端可用的公开 key，可以放在静态网页里；不要把 Supabase 的 `service_role` key 写进前端文件。

你还需要在 Supabase 网页里完成下面几步：

1. 打开 Supabase 项目，左侧进入 `SQL Editor`。
2. 点击 `New query`。
3. 打开本项目的 `supabase/schema.sql`，复制全部 SQL。
4. 粘贴到 Supabase 的 SQL 编辑器里，点击 `Run`。
5. 运行成功后，左侧进入 `Table Editor`，应该能看到 `profiles`、`question_banks`、`questions`、`question_progress` 四张表。
6. 左侧进入 `Authentication` -> `Providers`，确认 `Email` 已启用。
7. 进入 `Authentication` -> `URL Configuration`，把 `Site URL` 设置为：

```text
https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/
```

8. 在 `Redirect URLs` 里也加入：

```text
https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/
https://lizi510524.github.io/ShuaTi/
http://localhost:4174/
```

9. 在 GitHub 仓库进入 `Settings` -> `Pages`。
10. `Build and deployment` 选择 `Deploy from a branch`。
11. `Branch` 选择 `main`，目录选择 `/ (root)`，点击 `Save`。
12. 等待 GitHub Pages 部署完成，然后打开线上地址测试邮箱登录、设置用户名、导入题库和公开发布。

线上地址：

```text
https://lizi510524.github.io/ShuaTi/wo-ai-shuati-pro/
```

仓库根地址也会自动跳转到 Pro App：

```text
https://lizi510524.github.io/ShuaTi/
```

## 发布公开题库

1. 登录。
2. 在“我的”里设置用户名。
3. 导入一个 Excel 题库。
4. 在题库卡片点“公开发布”。
5. 其他人可以在“发现”页搜索你的用户名，或者输入题库 ID 保存题库。

## 数据策略

- 本地题库、错题、收藏、练习记录：IndexedDB。
- 公开题库：Supabase。
- 练习记录同步：当前题库有云端 ID 时可上传。
- 备份：设置页导出/导入 JSON。

## Excel 格式

兼容导题模板：

- A 列：题干
- B 列：正确答案
- C 列：解析
- D-J 列：选项 A-G

题型识别：

- `A`：单选
- `ABCD`：多选
- `正确/错误/对/错/√/×/Y/N`：判断
- 题干含 `{答案}` 或无选项：填空
