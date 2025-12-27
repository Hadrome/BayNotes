
# BayNotes 🌊

**BayNotes** 是一个轻量级、企业级的云笔记应用，采用现代化的无服务器架构构建。拥有 Notion 风格的优雅界面，支持多级文件夹、Markdown 实时预览、端到端加密以及强大的分享功能。

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

## ✨ 核心功能

* **📝 现代化编辑器**：支持 Markdown 语法，Notion 风格的三栏布局（侧边栏-列表-编辑器）。
* **🔒 安全加密**：支持**单笔记独立密码加密**，内容在数据库中以 AES 密文存储，确保隐私安全。
* **📂 文件夹管理**：支持创建文件夹（支持二级目录），轻松归档整理。
* **🔗 灵活分享**：
    * 生成外部访问链接。
    * 支持**阅后即焚**。
    * 支持设置**访问密码**和**有效期**。
* **🗑️ 回收站**：误删笔记保护，支持 48 小时内恢复（软删除）。
* **🔍 全局搜索**：快速检索笔记标题和内容。
* **🛡️ 后台管理**：管理员面板支持用户管理、权限配置（禁用删除/分享等）及密码重置。

## 🛠️ 技术栈

* **前端**：HTML5, Vue.js 3 (CDN), Tailwind CSS, Phosphor Icons, Marked.js, Crypto-js。
* **后端**：Cloudflare Pages Functions (Serverless API)。
* **数据库**：Cloudflare D1 (SQLite)。
* **部署**：GitHub (代码托管) + Cloudflare Pages (自动构建)。

## 🚀 快速部署

### 1. 准备工作
确保你拥有一个 Cloudflare 账号，并安装了 `wrangler` CLI 工具。

### 2. 初始化数据库 (D1)
在 Cloudflare 控制台或终端创建一个 D1 数据库：
```bash
npx wrangler d1 create baynotes-db
