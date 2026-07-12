# 剩余优化计划（2026-07-12 整理）

基于原 `frontend-optimization-plan.md` 评审，以下为**已完成**与**未完成**的对账。

## 已完成（main 分支，按 commit）

| Commit | 内容 |
|---|---|
| `0987573` | 弹窗 Esc/焦点圈定/滚动锁；tabs 吸顶 + Scrollspy；搜索防抖 + `/` 快捷键 |
| `16a7d4a` | Favicon 服务端代理（`/api/favicon`，内存缓存 + SSRF 校验）；AdminLayout 减法（删 control-strip/命令卡，头像菜单，operator 压缩行） |
| `57006ec` | accent 三种绿收敛为 token 家族；`!important` 清理；reduced-motion 块合并 |
| `5cf2b6f` | 搜索引擎切换下拉（localStorage 持久化）；`<mark>` 高亮；0 结果外搜 CTA；tabs 药丸滑块；FolderCard 弹性高度 + "+N 更多" |
| `5b73049` | 导航数据 stale-while-revalidate 缓存；favicon 首字母渐变徽章 fallback；text-shadow 仅背景图启用；portal 移动端流式 |

另：styles.css 拆分（tokens/base/public/admin）已由更早的重构完成；圆角收敛被运行时外观变量体系（`--public-*-radius`）取代，不再单做。

## 未完成

### A. 纯重构（功能已具备，改善可维护性）
1. **弹窗组件抽离**：`FolderExpandModal.vue` / `FolderUnlockModal.vue` 从 NavigationPage 拆出（约 -300 行）；可顺带评估换原生 `<dialog>`。
2. **大视图拆分**：`SiteConfigView`（600+ 行）、`LinksView`（400+ 行）按功能区拆子组件。

### B. 小改进
3. **Favicon 代理缓存持久化**：目前内存缓存重启即失，可落盘或进 DB（`packages/server/src/routes/favicon.ts`）。
4. **空态插画统一**：公开页空态与后台 `EmptyState` 共用一套轻量 SVG。
5. **后台移动端复查**：侧边栏抽屉化、窄屏表格滚动体验。

### C. 工程化（长期健康）
6. **Playwright E2E + 截图回归**：公开页浏览/搜索、解锁弹窗、后台登录 2~3 条关键路径。
7. **Lighthouse / WebPageTest 基线**：记录 LCP、CLS、bundle 体积，此后每轮改动对照。
8. **路由级代码分割确认**：admin 视图应全部 lazy import（router 里核对）。

### 建议顺序
A1（弹窗抽离，小而快）→ C8（分割确认，几分钟）→ B3 → C6/C7 → A2 → B4/B5。
