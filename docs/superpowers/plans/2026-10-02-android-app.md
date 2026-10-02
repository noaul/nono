# NoNo Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可在目标小米澎湃 OS 4 手机上日常使用的 NoNo APK，逐步完成在线访问、系统分享、文件操作和可靠通知。

**Architecture:** Kotlin 单 Activity + 单 WebView 复用 nc48 上现有同源页面。Android 承担系统交互，Web 与后端保留业务逻辑和登录。推送增加设备绑定和持久化发送队列，不把后台监控移到手机。

**Tech Stack:** Kotlin、AndroidX Activity/WebKit、少量 Compose 原生状态页面、DataStore、Android Keystore、小米推送 SDK；现有 Vue/React/Next.js、Fastify、Prisma/PostgreSQL 和 NoMoney/Yumi SQLite。

**Spec:** [Android 设计草案](../specs/2026-10-02-android-app-design.md)。

**进度（2026-10-02）：** v0.1 已在 `apps/android` 实现：单 WebView 外壳、导航边界、返回、系统栏/键盘、错误页、渲染进程重建、文件选择、站内直接下载、分享预填书签页；单元与 Robolectric 测试 13 项通过，签名 release APK 已构建。工具链锁定为 JDK 17、Gradle 8.14.5、AGP 8.13.2、Kotlin 2.2.21、compile/target SDK 36、minSdk 29。尚未在小米真机验证（Task 0），Task 2/3 的消息桥、Task 4 的幂等接口、Task 5～9 未开始。其余新增文件、接口和类型仍为计划内容。

## Global Constraints

- 生产站点固定为 `https://noaul.com`；调试服务地址仅可通过 debug 构建配置提供。
- 登录复用 NoNo 浏览器会话；保持 HttpOnly、Secure、SameSite、Origin 校验和现有权限边界。
- APK 不携带管理员密码、NoNo 内部调用令牌、小米服务端推送密钥或签名私钥。
- WebView 只承载受信任站点；原生消息桥仅允许精确来源、主框架及列举的消息类型。
- 普通业务数据仍以服务器为准；v0.1/v0.2 不提供离线编辑或自动提交财务操作。
- 小米推送资格、完整 ROM/Android/WebView 版本和签名包名必须在推送正式开发前验证。
- 所有移动功能新增数据库迁移采用加法迁移；生产发布沿用现有备份、维护、验收流程。
- 通知日志区分排队、厂商受理、终端回执和用户打开；无回执时终端送达为未知。
- 账号退出/撤销后禁止新推送投递；已交给厂商的在途消息不能承诺撤回。
- 支持版本、依赖及 targetSdk 在任务 0 按当时稳定工具链锁定，不由“澎湃 OS 4”名称推断 Android API 等级。

## 1. 版本、工作量与依赖

按一位熟悉现有项目的开发者估算，不包括推送平台审核等待，也不保证特定日期；获得真机与账号资料后再校准。

| 阶段 | 任务 | 产物 | 预计工作量 | 完成标准 |
| --- | --- | --- | --- | --- |
| P0 可行性与版本锁定 | 0 | 真机环境记录、小米通道验证、工具链清单 | 1～2 人日，平台等待另计 | 明确可用 SDK、签名及推送接入条件 |
| P1 在线首版 v0.1 | 1～3 | 能安装、登录、访问五个应用的 APK | 3～5 人日 | 目标手机关键浏览/编辑流程通过 |
| P2 手机常用操作 | 4～5 | 分享收藏、文件上传/下载、移动页面修整 | 4～6 人日 | 系统分享与真实文件操作闭环 |
| P3 可靠通知 | 6～8 | 设备管理、发送队列、小米推送与通知跳转 | 5～8 人日 | 熄屏、重启、失败重试和退出解绑验证 |
| P4 v0.2 稳定发布 | 9 | 签名 APK、校验值、变更说明、真机报告 | 3～5 人日，含观察 | 至少 48 小时日常使用，无阻断问题 |

预计在线首版约 1 周；含可靠通知的稳定自用版约 4～6 周。小米接入不具备条件时仍可交付 v0.1，并明确其不包含系统推送；不能将定时轮询作为等价替代。

执行顺序：`0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9`。推送资格验证可在等待资料时继续推进不依赖它的在线页面工作。

每个代码任务按“失败用例 → 最小实现 → 对应用例通过 → 相关回归 → 独立提交”执行；环境记录、文档和签名配置不写只复述配置值的测试。

## 2. 第一版的用户体验

