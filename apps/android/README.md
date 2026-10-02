# NoNo Android

NoNo 的 Android 客户端（v0.1）。应用是一个只承载 `https://noaul.com` 的 WebView：NoDesk、NoMoney、Yumi、NoStar 和书签管理沿用现有网页，五个应用共用一次 NoNo 登录；原生部分负责返回手势、系统栏与键盘适配、外部链接、文件上传、下载和“分享 → 收藏到 NoNo”。

包名 `com.noaul.nono`，最低 Android 10（API 29），目标 Android 16（API 36）。详细路线见 [Android 开发计划](../../docs/superpowers/plans/2026-10-02-android-app.md)。

## 功能（v0.1）

- 启动打开 NoDesk；同一个 WebView 内切换 NoMoney、Yumi、NoStar、书签管理，登录状态持久保存。
- 只有 NoNo 自己的地址在应用内打开；其他网页交给系统浏览器，`mailto:`/`tel:` 交给对应应用，`javascript:`/`file:`/`intent:` 等一律拒绝。证书错误直接停止连接，只信任系统 CA。
- 在其他应用中“分享 → 收藏到 NoNo”：提取第一个网址，打开书签页并预填“新建书签”行，选择文件夹后保存。
- 网页的文件选择框（备份恢复、书签导入）使用系统选择器；NoNo 站内的直接下载链接交给系统下载管理器。
- 网络断开、服务器维护（5xx）时显示原生错误页和“重试”；WebView 渲染进程被系统回收后自动重建并回到原页面。
- 登录 Cookie 不进入云备份或换机迁移。

尚未包含：系统推送通知（目前请使用通知中心的 Bark/Telegram 渠道）、网页内生成的 blob 文件下载（如 NoDesk 备份中心的本地下载，请在浏览器完成）、Passkey 登录（使用密码登录）。

## 构建

需要 JDK 17 和 Android SDK（platform 36、build-tools 35/36）。在 `apps/android/local.properties` 写入 `sdk.dir=...`，或设置 `ANDROID_HOME`。

```bash
npm run build:android            # 单元测试 + release lint + 签名 release APK
cd apps/android && ./gradlew :app:assembleDebug -PnonoDebugBaseUrl=http://10.0.2.2:3000   # 连接本地测试服务的 debug 包
```

输出：`app/build/outputs/apk/release/app-release.apk`。

**签名**：release 签名配置放在仓库之外，默认读取 `~/.nono-android/keystore.properties`（可用 `NONO_ANDROID_SIGNING` 指定路径），字段为 `storeFile`、`storePassword`、`keyAlias`、`keyPassword`。没有该文件时生成未签名包。**签名密钥丢失后无法覆盖安装已装的应用，必须另行备份。**

## 小米澎湃 OS 安装提示

- 侧载安装时允许“安装未知应用”；如出现安全检查，选择继续安装。
- 若希望应用保持登录、少被回收：设置 → 应用设置 → NoNo → 省电策略选“无限制”（可选）。
- 分享入口名称为“收藏到 NoNo”。

## 无真机时的测试（Redroid）

开发机和各服务器都没有 `/dev/kvm`，Android 模拟器无法运行。可在内核带 binder 的服务器（如 rn）上用 Redroid 在 Docker 中运行 Android 14：

```bash
# 服务器上（binder 驱动加载后需重启才能卸载）
modprobe binder_linux devices=binder,hwbinder,vndbinder
chmod 666 /dev/binder /dev/hwbinder /dev/vndbinder   # 测完改回 600
docker run -d --name nono-redroid --privileged --memory 1800m --memory-swap 1800m -p 127.0.0.1:5555:5555 \
  redroid/redroid:14.0.0_64only-latest androidboot.redroid_width=1080 androidboot.redroid_height=2400 \
  androidboot.redroid_dpi=440 androidboot.use_memfd=true
# 开发机上
ssh -f -N -L 15555:127.0.0.1:5555 rn && adb connect 127.0.0.1:15555
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb exec-out screencap -p > screen.png
```

debug 包允许 WebView 调试：`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` 后可用 DevTools 协议导航页面、读取布局。Redroid 自带 WebView 125（低于 140，正好覆盖注入安全区变量的回退路径），但不是澎湃 OS，省电策略、手势细节仍需真机确认。测完 `docker rm -f nono-redroid`。
