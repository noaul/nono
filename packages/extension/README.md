# NONO 快速收藏插件

Chrome Manifest V3 扩展，用于把当前网页快速保存到自托管的 Nono。

## 功能

- 手动修改书签名称，默认名称会压缩为便于识别的短标题。
- 按“Notab → 文件夹”选择收藏位置，并记住上次使用位置。
- 可调用 Nono 的 LLM 配置分析网页并推荐分类。
- 保存前检查重复链接，保存后可执行链接健康检查。
- 右键菜单快速保存到上次文件夹。
- 支持测试服务连接、Token 状态和文件夹读取权限。

## 构建与打包

在仓库根目录运行：

```bash
npm install
npm run package:extension
```

输出位于：

```text
packages/extension/dist
packages/extension/artifacts/nono-quick-bookmark-chrome-v0.2.2.zip
```

## 安装

### 加载已解压版本

1. 打开 Chrome 扩展管理页 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `packages/extension/dist`。

### 使用打包文件

当前发布包：

```text
packages/extension/artifacts/nono-quick-bookmark-chrome-v0.2.2.zip
```

解压后按“加载已解压版本”的方式安装。

## Chrome Web Store 发布资源

商店图标、截图和宣传图位于 `store-assets/`。这些文件已经按 Chrome Web Store 的尺寸导出为无透明层的 24-bit PNG：

- `webstore-icon-128.png`
- `screenshot-1280x800.png`
- `promo-small-440x280.png`
- `promo-marquee-1400x560.png`

资源清单及生成来源见 `store-assets/README.md`。

## 配置

1. 在 Nono 后台的 Token 页面创建 API Token。
2. 打开插件设置。
3. 填写 Nono 服务地址，例如 `https://noaul.com`。公网地址必须使用 HTTPS；HTTP 仅允许 loopback 本地开发地址。
4. 填写 API Token，并点击“测试连接”。

插件不会把 Token 提交给第三方服务；网页分析与保存请求只发送到配置的 Nono 服务地址。建议为每台设备创建独立、可过期的 Token，停用插件或设备丢失后立即从 Nono 后台撤销。

## 快捷键

- `Alt+Shift+S`：打开 NONO 快速收藏窗口。
- `Alt+Shift+B`：直接保存到上次使用的文件夹。

可在 Chrome 的扩展快捷键页面中修改快捷键。

## 目录

- `manifest.json`：Manifest V3 配置。
- `popup/`：收藏与设置界面。
- `background.js`：右键菜单、快捷键和后台请求。
- `content.js`：读取当前网页信息。
- `shared/`：API 与收藏流程公共逻辑。
- `icons/`：插件图标资源。
- `scripts/build.mjs`：生成 `dist` 目录。
- `scripts/package.mjs`：校验版本并生成 Chrome Web Store ZIP。
- `artifacts/`：当前可发布的 ZIP 构建包。
