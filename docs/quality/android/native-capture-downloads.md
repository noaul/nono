# Android capture, session and download verification

Date: 2026-10-03. Scope: native code in `apps/android`, protocol v1.

## Implemented behavior

- Shared `text/plain` input is limited to 16 KiB UTF-8; accepted HTTP(S) URL is at most 4096 characters. The first link and suggested title are stored in app-private preferences, excluded from backup, with a random request ID and 24-hour expiry checked on access. No share URL/title in browser query or logs.
- The app opens `/mobile/capture`. Pending content survives login and activity recreation. A trusted main frame must negotiate the bridge first. On that route, native responds to `capture.request` with `capture.pending`, payload `{requestId,url,title}`. `capture.saved` and `capture.dismissed` only clear the matching `payload.requestId`. Web must only send saved after server success, and dismissed after an explicit discard action.
- `session.clear` clears cookies, WebStorage, cache, page history, file chooser callback, pending capture and saved route, and cancels an active download. Web sends it after online logout, or explicit offline local logout. Only shell page roots (`nodesk`, `nomoney`, `yumi`, `nostar`, `admin`, or `/`) are restored using GET, with query and fragment removed; all nested API and traversal segments are rejected; WebView form/POST state is not restored.
- `download.request` accepts `{url,filename?,mimeType?}`. File names are stripped of directories and unsafe characters; JS cannot choose an arbitrary local path. The user selects a document destination through SAF. HTTP 200, allowed MIME, and attachment disposition are required. Each redirect is checked before connecting or obtaining cookies. Transfer is bounded to 256 MiB, including unknown-length bodies, with progress/cancel, stream closure and deletion of failed output. If a provider refuses deletion, the user is told to remove the partial file.

Download paths (HTTPS exact configured origin; no query or fragment):

- `/api/admin/bookmarks/export`
- `/api/admin/backups/<id>/download`
- `/api/admin/backup-center/jobs/<id>/download`
- `/{nomoney,yumi}/api/{phones,vps,domains,subscriptions,expenses}/export.csv`

Encoded path segments, traversal, login redirects, other origins and arbitrary blob exports are rejected. The backup ID accepts alphanumeric, underscore, dot and dash; the job ID accepts alphanumeric, underscore and dash. Dot-only traversal segments are rejected.

## Validation and remaining device checks

Automated unit/Robolectric results and release build status are recorded after the final check below. Regression coverage includes capture privacy/expiry/stale acknowledgements, intent recreation, safe GET restoration, allowlist/filename checks, redirect cookie boundaries, truncated response, size/cancel and destination write failures.

Not yet verified on a physical Xiaomi/HyperOS device: Android document provider behavior, cancellation and low-storage UI, upload/import, export reopening, force-stop/restart, gesture/keyboard behavior and account switching. No Redroid result is represented as a Xiaomi test. Sudden OS process death while a document is being written may leave a partial file; the foreground lifecycle and error/cancel paths attempt deletion. This version does not claim resumable background downloads.

Xiaomi remote push is deferred because no usable developer account is available. No SDK credentials, device registration results or remote delivery claims are invented. Local Android notification channels and runtime permission are technically available without a Xiaomi account but are not implemented in this release. Existing in-app notifications and configured Bark/Telegram delivery remain separate alternatives; Android compatibility of any receiving app must be verified.

## Final automated evidence

Command (JDK 17; SDK `/root/android-sdk`):

```sh
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ANDROID_HOME=/root/android-sdk \
  apps/android/gradlew -p apps/android :app:testDebugUnitTest :app:lintRelease :app:assembleRelease
```

Result: `BUILD SUCCESSFUL`; 40 JUnit/Robolectric tests, 0 failures/errors. Release lint: `No issues found.` Robolectric uses API 35; this is not physical-device validation. `apksigner verify` exited 0 for `apps/android/app/build/outputs/apk/release/app-release.apk`.

APK SHA-256: `ea6ca768d908aea3837b24cda22c5982743f98a1b1b7f8305c6f210b16474197`.

Toolchain remains JDK 17, Gradle 8.14.5, AGP 8.13.2, Kotlin 2.2.21, min SDK 29 and compile/target SDK 36. The build signs using the pre-existing external signing configuration; no private signing material is stored here. The environment emitted an SDK XML version warning on daemon startup; lint, tests and packaging completed successfully.

Logout/share race regression: asynchronous cookie cleanup defers new capture navigation and selects the pending capture after completion. A generation guard retires the previous page client and bridge listener, so old callbacks cannot repersist its route or clear a newly shared item. Two Robolectric tests delay cookie removal to exercise these interleavings; both failed before the fix and passed afterward.
