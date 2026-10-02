package com.noaul.nono

import java.net.URI

/** Where a navigation from inside the WebView is allowed to go. */
enum class Destination { IN_APP, BROWSER, SYSTEM, BLOCKED }

/**
 * Only the NoNo origin itself loads inside the app, so the login cookie never reaches another site.
 * Other web links open in the system browser; mail/phone links go to their apps; anything else
 * (javascript:, file:, intent:, data:) is refused.
 */
class NavigationPolicy(baseUrl: String) {
    private val base = URI(baseUrl)
    private val scheme = base.scheme.lowercase()
    private val host = base.host.lowercase()
    private val port = effectivePort(base.scheme, base.port)

    fun classify(raw: String): Destination {
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return Destination.BLOCKED
        val uriScheme = uri.scheme?.lowercase() ?: return Destination.BLOCKED
        return when (uriScheme) {
            "http", "https" -> when {
                uri.host == null -> Destination.BLOCKED
                isSameOrigin(uri) -> Destination.IN_APP
                uri.rawUserInfo != null -> Destination.BLOCKED
                else -> Destination.BROWSER
            }
            "mailto", "tel", "sms" -> Destination.SYSTEM
            else -> Destination.BLOCKED
        }
    }

    fun isSameOrigin(raw: String): Boolean = runCatching { isSameOrigin(URI(raw.trim())) }.getOrDefault(false)

    fun resolve(path: String): String = base.resolve(path).toString()

    /**
     * The NoDesk home is a full-bleed wallpaper and positions its controls with the injected
     * safe-area variables, so it is drawn under the status and gesture bars. Every other page keeps
     * its content clear of them.
     */
    fun isEdgeToEdge(raw: String?): Boolean {
        val uri = raw?.let { runCatching { URI(it.trim()) }.getOrNull() } ?: return false
        if (uri.host == null || !isSameOrigin(uri)) return false
        return (uri.rawPath ?: "").trimEnd('/') == "/nodesk"
    }

    private fun isSameOrigin(uri: URI): Boolean =
        uri.scheme.equals(scheme, ignoreCase = true) &&
            uri.host.equals(host, ignoreCase = true) &&
            uri.rawUserInfo == null &&
            effectivePort(uri.scheme, uri.port) == port

    private fun effectivePort(scheme: String, port: Int) = when {
        port != -1 -> port
        scheme.equals("https", ignoreCase = true) -> 443
        else -> 80
    }
}