- 安装后的应用名建议为 **NoNo**，启动打开 NoDesk，服务器地址无需每次填写。
- 一次登录访问收藏、NoMoney、Yumi、NoStar。后台角色限制保持不变，普通用户看见明确的权限说明。
- 网页负责唯一的一套导航。手机模式将常用入口整理为“今日、收藏、应用、更多”，通知在明显入口打开；桌面网页继续保留现有布局。
- 返回优先关闭当前弹层；根页面按 Android 通常行为退出。刷新只刷新读取，不自动再次提交表单。
- 从浏览器/聊天应用分享网址到 NoNo，编辑标题、选择文件夹并确认保存。页面显示保存结果，可返回来源应用。
- 首版可在无网络时展示错误、重试和保留待收藏内容。记账、续费等写操作只在在线且用户确认时提交。
- 通知按告警、到期提醒、普通消息建立 Android 通知渠道；首次使用对应功能时解释并请求权限。

## 3. 文件与职责

Android 使用一个 `app` 模块，先按包隔离职责，避免为首版引入大量 Gradle 模块。

| 计划路径 | 职责 |
| --- | --- |
| `apps/android/settings.gradle.kts`、`build.gradle.kts`、`gradle/libs.versions.toml` | 固定工具链、依赖和仓库 |
| `apps/android/app/build.gradle.kts`、`src/main/AndroidManifest.xml` | 构建变体、签名引用、入口和权限 |
| `apps/android/app/src/main/java/com/noaul/nono/MainActivity.kt` | 生命周期及页面容器 |
| 同目录 `web/` | WebView 配置、导航、消息桥、历史恢复 |
| 同目录 `capture/` | 分享内容解析、暂存和确认 |
| 同目录 `files/` | 系统选择器、受限下载和取消 |
| 同目录 `push/` | 小米 SDK 接收、权限、渠道和通知点击 |
| 同目录 `session/` | 绑定状态、退出流程、本机清理 |
| `packages/web/src/views/mobile/` | 设备绑定、分享收藏和原生设置承接页面 |
| `packages/web/src/mobile/bridge.ts` | 版本化消息协议封装 |
| `packages/server/src/routes/mobile/` | 会话授权的设备和收藏入口 |
| `packages/server/src/services/mobile-*.ts` | 设备绑定、持久化队列、推送适配 |
| `packages/server/test/mobile-*.test.ts` | 权限、撤销、去重、重试集成测试 |
| `docs/quality/android/` | 真机版本、用例结果、延迟记录、发布说明 |

`com.noaul.nono` 是建议包名，任务 0 核实可用并锁定；小米控制台、签名、App Links 统一使用同一最终值。

## 4. 接口契约

新增服务端接口延续 `{code,data,message}` 响应结构。除仅撤销设备接口外，均要求有效 NoNo 浏览器会话及同源写请求；不放宽现有 API Token 权限。

| 方法与路径 | 输入 / 输出 | 边界 |
| --- | --- | --- |
| `POST /api/mobile/devices` | `installationId, provider:'xiaomi', registrationId, appVersion` → `deviceId, revokeToken, sessionExpiresAt` | userId/sessionId 来自服务端会话；令牌仅在创建或轮换时返回 |
| `GET /api/mobile/devices` | 当前用户的设备、启用状态、最后注册时间、会话到期时间 | 不返回厂商 token 或撤销凭据 |
| `DELETE /api/mobile/devices/:id` | 删除自己的绑定 | 他人设备返回 404；幂等清理 |
| `POST /api/mobile/devices/revoke` | `deviceId, revokeToken` → `ok` | 只能禁用对应设备；凭据哈希比对、限流、不记录明文 |
| `POST /api/mobile/bookmarks` | `requestId, folderId, name, url, description` → 已保存书签 | `(userId,requestId)` 幂等；相同 ID 不同内容返回 409 |
| `GET /api/mobile/notifications/:eventId` | 当前用户可读的事件摘要和站内目标 | 登录、归属、有效期检查；被删事件返回 404 |
| `POST /api/mobile/notifications/:eventId/opened` | `deviceId` → `ok` | 验证设备归属、幂等记录；不能伪造送达回执 |

计划共享类型：

```ts
export type MobileSource = 'nodesk' | 'nomoney' | 'yumi' | 'nostar' | 'links' | 'backup';
export type MobileEvent = {
  eventId: string;
  userId: number;
  source: MobileSource;
  severity: 'info' | 'warning' | 'critical';
  targetPath: string;
  occurredAt: Date;
  expiresAt: Date;
};
export type PushEnvelope = {
  eventId: string;
  title: 'NoNo';
  body: '有一条新的提醒，点击查看';
  targetPath: string;
  expiresAt: Date;
};
export type PushResult =
  | { status: 'accepted'; providerMessageId: string }
  | { status: 'retryable'; code: string }
  | { status: 'invalid-token' | 'configuration-error'; code: string };
export interface MobilePushProvider {
  send(registrationId: string, message: PushEnvelope): Promise<PushResult>;
}
```

