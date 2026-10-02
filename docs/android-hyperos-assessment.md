# NoNo 安卓端与小米澎湃 OS 适配评估

评估日期：2026-10-02。场景假设：个人自用，手机连接 nc48 上的 `https://noaul.com`。本次完成代码审查和 Chromium 手机尺寸验证；尚未拿到手机型号、完整系统版本、Android 版本或真机测试结果，不将通用 Android 行为写成已经验证的澎湃 OS 4 行为。

## 建议

先做一个 Kotlin Android 应用外壳，使用同一个 WebView 打开现有 HTTPS 站点，以 NoDesk 为入口，复用五个应用的页面和统一登录。原生层负责返回手势、外部链接、系统分享、文件选择/下载、通知和网络错误恢复。服务端继续负责监控、到期计算、备份和消息生成。

这适合当前 Vue、React/Vite、Next.js 混合的代码结构。应用主要成本在原生能力和真机测试；已有页面不需要重写成同一套框架。若采用 Capacitor，也要先确定远程页面与原生桥的信任边界，并针对它验证登录及 Origin。直接把多个前端打包进 APK 会遇到 Next.js 服务端路由、多个基础路径和跨源请求等问题。

| 方案 | 能复用什么 | 主要限制 | 判断 |
| --- | --- | --- | --- |
| 浏览器快捷方式 / PWA | 现有页面及浏览器登录 | 安装体验依赖浏览器；离线和推送仍需开发 | 适合先体验手机布局 |
| Kotlin WebView 外壳 | 页面、同源 Cookie、现有接口 | 必须补原生桥、通知、文件及生命周期处理 | 自用 Android 首版优先 |
| 原生 / Flutter / React Native 重做界面 | 后端业务和部分接口 | 五个应用的界面要重写，认证接口还需适配 | 等移动工作流稳定后再考虑 |

## 已有基础与实际缺口

- 所有应用在同一 HTTPS 域名下：`/`、`/nodesk`、`/nomoney`、`/yumi`、`/nostar`。使用一个 WebView 能复用域名内 Cookie。
- `nono_session` 为 HttpOnly、Secure、SameSite=Lax，会话最长 14 天。WebView 与外部浏览器的登录存储通常独立，不能承诺“浏览器登录后 APK 自动登录”。
- NoMoney/Yumi 只接受 NoNo 管理员的浏览器会话；会话校验有最长 30 秒缓存。当前 `/api/admin/overview` 和通知渠道管理要求浏览器会话，不能直接换成现有 API Token。
- NoMoney/Yumi 写请求检查 Origin。远程页面同源运行可延续当前设计；`capacitor://localhost` 或 `https://localhost` 页面直接调用服务器，需要明确的移动认证方案，不能靠关闭校验解决。
- 页面已经使用响应式布局、`100dvh` 和部分安全区域样式。360/393 CSS 像素宽度下五个入口均无页面横向溢出；这只证明浏览器布局，不代表软键盘、系统手势、WebView 内核或无障碍大字体均已通过。
- NoDesk 的 manifest 目前 `start_url` 是 `/`，应用名是 NoDesk，入口实际会到 NoNo 首页；没有检索到业务 Service Worker / 离线队列。现状不足以作为完整离线 PWA。
- NoDesk 任务和日程使用浏览器 localStorage。桌面浏览器、手机浏览器、APK 中的数据不会因此自动同步，重新安装后的保留策略也需要单独设计。
- 通知中心已有邮件、Telegram、Bark、Webhook，尚无 Android 设备注册、推送 token、注销解绑或通知深链。生产当前无已配置渠道，未测试外部消息送达。

## 难点排序

### 1. 后台通知可靠性：高

Android Doze 会限制网络、普通闹钟和后台任务，网页定时器、WebSocket、WorkManager 轮询均不能保证熄屏后及时送达。应让 nc48 生成提醒，交给系统支持的推送通道；APP 打开时补拉通知列表，处理遗漏和重复。

针对小米设备优先评估小米推送，核实当前开发者账号、应用包名、签名、消息分类及平台接入条件。其他品牌再决定是否补厂商通道或 FCM。国行设备不能预设 Google 服务和 FCM 网络总是可用。个人侧载 APK 是否满足所需推送能力，要以当前控制台资格和真机结果为准。

