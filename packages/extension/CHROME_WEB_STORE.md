# Chrome Web Store submission

## Listing

**Extension name**

```text
NoNo Smart Bookmark
```

**Chinese name**

```text
NoNo 智能收藏
```

**Summary**

```text
把当前网页保存、归类或更新到自托管的 NoNo，支持 AI 整理、重复检测、右键菜单和快捷键。
```

**Detailed description**

```text
NoNo Smart Bookmark 是自托管个人数字工作台 NoNo 的浏览器扩展。

你可以把当前网页一键保存到自己的 NoNo，按 NoTab 和文件夹归类，修改书签名称与描述，并在保存前检测重复链接。遇到重复链接时，可以直接更新已有收藏，也可以明确选择另存一份。

如果你的 NoNo 已配置大模型服务，还可以主动点击“AI 整理”，让 NoNo 建议更简洁的名称、描述和保存位置。

主要功能：
- 弹窗快速收藏当前网页
- NoTab 与文件夹选择
- 重复链接检测与已有记录更新
- AI 名称、描述和文件夹建议
- 右键菜单与键盘快捷键
- 中英文界面
- 自托管服务地址与专用 API Token

扩展不包含广告、分析 SDK 或远程代码。网页信息只在你主动发起收藏时读取，并只发送到你配置的 NoNo 服务。
```

**Category**

```text
Productivity
```

**Language**

```text
Chinese (Simplified), English
```

**Homepage URL**

```text
https://github.com/noaul/nono
```

**Support URL**

```text
https://github.com/noaul/nono/issues
```

**Privacy policy URL**

```text
https://noaul.com/privacy
```

## Single Purpose

```text
Save and organize the current page in the user's self-hosted NoNo bookmark service.
```

## Permission Justifications

**activeTab**

```text
Used only after the user clicks the extension or invokes a save command, so the extension can read the current page URL and metadata for the bookmark being created.
```

**scripting**

```text
Injects the packaged local metadata extractor into the active tab only after a user-initiated save. The extension does not register an always-on content script.
```

**storage**

```text
Stores the user-configured NoNo server URL, API token, UI language, and last selected folder in Chrome extension local storage.
```

**contextMenus**

```text
Adds user-invoked menu commands for saving to the last folder or opening the full quick-save popup.
```

**Optional host access**

```text
Requested only for the exact self-hosted NoNo origin entered by the user, so the extension can call that server's authenticated API. When the configured server changes, the previous origin permission is removed.
```

## Privacy Disclosure

Declare these handled data types:

- `Web history`: current page URL and domain, only after a user-initiated save.
- `Website content`: page title, meta/Open Graph fields, and up to 500 characters of page text.
- `Authentication information`: the NoNo API Token stored locally and sent only to the configured NoNo service.

Recommended certifications:

- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to the extension's single purpose.
- Data is not used for creditworthiness or lending.
- No remote code is used.
- Human access is not performed by the extension developer; handling by a self-hosted administrator or user-configured model provider is controlled by that user.

## Upload Files

**Package**

```text
packages/extension/artifacts/nono-quick-bookmark-chrome-v0.4.0.zip
```

**Store icon**

```text
packages/extension/store-assets/webstore-icon-128.png
```

**Screenshot**

```text
packages/extension/store-assets/screenshot-1280x800.png
```

**Small promotional tile**

```text
packages/extension/store-assets/promo-small-440x280.png
```

**Marquee promotional tile**

```text
packages/extension/store-assets/promo-marquee-1400x560.png
```

## Release Notes

```text
Version 0.4.0 adds a clip mode: the popup, the page and selection context menus, and Alt+Shift+C extract the main article as HTML and Markdown and save it to the Clipper module of your own Nono server. Extraction runs only when you ask for it, and content is still sent solely to the server you configured. Version 0.3.1 refined the HyperOS-inspired popup with a rounded clipped window, a white translucent frosted background, and a compact single-screen layout that removes internal scrolling while keeping quick save, duplicate handling, project links, and version details immediately accessible.
```