`targetPath` 为服务端生成的站内路径；通知 SDK 或 Intent 中带来的任意 URL 不直接进入 WebView。外部业务链接在用户查看详情后交给系统浏览器。

## Task 0：验证目标手机、工具链及推送条件

**Files:** Create `docs/quality/android/device-matrix.md`、`docs/quality/android/toolchain.md`、`docs/quality/android/xiaomi-push-probe.md`。

**Interfaces:** 输入为目标手机和开发者控制台；输出为确定的 packageId、签名指纹、SDK 版本、minSdk/compileSdk/targetSdk、推送可接入结论。

- [ ] 记录手机型号、完整 ROM、Android API、WebView 包及版本、国行/国际版、Google 服务情况和常用输入法。用户尚未提供的设备不能被写成已测试。
- [ ] 连接实际设备后运行下列读取命令，按需删除设备序列号再保存报告：

```bash
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell dumpsys webviewupdate
```

- [ ] 锁定兼容的稳定 JDK/Gradle/AGP/Kotlin/AndroidX 组合，默认支持 Android 10/API 29 起；若目标手机需要更低版本，则在生成项目之前修改支持范围。compileSdk/targetSdk 采用当时稳定版本并记录具体数字。
- [ ] 核实小米开发者身份、该应用类型是否可开通推送、侧载分发要求、包名和签名要求、地域/服务端入口、消息分类、SDK 数据收集说明。
- [ ] 用官方最小示例在本人测试设备上验证 token 获取和一条通用测试消息，覆盖前台与熄屏；不向真实第三方用户发送消息。
- [ ] 若接入受限，记录具体原因和恢复条件，继续 P1/P2；P3 不实施未经验证的替代厂商协议。
- [ ] 将报告作为一次独立提交；后续任务直接使用此处已锁定的版本。

## Task 1：可构建的 Android 外壳与导航边界

**Files:** Create Android Gradle 文件、`apps/android/app/src/main/java/com/noaul/nono/MainActivity.kt`、同源代码目录的 `web/NonoWebView.kt`、`web/NavigationPolicy.kt`；Test `apps/android/app/src/test/java/com/noaul/nono/web/NavigationPolicyTest.kt`。后续 Android 文件名均相对此主源码包；普通单元测试放对应 `src/test` 包，设备测试放 `src/androidTest` 包。

**Interfaces:** `NavigationPolicy.isInternal(raw: String): Boolean`；内部页在当前 WebView 打开，外部 HTTPS 链接交给系统浏览器，危险 scheme 拒绝。

- [ ] 为导航策略写以下最小失败用例，再补实现；额外测试显式 443 端口、畸形 URL 和编码输入。

```kotlin
@Test fun trustedOriginIsExact() {
    assertTrue(NavigationPolicy.isInternal("https://noaul.com/nodesk"))
    assertFalse(NavigationPolicy.isInternal("http://noaul.com/nodesk"))
    assertFalse(NavigationPolicy.isInternal("https://noaul.com.evil.example/"))
    assertFalse(NavigationPolicy.isInternal("https://noaul.com@evil.example/"))
    assertFalse(NavigationPolicy.isInternal("javascript:alert(1)"))
}
```

```kotlin
object NavigationPolicy {
    fun isInternal(raw: String): Boolean = runCatching {
        val uri = java.net.URI(raw)
        uri.scheme.equals("https", true) &&
            uri.host.equals("noaul.com", true) &&
            uri.userInfo == null && (uri.port == -1 || uri.port == 443)
    }.getOrDefault(false)
}
```

- [ ] 创建应用入口、启动图标、debug/release 变体；JavaScript 和 DOM storage 仅为本站启用，禁用混合内容、文件 URL 特权和 release WebView 调试。证书错误直接取消并显示恢复说明。
- [ ] 支持 `target=_blank` 和新窗口回调，并复用同一导航策略；不创建可加载外部站点且带桥权限的第二个 WebView。
- [ ] 实现首次载入、载入失败、服务器维护 503、点击重试；仅主框架失败才替换整页。
- [ ] 执行 `cd apps/android && ./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug`，在目标手机安装并打开 `/nodesk`。
- [ ] 独立提交：`feat(android): add trusted single-webview shell`。

**验收：** 可安装，首页打开，外链走浏览器，HTTP/证书错误不被绕过，release 包中没有调试和秘密配置。

## Task 2：会话复用、页面恢复和退出

**Files:** Create `session/SessionCoordinator.kt`、`session/SessionCoordinatorTest.kt`、`web/WebStateStore.kt`；Modify `packages/web/src/router/index.ts`、`packages/web/src/views/LoginView.vue`；Test `packages/web/test/mobile-login-return.test.ts`。