需要增加：设备与账户绑定、token 更新、服务端推送适配器、退出解绑、通知点击路由、Android 通知权限及渠道设置。锁屏默认仅显示必要摘要，点击后再校验会话读取资产信息。未登录时保存目标路径，登录后返回。普通应用无法保证用户“强行停止”后仍持续收信；该状态应与一般清后台分别测试。

澎湃系统的自启动、耗电管理、锁屏展示设置需要在目标手机确认。不能用“设为无限制”代替推送设计。现有 Bark 集成不能直接等同于 Android 系统推送；若使用兼容 Android 接收端，必须单独确认其协议、后台实现及可靠性。

### 2. 登录与 Passkey：中到高

账号密码登录可以复用同源页面。Passkey 在 Android WebView 中需要配套 Credential Manager / AndroidX WebKit 能力、站点关联及实际凭据提供器支持，不能假设 WebView 自动拥有浏览器相同的能力。当前 Google 官方集成示例包含 Play Services 相关依赖，国行环境尤其需要验证。

首版保留密码登录兜底。支持任意自建域名会增加 App Links、Digital Asset Links、Cookie、证书和 Passkey 关联配置的工作量；固定 `noaul.com` 更适合先验证。

### 3. 系统交互：中

- 返回键优先关闭弹窗、再回退网页历史，最后才退出；匹配预测性返回的目标 SDK 要求。
- 处理软键盘遮挡、边到边布局、横屏、大字体、状态栏和底部手势区。360 宽度的底部栏有八个入口，正式 APP 应检查触控尺寸。
- 接收系统分享链接并进入添加书签流程；处理同一 Intent 重放和未登录情况。
- 文件上传、备份下载、blob 下载、剪贴板、`target=_blank`、外部浏览器跳转需要原生处理。
- 原生桥仅向明确允许的站点开放，外部网页交给系统浏览器；桥调用校验来源、参数和用户手势。
- 网络切换、证书错误、服务器维护、WebView 被回收后显示可恢复的错误页面。

### 4. 离线及跨设备同步：高，建议后置

“没有网络时仍能记账”需要本地数据库、待提交队列、幂等请求、冲突处理、账户隔离及恢复同步。当前接口与 localStorage 不具备这些完整语义。不能简单缓存财务接口就宣称离线可用。首版可做离线提示与只读缓存，离线编辑另设阶段。

### 5. 安装与更新：中

个人使用可从签名 APK 起步，固定包名并妥善保管签名密钥。小米系统的安装验证和后台设置需要真机操作验证。上架应用商店还要考虑隐私说明、SDK 披露、账号与分发要求；成本与个人侧载不同。

## 建议实施顺序与验收

1. **在线首版**：同源 WebView、登录、五个入口、返回/分享/下载、网络错误页面。先在目标小米手机跑通。
2. **可靠通知**：小米通道接入可行性确认后，完成设备绑定和服务端推送；覆盖前台、后台、熄屏、普通清后台、省电模式、重启及 Wi-Fi/移动网络切换。记录实际延迟、重复和漏收，不仅做“发送一次成功”。
3. **进阶能力**：Passkey、桌面小组件、跨设备任务/日程同步；有明确需求后再做离线写入。

真实手机验收还应包括通知权限被拒、权限恢复、会话过期、退出解绑、切换账号、恶意分享链接、证书异常及数据迁移。先记录完整 ROM/Android/WebView 版本和国行/国际版环境，再确定最低版本和 targetSdk；不要由“澎湃 OS 4”名称推断唯一 Android 版本。

## 查阅依据

2026-10-02 已访问以下官方页面：

- [Android Doze 与 App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- [Android 通知运行时权限](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [WebView 与 Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-webview)
- [Android App Links 验证](https://developer.android.com/training/app-links/verify-android-applinks)
- [管理 WebView](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview)
- [小米澎湃 OS 开发者平台](https://dev.mi.com/xiaomihyperos)

小米平台首页可以访问，推送文档入口需要客户端加载，未据此声称已核实推送准入条款或 OS 4 特定行为。相关条件应在正式接入前通过控制台和目标手机确认。
