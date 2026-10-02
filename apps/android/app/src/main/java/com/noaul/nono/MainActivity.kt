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
    private val homeUrl get() = policy.resolve("/nodesk/")

    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorPanel: View
    private lateinit var errorMessage: TextView

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

        val root = findViewById<View>(R.id.root)
        webView = findViewById(R.id.web_view)
        progress = findViewById(R.id.progress)
        errorPanel = findViewById(R.id.error_panel)
        errorMessage = findViewById(R.id.error_message)
        findViewById<Button>(R.id.retry).setOnClickListener { retry() }

        // One layer consumes the system bars, cutout and keyboard, so web pages need no extra padding
        // and inputs stay above the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime(),
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
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

        override fun onPageFinished(view: WebView, url: String) {
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