**Interfaces:** `SessionCoordinator.signOut()` 触发在线注销或离线本机清理；站内安全返回路径通过现有 `next` 参数传递，外站/协议相对路径回到 `/nodesk`。

- [ ] 为“登录后回到原路径”“`next=//evil.example` 被拒绝”“无权限返回明确说明”写失败用例。实际浏览器测试如下：

```ts
const testUser = { username: 'android-e2e', password: 'AndroidE2e2026!' };
await page.goto('/login?next=%2Fnomoney%2Fdashboard');
await page.getByLabel('用户名').fill(testUser.username);
await page.getByLabel('密码').fill(testUser.password);
await page.getByRole('button', { name: '登录', exact: true }).click();
await expect(page).toHaveURL(/\/nomoney\/dashboard$/);
```

测试账号由隔离测试环境预置，不使用生产账户密码；实现时根据已有登录页面实际无障碍名称统一 selector。

- [ ] 复用 WebView CookieManager 的持久化存储，flush 在登录状态变化后执行；不把 Cookie 拷贝到 JavaScript、localStorage 或 APK 固定配置。
- [ ] 只保存安全 URL 和必要 UI 状态，进程重启恢复 GET 页面；服务端会话失效时重新登录，不重放 POST。忽略自动恢复的敏感表单内容。
- [ ] 实现退出前对本机未同步任务/日程将被清理的提示，并允许取消退出；导出选项在 Task 5 文件功能可用后接入。在线先注销，再清理 WebView Cookie、站点存储、待分享和页面历史；离线清理与提示规则相同，设备远端撤销在 Task 6 接入。
- [ ] 真实检查一次登录跨五个入口、强制结束进程后重开、服务端撤销会话、密码修改、退出后后退按钮。保留 NoMoney/Yumi 当前最长 30 秒缓存边界。
- [ ] 运行上述 Web 测试、现有账户安全测试及 Android 会话测试，独立提交：`feat(android): reuse NoNo sessions and restore safe routes`。

**验收：** 不重复要求五套登录；会话到期可恢复原任务；退出后不会露出前一账户的页面和本机数据。

## Task 3：返回手势、键盘和页面适配

**Files:** Create `web/BackCoordinator.kt`、`web/NonoMessageBridge.kt`、`packages/web/src/mobile/bridge.ts`、`apps/blog/src/lib/mobile-bridge.ts`、`apps/nomoney/frontend/src/mobile-bridge.ts`、`apps/nostar/src/services/mobileBridge.ts`；Modify `apps/blog/src/app/(home)/ambient-workbench.tsx`、`apps/blog/src/styles/ambient-workbench.css`、`apps/nomoney/frontend/src/App.tsx`、`apps/nomoney/frontend/src/styles.css`、`apps/nostar/src/App.tsx`、必要的现有弹窗组件；Create `tests/e2e/mobile-shell.spec.ts`。各前端适配文件只封装同一协议及自身路由/弹层状态，协议契约集中记录并用同一组输入验证，避免四套不兼容命名。

**Interfaces:** 消息结构 `{v:1,requestId,type,payload}`；`ui.backState` 的 payload 为 `{canHandle:boolean}`，Android 在手势提交后发送 `ui.back`，页面用相同 requestId 回复 `{handled:boolean}`，处理成功后不再执行 WebView 后退。最大等待 500ms，迟到回复丢弃；超时释放操作状态，该手势不再追加历史回退，避免页面已处理但回复迟到时后退两次。明确回复 `handled:false` 才走一次历史回退。

- [ ] 消息桥测试拒绝外域、子框架、未知类型、超长消息及过期 requestId；只有能力协商成功时启用移动外壳行为。
- [ ] 按精确 allowlist 使用 WebViewCompat 消息能力，运行时检查支持状态。不支持消息桥的 WebView 提示升级并降级为普通网页访问，不启用不校验来源的桥。
- [ ] 用 `OnBackPressedDispatcher` / 对应稳定版本 AndroidX 的预测性返回 API 接入：弹层 → SPA 路由 → WebView 历史 → 根入口退出。处理网页响应超时，避免一次返回执行两次。
- [ ] 安全区由单一层消费，避免原生 insets 和网页 padding 重复；键盘弹出后滚动到输入框，底栏避免遮住确认按钮。
- [ ] 手机模式收敛底部入口，主要控件触控区域至少 48dp；检查 320/360/393/412 CSS 宽度和横屏、字体 1.0/1.3/1.5 倍、深浅主题。
- [ ] 浏览器用例确保弹层打开后返回先关闭弹层；ADB/真机记录预测性返回“取消”不改变路由。运行相关组件及浏览器测试，独立提交：`feat(android): adapt navigation and mobile layouts`。

