package com.noaul.nono

import android.content.Intent
import android.webkit.CookieManager
import android.webkit.RoboCookieManager
import android.webkit.ValueCallback
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import com.noaul.nono.capture.PendingCaptureStore
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements

/** Delays only the asynchronous cookie-removal boundary, retaining Robolectric's cookie behavior. */
class DeferredCookies : RoboCookieManager() {
    private var completion: ValueCallback<Boolean>? = null
    override fun removeAllCookies(callback: ValueCallback<Boolean>?) { completion = callback }
    fun complete() { val callback = completion; completion = null; super.removeAllCookies(callback) }
}

@Implements(CookieManager::class)
class DeferredCookieManagerShadow {
    companion object {
        var manager = DeferredCookies()
        @JvmStatic @Implementation fun getInstance(): CookieManager = manager
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], shadows = [DeferredCookieManagerShadow::class])
class SessionCleanupTest {
    @Before fun resetCookies() { DeferredCookieManagerShadow.manager = DeferredCookies() }
    private val base = BuildConfig.BASE_URL
    private fun clear(activity: MainActivity) {
        MainActivity::class.java.getDeclaredMethod("clearSession").apply { isAccessible = true }.invoke(activity)
    }

    private fun share(activity: MainActivity) {
        val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "https://example.com/new")
        MainActivity::class.java.getDeclaredMethod("onNewIntent", Intent::class.java).apply { isAccessible = true }.invoke(activity, intent)
    }

    @Test fun shareDuringCookieCleanupIsDeferredThenOpenedAndOldPageCannotRestoreItsRoute() {
        ActivityScenario.launch<MainActivity>(Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)).use { scenario ->
            scenario.onActivity { activity ->
                val view = activity.findViewById<WebView>(R.id.web_view)
                val oldClient = shadowOf(view).webViewClient
                val prefs = activity.getSharedPreferences("safe-route", 0)
                view.loadUrl("$base/nomoney/domains")
                oldClient.onPageFinished(view, "$base/nomoney/domains")
                clear(activity)
                share(activity)
                val capture = PendingCaptureStore(activity.getSharedPreferences("pending-capture", 0)).get()!!
                assertNotEquals("$base/mobile/capture", shadowOf(view).lastLoadedUrl)
                oldClient.onPageFinished(view, "$base/nomoney/domains")
                assertNull(prefs.getString("resume_url", null))
                DeferredCookieManagerShadow.manager.complete()
                assertEquals("$base/mobile/capture", shadowOf(view).lastLoadedUrl)
                oldClient.doUpdateVisitedHistory(view, "$base/nomoney/domains", false)
                oldClient.onPageFinished(view, "$base/nomoney/domains")
                assertNull(prefs.getString("resume_url", null))
                assertEquals(capture, PendingCaptureStore(activity.getSharedPreferences("pending-capture", 0)).get())
            }
        }
    }

    @Test fun staleSecondClearDuringCleanupCannotEraseANewerShare() {
        ActivityScenario.launch<MainActivity>(Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)).use { scenario ->
            scenario.onActivity { activity ->
                clear(activity)
                share(activity)
                clear(activity)
                assertNotNull(PendingCaptureStore(activity.getSharedPreferences("pending-capture", 0)).get())
                DeferredCookieManagerShadow.manager.complete()
                assertEquals("$base/mobile/capture", shadowOf(activity.findViewById<WebView>(R.id.web_view)).lastLoadedUrl)
            }
        }
    }
}
