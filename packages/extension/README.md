# NoNo Smart Bookmark

NoNo Smart Bookmark 是 [NoNo](https://github.com/noaul/nono) 的 Chrome Manifest V3 扩展。它把用户主动选择的当前网页保存到自托管 NoNo，并提供分类、重复处理和 AI 整理能力。

当前版本：`0.4.0`

## 功能

- 读取当前网页标题、URL、描述、Open Graph 信息和最多 500 个字符的正文摘要。
- 按 `NoTab -> 文件夹` 选择收藏位置，并记住最近使用的文件夹。
- 自动压缩冗长网页标题，也可在保存前手动修改名称和描述。
- 检测重复 URL，可更新已有收藏或明确选择另存一份。
- 调用用户在 NoNo 中配置的模型进行标题、描述和文件夹建议。
- 通过弹窗、右键菜单和快捷键快速收藏。
- 中英文界面、连接测试、Token 到期提示、空文件夹和请求超时状态。
- 弹窗内提供 GitHub 仓库、Issue 反馈入口和当前插件版本。
- `0.4.0` 新增剪藏模式：可将整页正文或选区提取为 HTML 与 Markdown，保存到 Nono 的 Clipper 模块。
- `0.3.1` 将弹窗压缩为 600px 内完整显示的单页布局，并增加圆角裁切与白色半透明磨砂外层。

## 隐私与权限

扩展不使用分析 SDK、广告 SDK、远程脚本或第三方运行时服务。网页内容只在用户点击扩展、使用快捷键或右键菜单发起收藏时处理。

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 仅在用户主动操作后访问当前标签页。 |
| `scripting` | 按需注入扩展包内的本地提取脚本；不再向所有网页常驻注入。 |
| `storage` | 在 Chrome 本地保存 NoNo 地址、API Token、界面语言和最近文件夹。 |
| `contextMenus` | 提供“保存到上次文件夹”和“打开快速收藏”右键菜单。 |
| 可选主机权限 | 用户保存配置时，仅授权所填写的 NoNo 服务来源；切换服务后移除旧来源权限。 |

插件只向用户配置的 NoNo 服务发送收藏所需信息。只有用户主动点击“AI 整理”时，NoNo 服务才可能把相关网页信息转发给用户自行配置的模型服务商。

公开隐私政策由每个 NoNo 部署在 `/privacy` 提供，例如：

```text
https://your-nono-domain.example/privacy
```

## 配置

1. 在 NoNo 后台创建一个专用于插件、具有有效期的 API Token。
2. 打开插件设置，填写 NoNo 服务地址。
3. 公网地址必须使用 HTTPS；本地开发可使用 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]`。
4. 填写 Token，点击“测试连接”或“保存并开始”。
5. Chrome 会请求访问该 NoNo 服务来源；扩展不会申请其他站点的后台访问权限。

Token 保存在 `chrome.storage.local`。停用设备或卸载插件前，建议在 NoNo 后台撤销对应 Token。

## 快捷键

- `Alt+Shift+S`：打开快速收藏弹窗。
- `Alt+Shift+B`：直接保存到最近使用的文件夹。
- `Alt+Shift+C`：剪藏当前页面正文。

可在 `chrome://extensions/shortcuts` 修改快捷键。

## 本地开发

在仓库根目录运行：

```bash
npm ci
npm test -w packages/extension
npm run package:extension
```

输出目录：

```text
packages/extension/dist/
packages/extension/artifacts/nono-quick-bookmark-chrome-v0.4.0/
packages/extension/artifacts/nono-quick-bookmark-chrome-v0.4.0.zip
```

在 `chrome://extensions/` 开启开发者模式，选择“加载已解压的扩展程序”，然后加载 `packages/extension/dist`。

## Chrome Web Store

商店素材位于 `store-assets/`：

- `webstore-icon-128.png`
- `screenshot-1280x800.png`
- `promo-small-440x280.png`
- `promo-marquee-1400x560.png`

可直接填写的商店文案、权限理由和数据披露见 [CHROME_WEB_STORE.md](CHROME_WEB_STORE.md)。发布包由 `scripts/package.mjs` 生成，并校验 Manifest、版本和 ZIP 可重复构建。

## 项目结构

- `manifest.json`：Manifest V3、权限、命令和 GitHub 首页信息。
- `popup/`：雾面玻璃收藏与连接界面。
- `background.js`：右键菜单、快捷键和后台快速收藏。
- `content.js`：仅在主动收藏时注入的网页信息提取器。
- `shared/`：URL 校验、权限来源、重复检测、数据载荷和双语文案。
- `test/`：功能、权限和发布包回归测试。
- `store-assets/`：Chrome Web Store 图片及渲染源。

## 反馈与贡献

- 仓库：https://github.com/noaul/nono
- Issues：https://github.com/noaul/nono/issues

安全问题不要在公开 Issue 中粘贴 Token、网页内容或用户数据。应先撤销相关 Token，再通过仓库维护者提供的私有渠道提交脱敏信息。
