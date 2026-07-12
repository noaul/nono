# 剩余优化计划（2026-07-12 更新）

基于原 `frontend-optimization-plan.md` 评审的对账清单。

## 已完成（main 分支，按 commit）

| Commit | 内容 |
|---|---|
| `0987573` | 弹窗 Esc/焦点圈定/滚动锁；tabs 吸顶 + Scrollspy；搜索防抖 + `/` 快捷键 |
| `16a7d4a` | Favicon 服务端代理（`/api/favicon`，缓存 + SSRF 校验）；AdminLayout 减法 |
| `57006ec` | accent 三种绿收敛为 token 家族；`!important` 清理；reduced-motion 块合并 |
| `5cf2b6f` | 搜索引擎切换下拉；`<mark>` 高亮；0 结果外搜 CTA；tabs 药丸滑块；FolderCard 弹性高度 + "+N 更多" |
| `5b73049` | 导航数据 SWR 缓存；favicon 首字母渐变徽章；text-shadow 条件化；portal 移动端流式 |
| （本次） | 弹窗抽离为 `FolderExpandModal` / `FolderUnlockModal`；tabs 溢出渐隐 mask；全局 `:focus-visible` 焦点环；favicon 代理磁盘缓存（`NONO_FAVICON_CACHE_DIR`）；EmptyState SVG 插画 + Users/Tokens 空态；`AppearanceEditor` 从 SiteConfigView 拆出；`LinkDuplicatePanel` / `LinkHealthPanel` 从 LinksView 拆出 |

另：styles.css 拆分与圆角收敛由运行时外观变量体系覆盖；admin 路由已确认全部 lazy import。

## 未完成（需要真实浏览器环境，本轮无法在当前环境执行）

1. **Playwright E2E + 截图回归**：需 `npm i -D @playwright/test && npx playwright install`（下载浏览器二进制），建议覆盖三条路径：公开页浏览/搜索、锁定文件夹解锁、后台登录改配置。
2. **Lighthouse / WebPageTest 基线**：跑起 dev/prod 服务后用 Chrome DevTools 或 CI（如 lighthouse-ci）记录 LCP、CLS、bundle 体积。

## 可选的后续想法（非原计划承诺项）

- 原生 `<dialog>` 替换手写 focus trap（当前实现功能等价）
- 弹窗切换动画统一为 spring token
- favicon 磁盘缓存的 LRU 清理（当前只有 TTL）
