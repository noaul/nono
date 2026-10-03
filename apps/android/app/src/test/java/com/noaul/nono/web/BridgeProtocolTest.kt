package com.noaul.nono.web

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// org.json needs the Android runtime; SDK 35 matches MainActivityTest (36 would need Java 21).
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BridgeProtocolTest {
    private val origin = "https://noaul.com"
    private fun message(type: String = "ui.backState", requestId: String = "req-1", v: Int = 1) =
        JSONObject().put("v", v).put("requestId", requestId).put("type", type).put("payload", JSONObject().put("canHandle", true)).toString()

    @Test
    fun acceptsAKnownMessageFromTheTrustedMainFrame() {
        val parsed = BridgeProtocol.parse(message(), origin, origin, isMainFrame = true)

        assertNotNull(parsed)
        assertEquals("ui.backState", parsed!!.type)
        assertEquals("req-1", parsed.requestId)
        assertEquals(true, parsed.payload.getBoolean("canHandle"))
    }

    @Test
    fun rejectsOtherOriginsSubframesUnknownTypesAndOtherVersions() {
        assertNull(BridgeProtocol.parse(message(), "https://evil.example", origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse(message(), "https://noaul.com.evil.example", origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse(message(), origin, origin, isMainFrame = false))
        assertNull(BridgeProtocol.parse(message(type = "shell.exec"), origin, origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse(message(v = 2), origin, origin, isMainFrame = true))
    }

    @Test
    fun rejectsMalformedOversizedAndBadRequestIds() {
        assertNull(BridgeProtocol.parse("not json", origin, origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse(null, origin, origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse("x".repeat(BridgeProtocol.MAX_LENGTH + 1), origin, origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse(message(requestId = ""), origin, origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse(message(requestId = "a b"), origin, origin, isMainFrame = true))
        assertNull(BridgeProtocol.parse(message(requestId = "x".repeat(65)), origin, origin, isMainFrame = true))
    }

    @Test
    fun encodesTheSameEnvelopeItParses() {
        val encoded = JSONObject(BridgeProtocol.encode("ui.back", "req-9", JSONObject().put("a", 1)))

        assertEquals(1, encoded.getInt("v"))
        assertEquals("ui.back", encoded.getString("type"))
        assertEquals("req-9", encoded.getString("requestId"))
        assertEquals(1, encoded.getJSONObject("payload").getInt("a"))
    }
}
