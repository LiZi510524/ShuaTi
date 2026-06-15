# 我爱刷题 Pro

这是“我爱刷题”的 Pro 版 PWA。基础版保持纯本地离线使用；Pro 版在本地题库能力上增加：

- 邮箱登录
- Apple ID 登录入口
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

1. 创建 Supabase 项目。
2. 在 Supabase SQL Editor 运行 `supabase/schema.sql`。
3. 复制 `config.example.js` 的内容到 `config.js`。
4. 填入：

```js
export const PRO_CONFIG = {
  supabaseUrl: "https://你的项目.supabase.co",
  supabaseAnonKey: "你的 Supabase anon public key",
  appUrl: "https://你的域名/wo-ai-shuati-pro/",
};
```

5. 在 Supabase Auth 里打开 Email 登录。
6. 在 URL Configuration 里把 `appUrl` 加到 Redirect URLs。

## Apple ID 登录

Apple 登录需要额外配置：

- Apple Developer 账号
- Services ID
- Sign in with Apple Key
- 域名和回调地址
- Supabase Auth Apple Provider

没有配置 Apple Provider 时，邮箱登录和本地刷题仍然可用。

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
