package com.noaul.nono.capture

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.noaul.nono.SharedLink
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PendingCaptureStoreTest {
    @Test fun survivesRecreationExpiresAndOnlyMatchingAckClears() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val prefs = context.getSharedPreferences("capture-test", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        var now = 1000L
        val store = PendingCaptureStore(prefs) { now }
        val first = store.save(SharedLink("https://example.com/private", "标题"))
        assertEquals(first, PendingCaptureStore(prefs) { now }.get())
        assertFalse(store.acknowledge("old-request"))
        assertEquals(first, store.get())
        now += 24 * 60 * 60 * 1000L
        assertNull(store.get())
        val next = store.save(SharedLink("https://example.com/next", null))
        assertFalse(store.acknowledge(first.requestId))
        assertTrue(store.acknowledge(next.requestId))
        assertNull(store.get())
    }
}
