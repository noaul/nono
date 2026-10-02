package com.noaul.nono

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.Environment
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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.net.toUri
import androidx.core.view.isVisible

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

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    errorPanel.isVisible && webView.canGoBack() -> { hideError(); webView.goBack() }
                    webView.canGoBack() -> webView.goBack()
                    else -> { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
                }
            }
        })

        val restored = savedInstanceState?.let { webView.restoreState(it) } != null
        if (handleIntent(intent) || restored) return
        // After a renderer crash only the page address survives; reopen it if it is ours.
        val resumeUrl = savedInstanceState?.getString(KEY_RESUME_URL)?.takeIf { policy.isSameOrigin(it) }
        webView.loadUrl(resumeUrl ?: homeUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (rendererGone) lastUrl?.let { outState.putString(KEY_RESUME_URL, it) } else webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        samplePageColors()
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        if (!rendererGone) webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val KEY_RESUME_URL = "resume_url"

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

    /** Opens a shared link in the bookmark editor. Returns true when the intent was handled. */
    private fun handleIntent(intent: Intent?): Boolean {
        if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true) return false
        val link = parseSharedLink(intent.getStringExtra(Intent.EXTRA_TEXT), intent.getStringExtra(Intent.EXTRA_SUBJECT))
        if (link == null) {
            Toast.makeText(this, R.string.share_no_link, Toast.LENGTH_SHORT).show()
            if (webView.url == null) webView.loadUrl(homeUrl)
            return true
        }
        hideError()
        webView.loadUrl(policy.resolve(sharedLinkPath(link)))
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

    /**
     * Direct downloads from the NoNo origin go through the system download manager with the session
     * cookie. Pages that build files in the browser (blob: URLs) are not supported in this version.
     */
    private fun download(url: String, userAgent: String, contentDisposition: String?, mimeType: String?) {
        if (!policy.isSameOrigin(url)) {
            if (url.startsWith("http://") || url.startsWith("https://")) openOutside(url)
            else Toast.makeText(this, R.string.download_unsupported, Toast.LENGTH_LONG).show()
            return
        }
        val filename = URLUtil.guessFileName(url, contentDisposition, mimeType)
        val request = DownloadManager.Request(url.toUri())
            .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
            .addRequestHeader("User-Agent", userAgent)
            .setMimeType(mimeType)
            .setTitle(filename)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
        getSystemService(DownloadManager::class.java).enqueue(request)
        Toast.makeText(this, getString(R.string.download_started, filename), Toast.LENGTH_SHORT).show()
    }

    // onRenderProcessGone is implemented below; the androidx.webkit lint check still reports it.
    @SuppressLint("MissingOnRenderProcessGone")
    private inner class NonoWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            return when (policy.classify(url)) {
                Destination.IN_APP -> false
                Destination.BROWSER, Destination.SYSTEM -> { openOutside(url); true }
                Destination.BLOCKED -> true
            }
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            progress.isVisible = true
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            applyWindowChrome()
            samplePageColors()
        }

        // Single-page apps change the address without loading a new page.
        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            lastUrl = url
            applyWindowChrome()
            view.postDelayed({ samplePageColors() }, 300)
        }

        override fun onPageFinished(view: WebView, url: String) {
            applyWindowChrome()
            samplePageColors()
            lastUrl = url
            progress.isVisible = false
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showError(getString(R.string.error_network, error.description))
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            // The gateway answers 502/503/504 with JSON while NoNo restarts or is in maintenance.
            if (request.isForMainFrame && response.statusCode >= 500) {
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
            showError(getString(R.string.error_certificate))
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