**验收：** 真机完成登录、编辑资产、打开通知、切应用等流程，返回和键盘不会让用户卡住。此时形成 v0.1 APK。

## Task 4：系统分享与幂等收藏

**Files:** Create `capture/ShareParser.kt`、`capture/PendingCaptureStore.kt`、对应 Kotlin 测试；Create `packages/web/src/views/mobile/MobileCaptureView.vue`、`packages/server/src/routes/mobile/bookmarks.ts`、`packages/server/test/mobile-bookmarks.test.ts`；Modify Vue router、服务注册、Prisma schema 和新增迁移。

**Interfaces:** `PendingCapture(requestId:String,url:String,title:String?)`；`POST /api/mobile/bookmarks` 使用第 4 节契约，返回现有书签数据结构。

- [ ] 测试纯 URL、带说明文字、中文标题、多个 URL、尾部标点、空内容和超过上限内容。分享输入限 16 KiB；最终 URL 长度沿用后端 4096 字符限制。只接受用户选择的 HTTP(S) 链接。
- [ ] `ACTION_SEND text/plain` 解析结果在应用私有存储临时保存，24 小时后清理；未登录不丢失待处理内容。URL 不写入日志和深链 query，内容通过已校验的消息桥交给 `/mobile/capture`。
- [ ] 新页面读取已有文件夹接口，提供标题、URL、说明、文件夹及明确保存按钮；加载失败可重试。浏览器直接访问无待分享内容时显示空态。
- [ ] 数据库新增收藏请求幂等记录，唯一键 `(userId,requestId)`，保存请求规范化后的内容哈希和结果 ID。在同一数据库事务内验证文件夹归属、创建书签和记录结果；相同请求 ID 不同内容返回 409。相同 URL 的不同主动请求仍遵循现有重复书签策略。
- [ ] 集成测试向隔离数据库连续和并发提交相同 requestId，断言只有一条书签；测试越权文件夹、401、409、无效 URL，以及网络断开后用户手动重试。
- [ ] 保存响应成功后发送 `capture.saved` 清理对应 requestId；取消时保留或删除由用户明确选择，禁止进程重建自动保存。
- [ ] 独立提交：`feat(android): capture shared links with idempotent saves`。

**验收：** 浏览器与聊天应用分享均能完成收藏；未登录和进程重建不丢任务，同一保存重试不会创建两条书签。

## Task 5：文件、外部应用和下载

**Files:** Create `files/FileChooser.kt`、`files/DownloadCoordinator.kt`、`files/DownloadPolicy.kt` 及测试；Modify 现有真实导出组件中需要转为受限下载的入口。

**Interfaces:** 文件选择返回系统授权的 content URI；下载输入只有 allowlist 中的站内 URL，不允许 JS 直接指定任意本地路径。

- [ ] 建立测试矩阵：正常备份下载、401 返回 HTML、跨站重定向、路径不在 allowlist、用户取消、网络中断、低剩余空间。断言失败后无“成功”提示且半成品被处理。
- [ ] 使用 Storage Access Framework 选择保存目标；FileChooser 只申请操作所需 URI 权限，不要求“所有文件访问”。
- [ ] 下载逐跳验证同源 HTTPS 与允许路径；只给本站附加会话 Cookie，跨源跳转中止。检查状态码、Content-Type、Content-Disposition，清理文件名中的路径部分。
- [ ] 流式写入、显示进度及取消。下载大小默认上限 256 MiB，超过后明确提示在浏览器完成；该数值作为产品限制记录，不默默截断。
- [ ] 验证书签导入、JSON/CSV 导出和备份下载实际入口。blob 导出需要适配时采用站内端点或受限分块协议，禁止任意脚本与无限 base64 传输。
- [ ] 为退出提示补充本机任务/日程的 JSON 导出，显式用户操作后保存；该导出使用限定 schema、1 MiB 上限和只写入用户选择文件的专用消息 `localData.export`，同时更新桥 allowlist 及拒绝越权的测试。
- [ ] 独立提交：`feat(android): support scoped file picking and downloads`。

**验收：** 目标手机能导入一个测试文件、导出并重新打开文件；取消操作可恢复，外站拿不到登录凭据。

## Task 6：手机设备注册、会话关联和解绑

**Files:** Create `packages/server/src/routes/mobile/devices.ts`、`services/mobile-devices.service.ts`、`test/mobile-devices.test.ts`；Modify Prisma schema、新迁移、`services/prisma.repository.ts`、`routes/admin/account.ts`、`routes/auth.ts`；Create Android `session/DeviceBindingStore.kt` 和 Web `views/mobile/MobileDeviceView.vue`。

**Interfaces:** 设备接口使用第 4 节契约；`getEligibleDevices(userId,now)` 只返回当前会话仍有效且未撤销的设备。

