# BayNotes Project Context (AI 助手专用)

此文档用于帮助 AI 快速理解 BayNotes 项目的架构、逻辑和当前状态。请在修改代码前优先阅读此文件。

## 1. 架构概览
* **类型**: 单页应用 (SPA) + Serverless 后端。
* **部署**: Cloudflare Pages (前端托管) + Cloudflare Functions (后端 API)。
* **数据库**: Cloudflare D1 (SQLite)。
* **前端技术**: 原生 HTML/JS, Vue 3 (Global Build/CDN), Tailwind CSS (CDN), Phosphor Icons, Marked.js (Markdown渲染), CryptoJS (AES加密)。
* **鉴权方式**: 自定义 Token (Bearer Header)，Token 格式 `base64(userId:uuid)`，存储于浏览器 localStorage。

## 2. 核心数据结构 (D1 SQL Schema)

### 用户表 (`users`)
* `id` (TEXT, PK): UUID。
* `username` (TEXT, Unique): 登录名。
* `password_hash` (TEXT): SHA-256 哈希值。
* `salt` (TEXT): 密码盐值。
* `role` (TEXT): 'admin' (管理员) 或 'user' (普通用户)。
* `permissions` (TEXT): 权限字符串，如 'edit,delete,share' 或 'all'。
* `created_at` (INT): Unix 时间戳。

### 笔记表 (`notes`)
* **基础信息**: 
    * `id` (TEXT, PK): UUID。
    * `user_id` (TEXT): 归属用户。
    * `title` (TEXT): 标题。
    * `content` (TEXT): 内容（若 `is_encrypted=1`，则此处存储的是 AES 密文）。
    * `folder_id` (TEXT): 关联 `folders` 表 ID。
* **安全状态**: 
    * `is_encrypted` (INT): 0=明文, 1=加密。
* **分享配置**: 
    * `share_id` (TEXT, Unique): 8位随机字符，用于生成公开链接。
    * `share_pwd` (TEXT): 访问密码（可选）。
    * `share_expire_at` (INT): 过期时间戳（可选）。
    * `share_burn_after_read` (INT): 0=否, 1=是（阅后即焚）。
* **状态**: 
    * `deleted_at` (INT): 软删除时间戳（非空表示在回收站）。
* `created_at` (INT): 创建时间。

### 文件夹表 (`folders`)
* `id` (TEXT, PK): UUID。
* `user_id` (TEXT): 归属用户。
* `parent_id` (TEXT): 父文件夹 ID（支持二级目录）。
* `name` (TEXT): 文件夹名称。

## 3. 关键业务逻辑

### 🔐 加密策略 (Encryption)
* **模式**: 客户端侧加密 (Client-side Encryption) + 服务端存储。
* **加密流程**: 用户输入独立密码 -> 前端使用 CryptoJS (AES) 加密 -> 后端仅接收并存储密文字符串。
* **解密流程**: 前端获取密文 -> 提示用户输入密码 -> 浏览器内存中解密展示。
* **注意**: 后端 API (`notes.js`) 对加密内容是“盲”的，只负责透传 `content` 和 `is_encrypted` 标记。

### 🔗 分享系统 (Sharing)
* **生成**: 用户在主页配置 -> 调用 `PATCH /api/notes` -> 后端生成 `share_id`。
* **访问**: 访客访问 `view.html?id=xxx` -> 调用 `GET /api/share`。
* **阅后即焚**: 访客 API 请求成功且验证通过后，后端立即触发 SQL `UPDATE notes SET share_id = NULL`，链接即刻失效。
* **分享页解密**: `view.html` 包含独立的前端解密逻辑。若 API 返回 `is_encrypted=1`，前端会弹出密码框，要求访客输入**笔记密码**（非分享密码）来解密内容。

### 🛡️ 权限与管理 (Admin)
* **管理员识别**: 数据库中 `role='admin'` 或用户名匹配环境变量 `SUPER_USER`。
* **管理功能**: `functions/api/admin.js` 提供了查看用户列表、重置任意用户密码、修改用户细粒度权限（如禁止某人分享）的接口。

## 4. 文件功能映射
* **前端**:
    * `index.html`: 主应用（登录、侧边栏、笔记列表、编辑器、加密弹窗、管理面板）。
    * `view.html`: 独立的轻量级分享查看页（无需登录）。
* **后端 (Functions)**:
    * `functions/api/auth.js`: 处理注册（含邀请码验证）、登录。
    * `functions/api/notes.js`: 笔记 CRUD。处理 `type` 参数 (`all`, `trash`, `folder`, `search`)。
    * `functions/api/folders.js`: 文件夹增删查。
    * `functions/api/share.js`: 公开分享数据的获取接口。
    * `functions/api/admin.js`: 管理员专用接口。
* **配置**:
    * `wrangler.toml`: Cloudflare D1 数据库绑定配置。
    * `schema.sql`: 数据库初始化脚本。

## 5. 当前版本状态 (v2.0 Enhanced)
* ✅ 已实现 Notion 风格的三栏布局 UI。
* ✅ 已实现单笔记独立密码加密功能。
* ✅ 已修复分享页无法查看加密笔记的 Bug。
* ✅ 全局搜索已优化（自动过滤加密内容）。
* ✅ 回收站具备 48 小时自动清理逻辑。