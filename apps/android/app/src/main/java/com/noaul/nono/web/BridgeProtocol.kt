package com.noaul.nono.web

import org.json.JSONObject

/**
 * Version 1 of the page ↔ app protocol: `{v:1, requestId, type, payload}` as a JSON string.
 * A message is only acted on when it comes from the exact NoNo origin in the main frame, is small,
 * and has a known type; everything else is dropped without a reply.
 */
object BridgeProtocol {
    const val VERSION = 1
    const val MAX_LENGTH = 16 * 1024
    private val REQUEST_ID = Regex("^[A-Za-z0-9_-]{1,64}$")

    /** What a page may send to the app. */
    val INBOUND = setOf("bridge.hello", "ui.backState", "ui.backResult", "capture.request", "capture.saved", "capture.dismissed", "download.request", "session.clear")

    data class Message(val type: String, val requestId: String, val payload: JSONObject)

    fun parse(raw: String?, sourceOrigin: String, trustedOrigin: String, isMainFrame: Boolean): Message? {
        if (raw == null || raw.length > MAX_LENGTH || !isMainFrame || sourceOrigin != trustedOrigin) return null
        val json = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        if (json.optInt("v", -1) != VERSION) return null
        val type = json.optString("type")
        val requestId = json.optString("requestId")
        if (type !in INBOUND || !REQUEST_ID.matches(requestId)) return null
        return Message(type, requestId, json.optJSONObject("payload") ?: JSONObject())
    }

    fun encode(type: String, requestId: String, payload: JSONObject = JSONObject()): String =
        JSONObject().put("v", VERSION).put("requestId", requestId).put("type", type).put("payload", payload).toString()
}