`MobileDeviceView.vue` 对应 `/mobile/device`，用于首次登录后完成手机提醒绑定及后续手动管理；操作完成返回校验后的站内 next。token 变化需要重新注册时显示绑定状态，不用隐藏 WebView 绕过登录或 Origin 校验。

数据模型：

| 字段 / 约束 | 内容 |
| --- | --- |
| `MobileDevice.id` | 随机设备记录 ID |
| `userId`、`sessionId` | user 归属；session 可空，删除会话时 SetNull |
| `installationId`、`provider` | 安装实例和厂商；不是鉴权凭据 |
| `registrationCiphertext`、`registrationHash` | token 加密存储，哈希用于唯一约束 |
| `revokeTokenHash`、`enabled`、`revokedAt` | 限权撤销及设备状态 |
| `appVersion`、`lastRegisteredAt`、`createdAt` | 版本与诊断信息 |
| 唯一约束 | `(provider,registrationHash)`；用户/安装关系防止重复绑定 |

- [ ] 先验证 401、非所属设备 404、客户端伪造 userId 无效、registrationId 轮换只保留当前 token、不返回明文凭据。
- [ ] 实现设备绑定事务：从请求会话解析 userId/sessionId，限制设备数与输入长度；已有其他账户占用的 token 不被无条件覆盖，要求旧绑定已撤销或完成旧设备撤销凭据校验。
- [ ] 将会话删除通过关系约束和 eligible 查询联动到设备资格；测试退出、改密撤销其他会话、手动撤销、会话自然过期、用户删除。每次发送前检查，不能只靠定时清理。
- [ ] 实现只可撤销本设备的 revokeToken；哈希保存，响应不泄露设备是否存在。Android 将待撤销请求持久化，联网后重试，并退出厂商订阅；其失效状态不能阻断本机退出。
- [ ] 测试离线退出：本机立即清理、待撤销任务存在；服务器未收到前的边界在 UI 中准确说明；恢复网络后禁止新推送。所有在途推送只含通用内容。
- [ ] 检查备份/恢复对设备记录的处理：恢复后默认禁用恢复出的移动绑定并要求重新绑定，避免旧备份复活已撤销的设备；将此处理纳入服务端恢复测试。
- [ ] 独立提交：`feat(mobile): bind push devices to revocable sessions`。

**验收：** 同一安装实例不会跨账户收到可读数据；所有现有会话撤销途径都影响推送资格。

## Task 7：持久化事件、队列及现有通知接入

**Files:** Create `services/mobile-events.service.ts`、`services/mobile-push-outbox.service.ts`、`services/mobile-push-worker.ts`、对应测试；Modify Prisma schema、新迁移、`notification-dispatch.service.ts`、`notification-dispatch.scheduler.ts`、`routes/admin/notification-channels.ts`、NoMoney `types.ts`、`notifier.ts`、`reminders.ts`、`status.ts` 及对应测试。

**Interfaces:** `enqueue(event:MobileEvent):Promise<{created:number}>` 为每个合法设备建立唯一任务；`runBatch(now:Date):Promise<{accepted:number,failed:number}>` 领取有界批次；使用第 4 节 `MobilePushProvider`。

- [ ] 在隔离 PostgreSQL 中建立 `MobileEvent` 与 `MobilePushAttempt`；事件 `(userId,source,eventId)` 唯一，设备任务 `(eventRowId,deviceId)` 唯一。保存状态、attempts、nextAttemptAt、leaseUntil、providerMessageId 和脱敏错误码。
- [ ] 先写行为测试：同一事件入队两次只有一组设备任务；两个 worker 并发领取不同时发送；设备撤销后 pending 任务取消；过期任务不发送；受理后崩溃重试保持同一去重标识。
- [ ] 领取任务在事务内使用行锁/租约，网络请求在事务外；请求超时小于租约期限。确定的临时错误按设计文档退避，永久错误禁用/报告，状态由条件更新防止过期 worker 覆盖。
- [ ] 告警 TTL 1 小时，其他消息 24 小时；厂商请求 TTL 不超过剩余时间。已恢复故障、已处理到期项取消尚未发送的失效事件；测试断网后恢复时不补发过时告警。
- [ ] 源事件稳定 ID：资产提醒由 `product/assetType/assetId/dueDate/reminderThreshold` 组成；状态告警使用持久化 pending 告警 ID + 创建时间，并保留恢复后不复用的实例身份。批量通知按子事件去重，不能只对本轮文本取随机 ID。
- [ ] relay 新增可选 eventId/事件列表字段并维持旧客户端兼容；只有手机设备时也允许持久化接收。若无任何渠道/设备继续报错；数据库入队失败必须让调用方保留重试机会。
- [ ] 普通 NoNo 通知沿用既有 5 分钟发现周期，将可推送事件送入队列；所有者枚举为“旧渠道用户 ∪ 手机设备用户”，不能因旧渠道为空提前返回。手机任务的排队/发送状态独立于旧渠道的成功记录。
- [ ] NoMoney/Yumi relay 接收成功与旧渠道外部投递分开记录；一个通道失败不能让另一个已成功通道无限重复。用现有通知重试测试增加“手机单独启用”“邮件失败但手机入队”“入队后进程重启”三个真实分支。
- [ ] 报表暴露 queued/accepted/failed/canceled/expired；received 只在 SDK 提供可验证回执时更新。接入当前通知中心的设备发送状态视图。
- [ ] 运行新队列集成测试及原通知、提醒、状态告警测试，独立提交：`feat(mobile): deliver notifications through a durable outbox`。

