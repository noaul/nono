package com.noaul.nono

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.provider.DocumentsContract
import android.webkit.WebStorage
import android.view.View
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.edit
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.net.toUri
import androidx.core.view.isVisible
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.noaul.nono.capture.PendingCaptureStore
import com.noaul.nono.files.DownloadCoordinator
import com.noaul.nono.files.DownloadPolicy
import com.noaul.nono.session.SafeRoute
import com.noaul.nono.web.BackCoordinator
import com.noaul.nono.web.BridgeProtocol
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * NoNo for Android, version 0.1: one WebView showing the existing NoDesk, NoMoney, Yumi, NoStar and
 * bookmark pages from the NoNo server, sharing one login. The native side handles back navigation,
 * system insets, external links, file upload, downloads and "share to NoNo".
 */
class MainActivity : ComponentActivity() {
    private val policy = NavigationPolicy(BuildConfig.BASE_URL)
    // Every launch goes through the NoNo login page: signed out it shows the form, signed in it
    // forwards straight to NoDesk (the NoDesk home itself is public and has no login entry).
    private val homeUrl get() = policy.resolve("/login?next=%2Fnodesk%2F")

    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorPanel: View
    private lateinit var errorMessage: TextView
    private lateinit var root: View
    private lateinit var topBand: View
    private lateinit var bottomBand: View

    private var insets: WindowInsetsCompat? = null
    private var pageTopColor: Int? = null
    private var pageBottomColor: Int? = null
    private var pageDark: Boolean? = null

