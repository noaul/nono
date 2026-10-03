package com.noaul.nono

import android.content.Intent
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MainActivityTest {
    private val base = BuildConfig.BASE_URL

    private fun launch(intent: Intent = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)) =
        ActivityScenario.launch<MainActivity>(intent)

    private fun webViewOf(activity: MainActivity) = activity.findViewById<WebView>(R.id.web_view)

    @Test
    fun opensTheLoginPageThatForwardsToNoDeskOnLaunch() {
        launch().use { scenario ->
            scenario.onActivity { assertEquals("$base/login?next=%2Fnodesk%2F", shadowOf(webViewOf(it)).lastLoadedUrl) }
        }
    }

    @Test
    fun sharedLinkOpensPrivateCapturePage() {
        val share = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)
            .setAction(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "好文 https://example.com/a?b=1")
        launch(share).use { scenario ->
            scenario.onActivity {
                assertEquals(
                    "$base/mobile/capture",
                    shadowOf(webViewOf(it)).lastLoadedUrl,
                )
            }
        }
    }

    @Test
    fun shareWithoutALinkStillOpensTheEntryPage() {
        val share = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)
            .setAction(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "no link here")
        launch(share).use { scenario ->
            scenario.onActivity { assertEquals("$base/login?next=%2Fnodesk%2F", shadowOf(webViewOf(it)).lastLoadedUrl) }
        }
    }

    @Test
    fun externalLinksLeaveTheAppAndDangerousOnesGoNowhere() {
        launch().use { scenario ->
            scenario.onActivity { activity ->
                val webView = webViewOf(activity)
                val client = shadowOf(webView).webViewClient
                val app = shadowOf(activity.application)

                assertEquals(false, client.shouldOverrideUrlLoading(webView, request("$base/nomoney/")))
                assertNull(app.nextStartedActivity)

                assertEquals(true, client.shouldOverrideUrlLoading(webView, request("https://github.com/noaul/nono")))
                val started = app.nextStartedActivity
                assertEquals(Intent.ACTION_VIEW, started.action)
                assertEquals("https://github.com/noaul/nono", started.dataString)

                assertEquals(true, client.shouldOverrideUrlLoading(webView, request("javascript:alert(1)")))
                assertNull(app.nextStartedActivity)
            }
        }
    }

    @Test
    fun recreationDoesNotCreateANewCaptureOrRestoreFormState() {
        val share = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)
            .setAction(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "https://example.com/private?key=secret")
        var requestId: String? = null
        launch(share).use { scenario ->
            scenario.onActivity {
                val store = com.noaul.nono.capture.PendingCaptureStore(it.getSharedPreferences("pending-capture", 0))
                requestId = store.get()!!.requestId
            }
            scenario.recreate()
            scenario.onActivity {
                val store = com.noaul.nono.capture.PendingCaptureStore(it.getSharedPreferences("pending-capture", 0))
                assertEquals(requestId, store.get()!!.requestId)
                assertEquals("$base/mobile/capture", shadowOf(webViewOf(it)).lastLoadedUrl)
            }
        }
    }

    @Test
    fun restartRestoresOnlySafeGetPathWithoutQueryOrFormData() {
        launch().use { scenario ->
            scenario.onActivity {
                shadowOf(webViewOf(it)).webViewClient.onPageFinished(webViewOf(it), "$base/nomoney/domains?secret=private")
            }
        }
        launch().use { scenario ->
            scenario.onActivity { assertEquals("$base/nomoney/domains", shadowOf(webViewOf(it)).lastLoadedUrl) }
        }
    }

    private fun request(url: String) = object : android.webkit.WebResourceRequest {
        override fun getUrl() = android.net.Uri.parse(url)
        override fun isForMainFrame() = true
        override fun isRedirect() = false
        override fun hasGesture() = true
        override fun getMethod() = "GET"
        override fun getRequestHeaders() = emptyMap<String, String>()
    }

    @Test
    fun backOnTheFirstPageLeavesBackHandlingOnForWhenTheUserReturns() {
        launch().use { scenario ->
            scenario.onActivity { activity ->
                activity.onBackPressedDispatcher.onBackPressed()
                assertEquals(true, activity.onBackPressedDispatcher.hasEnabledCallbacks())
            }
        }
    }
}