**验收：** 后台进程重启后不丢已持久化任务；临时失败可重试；普通网页不受影响；日志不会把“厂商受理”写成“用户已收到”。

## Task 8：小米 SDK、系统通知和点击跳转

**Files:** Create Android `push/XiaomiPushClient.kt`、`push/NonoPushReceiver.kt`、`push/NotificationRouter.kt`、对应测试；Create 服务端 `packages/server/src/services/mobile-push-xiaomi.ts`、`packages/server/src/routes/mobile/notifications.ts`、`packages/server/src/routes/mobile/app-links.ts` 和 `packages/web/src/views/mobile/MobileNotificationView.vue`；Modify `.env.example`、`docker-compose.yml`、Vue router、服务端路由注册及通知中心页面。

**Interfaces:** 服务端 `MobilePushProvider` → 厂商稳定 API；SDK token 回调 → `push.registration` → 同源设备注册页；通知点击只传 eventId 和合法站内路径。

- [ ] 使用任务 0 验证并锁定的 SDK/API；服务端密钥经部署环境提供，APK 只使用厂商允许公开的客户端配置。实现请求超时、厂商错误码映射和脱敏日志。
- [ ] Android 13+ 在用户开启手机提醒时请求通知权限；拒绝后保留站内通知入口，并给出系统设置入口。建立三个稳定 channelId：`alerts`、`reminders`、`updates`，不通过反复建新渠道绕过用户设置。
- [ ] 采用厂商支持的后台通知方式验证“进程未运行仍可显示”。SDK 的通知展示与 APP 前台自行展示必须互斥，避免同一条出现两次。
- [ ] 使用稳定通知 ID 和 eventId 消除重复展示；点击 Intent 不包含秘密，使用不可变 PendingIntent 和明确组件。通过公开 `GET /.well-known/assetlinks.json` 路由提供最终包名和 release 指纹，debug 指纹不加入生产关联；测试无需登录、JSON Content-Type 和正确指纹，并在真机核验 App Links。
- [ ] 点击后打开 `/mobile/notifications/:eventId` 承接页，登录失效则登录后返回；接口按账户检查后才显示业务详情。记录 opened，未提供回执的 received 保持未知。
- [ ] 真机验证前台、后台、熄屏、普通清后台、重启、Wi-Fi/移动数据切换、通知权限拒绝和恢复；强行停止另外记录预期限制。
- [ ] 独立提交：`feat(android): integrate Xiaomi push and notification navigation`。

**验收：** 本人测试设备可从 nc48 收到告警并打开正确页面；权限被拒和会话过期时没有死循环或越权详情。

## Task 9：发布、回归及 48 小时观察

**Files:** Create `docs/quality/android/release-checklist.md`、`docs/quality/android/push-results.csv`、`scripts/build-android.sh`；Modify 根 README 添加构建入口。发布说明保存真实版本、APK SHA-256、后端最低兼容版本和变更内容。

**Interfaces:** release APK + SHA-256 + 与之对应的 Git 提交；签名材料由独立安全存储/构建环境提供。

- [ ] 建立 dev/staging/release 配置，staging 后端使用独立数据库和本人测试推送应用，避免开发测试修改生产资产或向真实收件人发通知。
- [ ] 验证“旧 APK + 新网页”和“新 APK + 旧后端”组合；协议能力不足时隐藏对应新操作并显示更新说明，不让网页升级造成旧 APK 白屏。移动桥 `v:1` 的兼容行为必须有回归用例。
- [ ] 执行以下有针对性的自动验证；新测试文件在对应任务中创建：

```bash
cd apps/android
./gradlew :app:testDebugUnitTest :app:lintRelease :app:assembleRelease
./gradlew :app:connectedDebugAndroidTest
```

```bash
npm run test -w packages/server -- --run test/mobile-devices.test.ts test/mobile-bookmarks.test.ts test/mobile-push-outbox.test.ts test/account-security.test.ts test/notification-dispatch.test.ts
npm run test -w packages/web -- --run test/mobile-login-return.test.ts
npm --prefix apps/blog test
npm --prefix apps/nomoney test
npm run test:gateway
npm run build:all
```

