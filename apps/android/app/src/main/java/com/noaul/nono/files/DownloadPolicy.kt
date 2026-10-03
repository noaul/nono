package com.noaul.nono.files

import com.noaul.nono.NavigationPolicy
import java.net.URI

class DownloadPolicy(baseUrl: String) {
    private val navigation = NavigationPolicy(baseUrl)
    fun allows(raw: String): Boolean {
        val uri = runCatching { URI(raw) }.getOrNull() ?: return false
        if (!uri.scheme.equals("https", true) || !navigation.isSameOrigin(raw) || uri.rawQuery != null || uri.rawFragment != null) return false
        val path = uri.rawPath ?: return false
        if ('%' in path || '\\' in path || path.split('/').any { it == "." || it == ".." }) return false
        return path == "/api/admin/bookmarks/export" ||
            Regex("^/api/admin/backups/[A-Za-z0-9_.-]+/download$").matches(path) ||
            Regex("^/api/admin/backup-center/jobs/[A-Za-z0-9_-]+/download$").matches(path) ||
            Regex("^/(nomoney|yumi)/api/(phones|vps|domains|subscriptions|expenses)/export\\.csv$").matches(path)
    }

    fun filename(raw: String): String = raw.replace('\\', '/').substringAfterLast('/')
        .filter { it >= ' ' && it != '\u007f' && it !in ":*?\"<>|" }.trim().trim('.').take(160).ifBlank { "nono-export" }

    fun acceptsResponse(status: Int, contentType: String?, disposition: String?): Boolean {
        if (status != 200 || disposition == null || !disposition.trim().startsWith("attachment", ignoreCase = true)) return false
        val type = contentType?.substringBefore(';')?.trim()?.lowercase() ?: return false
        return type in setOf("application/json", "text/json", "text/csv", "application/csv", "application/zip", "application/gzip", "application/x-gzip", "application/x-tar", "application/octet-stream", "text/html")
    }
}
