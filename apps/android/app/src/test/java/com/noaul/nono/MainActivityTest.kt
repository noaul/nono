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
    fun sharedLinkOpensThePrefilledBookmarkEditor() {
        val share = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)
            .setAction(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "好文 https://example.com/a?b=1")
        launch(share).use { scenario ->
            scenario.onActivity {
                assertEquals(
                    "$base/admin/links?share_url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1&share_title=%E5%A5%BD%E6%96%87",
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