    private var rendererGone = false
    private val captures by lazy { PendingCaptureStore(getSharedPreferences("pending-capture", MODE_PRIVATE)) }
    private val routePreferences by lazy { getSharedPreferences("safe-route", MODE_PRIVATE) }
    private val downloadPolicy = DownloadPolicy(BuildConfig.BASE_URL)
    private var pendingDownload: String? = null
    private var activeDownload: DownloadCoordinator? = null
    private var downloadDialog: AlertDialog? = null
    private var clearHistoryAfterLoad = false
    private var destroyed = false
    private var clearingSession = false
    private var sessionGeneration = 0
    private var bridgeInstalled = false
    private fun isActiveSession(generation: Int) =
        !destroyed && !rendererGone && !clearingSession && generation == sessionGeneration
    private val downloadTarget = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val url = pendingDownload
        pendingDownload = null
        val uri = result.data?.data
        if (result.resultCode == RESULT_OK && uri != null) {
            if (url == null || uri.scheme != "content") deletePartial(uri) else saveDownload(url, uri)
        }
    }


    /** Exact origin the bridge accepts messages from, e.g. https://noaul.com. */
    private val trustedOrigin = java.net.URI(BuildConfig.BASE_URL).let { "${it.scheme}://${it.rawAuthority}" }
    /** Reply channel of the current page's main frame; null until it says hello. */
    private var pageReply: JavaScriptReplyProxy? = null
    private val back = BackCoordinator(
        send = { requestId -> postToPage("ui.back", requestId) },
        fallback = { historyBack() },
        schedule = { delayMs, action -> webView.postDelayed(action, delayMs) },
        newRequestId = { "back-" + UUID.randomUUID().toString().take(12) },
    )

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            // Open dialogs and panels close first (the page answers over the bridge); then history.
            back.onBack()
        }
    }

    private fun historyBack() {
        if (webView.canGoBack()) {
            hideError()
            webView.goBack()
            return
        }
        // Hand the root back press to the system. Depending on the Android version that finishes
        // the activity or only moves it to the background; in the second case a callback left
        // disabled made every later back press exit the app, so it is switched back on here and
        // again in onResume.
        backCallback.isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        backCallback.isEnabled = true
    }
    private var lastUrl: String? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        root = findViewById(R.id.root)
        topBand = findViewById(R.id.top_band)
        bottomBand = findViewById(R.id.bottom_band)
        webView = findViewById(R.id.web_view)
        progress = findViewById(R.id.progress)
        errorPanel = findViewById(R.id.error_panel)
        errorMessage = findViewById(R.id.error_message)
        findViewById<Button>(R.id.retry).setOnClickListener { retry() }

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, windowInsets ->
            insets = windowInsets
            applyWindowChrome()
            WindowInsetsCompat.CONSUMED
        }
        // A tap may toggle a page's light/dark theme; re-read its colours shortly after.
        @SuppressLint("ClickableViewAccessibility")
        webView.setOnTouchListener { _, event ->
            if (event.actionMasked == android.view.MotionEvent.ACTION_UP) webView.postDelayed({ samplePageColors() }, 350)
            false
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, false)
        }
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            setSupportZoom(false)
            userAgentString = "$userAgentString NoNoAndroid/${BuildConfig.VERSION_NAME}"
        }
        webView.webViewClient = NonoWebViewClient()
        webView.webChromeClient = NonoChromeClient()
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            download(url, userAgent, contentDisposition, mimeType)
        }

        onBackPressedDispatcher.addCallback(this, backCallback)
        installBridge()

        pendingDownload = savedInstanceState?.getString("pending_download")?.takeIf(downloadPolicy::allows)
        if (savedInstanceState == null && handleIntent(intent)) return
        val resumeUrl = safeResumeUrl(savedInstanceState?.getString(KEY_RESUME_URL)
            ?: routePreferences.getString(KEY_RESUME_URL, null))
        webView.loadUrl(if (captures.get() != null) policy.resolve("/mobile/capture") else resumeUrl ?: homeUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        safeResumeUrl(lastUrl)?.let { outState.putString(KEY_RESUME_URL, it) }
        pendingDownload?.let { outState.putString("pending_download", it) }
    }

    override fun onResume() {
        super.onResume()
        backCallback.isEnabled = true
        samplePageColors()
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        destroyed = true
        activeDownload?.cancel()
        downloadDialog?.dismiss()
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        if (!rendererGone) webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val KEY_RESUME_URL = "resume_url"
        /** Name of the object the bridge injects into NoNo pages: `window.NonoBridge`. */
        const val BRIDGE_NAME = "NonoBridge"

        const val SAMPLE_COLORS_SCRIPT = """(function(){
  function bgAt(x, y) {
    for (var e = document.elementFromPoint(x, y); e; e = e.parentElement) {
      var c = getComputedStyle(e).backgroundColor;
      if (c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return '';
  }
  var h = document.documentElement, x = window.innerWidth / 2;
  var dark = h.classList.contains('dark') || h.dataset.theme === 'dark' || getComputedStyle(h).colorScheme === 'dark';
  return JSON.stringify({ top: bgAt(x, 1), bottom: bgAt(x, window.innerHeight - 2), dark: dark });
})()"""
    }

    /**
     * Page ↔ app messages (protocol v1). WebViews without origin-checked message listeners get no
     * bridge at all, and the app keeps plain history back navigation.
     */
    private fun installBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val generation = sessionGeneration
        bridgeInstalled = true
        WebViewCompat.addWebMessageListener(webView, BRIDGE_NAME, setOf(trustedOrigin)) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isActiveSession(generation)) return@addWebMessageListener
            val parsed = BridgeProtocol.parse(message.data, sourceOrigin.toString(), trustedOrigin, isMainFrame) ?: return@addWebMessageListener
            if (parsed.type != "bridge.hello" && pageReply == null) return@addWebMessageListener
            when (parsed.type) {
                "bridge.hello" -> {
                    pageReply = replyProxy
                    postToPage("bridge.ready", parsed.requestId, JSONObject()
                        .put("version", BridgeProtocol.VERSION)
                        .put("capabilities", JSONArray(listOf("ui.back", "capture.pending", "download.request", "session.clear"))))
                    deliverCapture()
                }
                "capture.request" -> deliverCapture()
                "capture.saved", "capture.dismissed" -> {
                    if (isCapturePage()) captures.acknowledge(parsed.payload.optString("requestId"))
                }
                "download.request" -> download(parsed.payload.optString("url"), webView.settings.userAgentString,
                    null, parsed.payload.optString("mimeType", "application/octet-stream"), parsed.payload.optString("filename"))
                "session.clear" -> clearSession()
                "ui.backState" -> back.pageCanHandle = parsed.payload.optBoolean("canHandle")
                "ui.backResult" -> back.onResult(parsed.requestId, parsed.payload.optBoolean("handled"))
            }
        }
    }

    private fun postToPage(type: String, requestId: String, payload: JSONObject = JSONObject()) {
        val reply = pageReply ?: return
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) reply.postMessage(BridgeProtocol.encode(type, requestId, payload))
    }

    /** Opens a shared link in the bookmark editor. Returns true when the intent was handled. */
    private fun handleIntent(intent: Intent?): Boolean {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return false
        val link = parseSharedLink(intent.getStringExtra(Intent.EXTRA_TEXT), intent.getStringExtra(Intent.EXTRA_SUBJECT))
        if (link == null) {
            Toast.makeText(this, R.string.share_no_link, Toast.LENGTH_SHORT).show()
            if (!clearingSession && webView.url == null) webView.loadUrl(homeUrl)
            return true
        }
        try { captures.save(link) } catch (_: Exception) {
            Toast.makeText(this, "无法暂存分享内容，请重试", Toast.LENGTH_LONG).show()
            return true
        }
        // Do not replay ACTION_SEND (and generate a new request ID) after recreation.
        intent.removeExtra(Intent.EXTRA_TEXT)
        intent.removeExtra(Intent.EXTRA_SUBJECT)
        hideError()
        if (!clearingSession) webView.loadUrl(policy.resolve(sharedLinkPath(link)))
        return true
    }

    private val night get() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    /**
     * Lays the WebView out for the current page. The NoDesk home is drawn edge-to-edge and receives
     * the bar sizes as CSS variables (--nono-safe-*), because Android WebView before version 140
     * reports 0 for env(safe-area-inset-*). Other pages stop at the bars, and the bars are painted in
     * the colours at the top and bottom of the page so they read as part of it.
     */
    private fun applyWindowChrome() {
        val current = insets ?: return
        val bars = current.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val ime = current.getInsets(WindowInsetsCompat.Type.ime()).bottom
        val edge = policy.isEdgeToEdge(webView.url ?: lastUrl)
        val bottomInset = if (ime > 0) maxOf(ime, bars.bottom) else bars.bottom

        (webView.layoutParams as android.view.ViewGroup.MarginLayoutParams).apply {
            if (edge) setMargins(0, 0, 0, if (ime > 0) ime else 0) else setMargins(bars.left, bars.top, bars.right, bottomInset)
            webView.layoutParams = this
        }
        topBand.layoutParams = topBand.layoutParams.apply { height = bars.top }
        bottomBand.layoutParams = bottomBand.layoutParams.apply { height = bars.bottom }
        topBand.isVisible = !edge
        bottomBand.isVisible = !edge && ime == 0
        (progress.layoutParams as android.view.ViewGroup.MarginLayoutParams).topMargin = bars.top
        progress.requestLayout()
        errorPanel.setPadding(bars.left, bars.top, bars.right, bars.bottom)

        val fallback = getColor(R.color.surface)
        val top = pageTopColor ?: fallback
        val bottom = pageBottomColor ?: top
        topBand.setBackgroundColor(top)
        bottomBand.setBackgroundColor(bottom)
        // Side cutouts in landscape show the root, so match the page there too.
        root.setBackgroundColor(top)
        // In 3-button navigation the system draws a translucent scrim behind the buttons; drop it on
        // the full-bleed page so the wallpaper shows through, keep it elsewhere for contrast.
        window.isNavigationBarContrastEnforced = !edge
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = if (edge) !(pageDark ?: night) else isLightColor(top)
            isAppearanceLightNavigationBars = if (edge) !(pageDark ?: night) else isLightColor(bottom)
        }

        val density = resources.displayMetrics.density
        fun css(px: Int) = "${(px / density).toInt()}px"
        val safe = if (edge) mapOf("top" to bars.top, "right" to bars.right, "bottom" to if (ime > 0) 0 else bars.bottom, "left" to bars.left) else mapOf("top" to 0, "right" to 0, "bottom" to 0, "left" to 0)
        val script = safe.entries.joinToString("") { (side, px) -> "s.setProperty('--nono-safe-$side','${css(px)}');" }
        if (webView.url?.let { policy.isSameOrigin(it) } == true) {
            webView.evaluateJavascript("(function(){var s=document.documentElement.style;$script})()", null)
        }
    }

    /** Reads the background colours under the top and bottom edges of the page and whether it is in dark mode. */
    private fun samplePageColors() {
        if (webView.url?.let { policy.isSameOrigin(it) } != true) return
        webView.evaluateJavascript(SAMPLE_COLORS_SCRIPT) { result ->
            val json = runCatching { org.json.JSONObject(org.json.JSONTokener(result).nextValue() as String) }.getOrNull() ?: return@evaluateJavascript
            pageTopColor = parseCssColor(json.optString("top"))
            pageBottomColor = parseCssColor(json.optString("bottom"))
            pageDark = if (json.has("dark")) json.optBoolean("dark") else null
            applyWindowChrome()
        }
    }

    private fun retry() {
        hideError()
        val current = webView.url
        if (current != null && policy.isSameOrigin(current)) webView.reload() else webView.loadUrl(homeUrl)
    }

    private fun showError(message: String) {
        errorMessage.text = message
        errorPanel.isVisible = true
        progress.isVisible = false
    }

    private fun hideError() {
        errorPanel.isVisible = false
    }

    private fun openOutside(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url.toUri()).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun isCapturePage(): Boolean = webView.url?.let {
        policy.isSameOrigin(it) && it.toUri().path?.trimEnd('/') == "/mobile/capture"
    } == true

    private fun deliverCapture() {
        if (!isCapturePage()) return
        val pending = captures.get() ?: return
        postToPage("capture.pending", pending.requestId, JSONObject().put("requestId", pending.requestId)
            .put("url", pending.url).put("title", pending.title ?: JSONObject.NULL))
    }

    /** Reload a GET route, never WebView's saved POST or form state. Drop URL query and fragment. */
    private fun safeResumeUrl(raw: String?): String? = SafeRoute(trustedOrigin).restore(raw)

    private fun clearSession() {
        if (clearingSession || destroyed || rendererGone) return
        clearingSession = true
        val generation = ++sessionGeneration
        activeDownload?.cancel()
        pendingDownload = null
        captures.clear()
        routePreferences.edit { clear() }
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        webView.stopLoading()
        if (bridgeInstalled && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.removeWebMessageListener(webView, BRIDGE_NAME)
            bridgeInstalled = false
        }
        pageReply = null
        back.reset()
        WebStorage.getInstance().deleteAllData()
        webView.clearCache(true)
        webView.clearFormData()
        webView.clearHistory()
        lastUrl = null
        // Drop the old document immediately; its retired callbacks cannot repopulate session state.
        webView.loadUrl("about:blank")
        CookieManager.getInstance().removeAllCookies {
            CookieManager.getInstance().flush()
            if (!destroyed && !rendererGone && clearingSession && sessionGeneration == generation) {
                clearingSession = false
                webView.webViewClient = NonoWebViewClient()
                installBridge()
                clearHistoryAfterLoad = true
                webView.loadUrl(if (captures.get() != null) policy.resolve("/mobile/capture") else homeUrl)
            }
        }
    }

    private fun download(url: String, userAgent: String, contentDisposition: String?, mimeType: String?, suggestedName: String? = null) {
        if (clearingSession || destroyed || rendererGone) return
        if (!downloadPolicy.allows(url)) {
            Toast.makeText(this, R.string.download_unsupported, Toast.LENGTH_LONG).show()
            return
        }
        if (pendingDownload != null || activeDownload != null) {
            Toast.makeText(this, "请先完成或取消当前下载", Toast.LENGTH_SHORT).show()
            return
        }
        val filename = downloadPolicy.filename(suggestedName?.takeIf { it.isNotBlank() }
            ?: URLUtil.guessFileName(url, contentDisposition, mimeType))
        pendingDownload = url
        try {
            downloadTarget.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mimeType?.takeIf { it.contains('/') } ?: "application/octet-stream")
                .putExtra(Intent.EXTRA_TITLE, filename))
        } catch (_: ActivityNotFoundException) {
            pendingDownload = null
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_LONG).show()
        }
    }

    private fun deletePartial(uri: Uri): Boolean {
        if (uri.scheme != "content") return false
        return runCatching { DocumentsContract.deleteDocument(contentResolver, uri) }.getOrDefault(false)
    }

    private fun saveDownload(url: String, uri: Uri) {
        val transfer = DownloadCoordinator(downloadPolicy, { CookieManager.getInstance().getCookie(it) })
        activeDownload = transfer
        val dialog = AlertDialog.Builder(this).setTitle("正在保存文件").setMessage("连接中…")
            .setNegativeButton("取消") { _, _ -> transfer.cancel() }
            .setOnCancelListener { transfer.cancel() }.create()
        downloadDialog = dialog
        dialog.show()
        Thread({
            var failure: Exception? = null
            var removed = true
            try {
                var lastProgressAt = 0L
                transfer.save(url,
                    { contentResolver.openOutputStream(uri, "wt") ?: throw java.io.IOException("Cannot open document") },
                    { removed = deletePartial(uri) }) { bytes, total ->
                        val now = android.os.SystemClock.elapsedRealtime()
                        if (now - lastProgressAt >= 200) {
                            lastProgressAt = now
                            runOnUiThread {
                                if (!destroyed) dialog.setMessage(if (total > 0) "${bytes * 100 / total}%" else "已保存 ${bytes / 1024} KiB")
                            }
                        }
                }
            } catch (error: Exception) {
                failure = error
            }
            runOnUiThread {
                activeDownload = null
                downloadDialog = null
                dialog.dismiss()
                if (!destroyed) Toast.makeText(this,
                    if (failure == null) "文件已保存" else if (!removed) "保存失败，请删除所选位置的未完成文件" else "保存失败或已取消；文件上限 256 MiB，可在浏览器重试",
                    Toast.LENGTH_LONG).show()
            }
        }, "nono-export").start()
    }

    // onRenderProcessGone is implemented below; the androidx.webkit lint check still reports it.
    @SuppressLint("MissingOnRenderProcessGone")
    private inner class NonoWebViewClient : WebViewClient() {
        private val generation = sessionGeneration
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!isActiveSession(generation)) return true
            val url = request.url.toString()
            return when (policy.classify(url)) {
                Destination.IN_APP -> false
                Destination.BROWSER, Destination.SYSTEM -> { openOutside(url); true }
                Destination.BLOCKED -> true
            }
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            if (!isActiveSession(generation)) return
            progress.isVisible = true
            // A new document announces its own layers and reply channel again.
            back.reset()
            pageReply = null
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            if (!isActiveSession(generation)) return
            applyWindowChrome()
            samplePageColors()
        }

        // Single-page apps change the address without loading a new page.
        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            if (!isActiveSession(generation)) return
            lastUrl = url
            applyWindowChrome()
            view.postDelayed({ samplePageColors() }, 300)
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (!isActiveSession(generation)) return
            applyWindowChrome()
            samplePageColors()
            lastUrl = url
            safeResumeUrl(url)?.let { routePreferences.edit { putString(KEY_RESUME_URL, it) } }
            if (clearHistoryAfterLoad) { view.clearHistory(); clearHistoryAfterLoad = false }
            progress.isVisible = false
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (isActiveSession(generation) && request.isForMainFrame) showError(getString(R.string.error_network, error.description))
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            // The gateway answers 502/503/504 with JSON while NoNo restarts or is in maintenance.
            if (isActiveSession(generation) && request.isForMainFrame && response.statusCode >= 500) {
                showError(getString(R.string.error_server, response.statusCode))
            }
        }

        // HyperOS reclaims the WebView renderer under memory pressure. Without this the whole app
        // would crash; instead rebuild the activity and reopen the last page.
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            if (view !== webView) return false
            rendererGone = true
            (view.parent as? android.view.ViewGroup)?.removeView(view)
            view.destroy()
            recreate()
            return true
        }

        @SuppressLint("WebViewClientOnReceivedSslError")
        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            if (isActiveSession(generation)) showError(getString(R.string.error_certificate))
        }
    }

    private inner class NonoChromeClient : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress.progress = newProgress
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = filePathCallback
            return try {
                fileChooser.launch(fileChooserParams.createIntent())
                true
            } catch (_: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }
    }
}