Android 设备测试需要任务 0 登记的设备；队列集成测试必须有独立测试 PostgreSQL。缺少环境属于未执行，不能当成跳过后通过。

- [ ] 每个受支持后台状态至少安排 10 条通用测试消息，分布在 Wi-Fi 和移动网络；记录 emitted/queued/accepted/received/opened 五个时间（无证据字段留空并注明原因）。不要把应用前台轮询取到消息当作系统推送到达。
- [ ] 以“厂商已受理且设备联网、权限允许”的测试消息为口径，目标至少 95% 在 60 秒内可见、5 分钟内全部可见，重复展示为 0；这只是首轮验收门槛，样本量和环境同时报告，不宣称生产 SLA。源事件发现的 5 分钟扫描延迟另算。
- [ ] 进行至少 48 小时日常观察：长时间锁屏、省电模式、重启、网络切换、冷启动、退出/重登；修复阻断项后只重跑受影响用例。
- [ ] 在 nc48 先发兼容旧网页的新后端/页面，沿用锁、快照、隔离端口验收流程，再安装正式签名 APK。设备推送用服务端开关先禁用，确认绑定后再对测试设备启用。
- [ ] 应用更新先提供 HTTPS 下载和由系统确认的安装流程；验证签名连续性和覆盖安装保留数据。自动更新留在后续版本，不下载执行未校验的任意包。
- [ ] 出问题优先关闭手机推送开关或回退 APK；服务器业务写入继续保留。恢复数据库必须走既有数据恢复流程，不能因 APK 问题直接回滚生产数据。
- [ ] 独立提交：`chore(android): document and verify the first signed release`。

**交付物：** 可安装签名 APK、SHA-256、版本说明、真实手机兼容清单、推送延迟/漏收记录、遗留限制及回退步骤。

## 5. 首版必须覆盖的验收场景

| 场景 | 应有结果 |
| --- | --- |
| 首次安装、覆盖更新、进程被回收 | 正常启动；恢复只读位置，不重复记账或保存 |
| 一次登录访问五个应用 | 共享会话，角色权限保持一致 |
| 14 天会话失效/主动撤销 | 重新登录；关联设备不能继续产生新投递 |
| 未登录时分享链接 | 登录后继续选择文件夹和保存 |
| 收藏提交后网络断开 | 同 requestId 重试只得到一条书签 |
| 返回手势取消/完成、软键盘 | 取消不导航；先关弹窗；提交按钮可见 |
| 下载取消、401、跨站重定向 | 无凭据外泄，不误报成功，无失控半成品 |
| 手机无网络、服务器维护 | 明确可重试状态，不自动重放写操作 |
| 熄屏/重启/普通清后台 | 记录真实推送行为和延迟 |
| 用户强行停止/关闭通知 | 说明限制，APP 重开后能补拉站内列表 |
| 同一事件重复发送 | 同设备无重复任务或重复展示；记录在途不确定性 |
| 退出及切换账号 | 清理本机内容、撤销绑定，不展示前一账号详情 |
| 从旧数据库备份恢复 | 恢复出的设备默认禁用，重新绑定后才发送 |
| 大字体、横屏、深浅模式 | 主要操作可见且可点，不发生横向遮挡 |

## 6. 后续版本的边界

**v0.3 建议优先做任务/日程跨设备同步。** 增加按用户保存的服务端任务和日程、版本号及删除标记；已有 localStorage 数据经用户预览后一次性导入，不能自动覆盖服务器内容。服务端成为通知日程的唯一数据源后，手机和桌面提醒才可一致。

**Passkey、桌面小组件和生物识别锁单独验收。** 生物识别只保护本机界面，不能替代服务器会话；Passkey 必须在目标 ROM/凭据提供器环境验证。小组件展示最少信息，刷新频率接受系统后台调度限制。

**离线写入单独立项。** 先定义哪些操作能离线、冲突如何解决、幂等窗口和撤销规则，再采用本地数据库与 outbox。资金、续费和资产删除不直接套用“最后写入获胜”。

## 7. 开工前需要收集的资料

这份计划可直接用于安排开发，实际实施任务 0 时需要：手机型号与完整系统/Android 版本、WebView 版本、是否为国行环境、小米开发者账号和该应用推送接入状态、签名密钥保管方式、可用于测试的手机与网络。若未来计划上架商店或支持多个自建站点，应先修改本方案范围与排期。

资料缺失不会妨碍阅读和讨论计划，也不表示可以编造 SDK 兼容性或推送成功结果。下一项实际工作是 Task 0，然后交付 v0.1 在线首版。
