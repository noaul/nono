package com.noaul.nono.session

import com.noaul.nono.NavigationPolicy
import java.net.URI

/** Only retain a GET page address; never persist query, fragment, form or POST state. */
class SafeRoute(private val origin: String) {
    private val policy = NavigationPolicy(origin)
    fun restore(raw: String?): String? {
        if (raw == null || !policy.isSameOrigin(raw)) return null
        val uri = runCatching { URI(raw) }.getOrNull() ?: return null
        val path = uri.path ?: return null
        val segments = path.split('/').filter { it.isNotEmpty() }
        if (segments.any { it.equals("api", ignoreCase = true) || it == "." || it == ".." } ||
            path.startsWith("//") || '\\' in path || path.any { it < ' ' }) return null
        val root = segments.firstOrNull()
        if (root != null && root !in setOf("nodesk", "nomoney", "yumi", "nostar", "admin")) return null
        return origin + uri.rawPath
    }
}
