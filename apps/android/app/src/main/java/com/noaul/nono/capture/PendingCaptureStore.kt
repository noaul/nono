package com.noaul.nono.capture

import android.content.SharedPreferences
import android.annotation.SuppressLint
import androidx.core.content.edit
import com.noaul.nono.SharedLink
import org.json.JSONObject
import java.util.UUID

data class PendingCapture(val requestId: String, val url: String, val title: String?)

/** App-private, excluded from Android backup. Reading always enforces the 24-hour deadline. */
class PendingCaptureStore(private val preferences: SharedPreferences, private val now: () -> Long = System::currentTimeMillis) {
    @SuppressLint("UseKtx") // The commit result is needed before acknowledging durable storage.
    fun save(link: SharedLink): PendingCapture {
        val capture = PendingCapture(UUID.randomUUID().toString(), link.url, link.title)
        val json = JSONObject().put("requestId", capture.requestId).put("url", capture.url)
            .put("title", capture.title ?: JSONObject.NULL).put("createdAt", now())
        check(preferences.edit().putString("pending", json.toString()).commit()) { "Cannot persist capture" }
        return capture
    }

    fun get(): PendingCapture? {
        val raw = preferences.getString("pending", null) ?: return null
        val result = runCatching {
            val json = JSONObject(raw)
            val age = now() - json.getLong("createdAt")
            require(age in 0 until 24 * 60 * 60 * 1000L)
            PendingCapture(json.getString("requestId"), json.getString("url"), if (json.isNull("title")) null else json.getString("title"))
        }.getOrNull()
        if (result == null) clear()
        return result
    }

    fun acknowledge(requestId: String): Boolean {
        if (get()?.requestId != requestId) return false
        clear()
        return true
    }

    fun clear() { preferences.edit(commit = true) { remove("pending") } }
}
