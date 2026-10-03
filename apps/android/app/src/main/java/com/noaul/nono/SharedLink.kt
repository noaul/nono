package com.noaul.nono

import java.net.URI

data class SharedLink(val url: String, val title: String?)

private val urlPattern = Regex("""https?://[^\s<>"'“”‘’（）【】]+""", RegexOption.IGNORE_CASE)
private const val MAX_SHARED_TEXT = 16 * 1024

/**
 * Picks the first web link out of text shared from another app, e.g. "Some title https://…" from a
 * browser or a chat message. The subject, or the text around the link, becomes the suggested name.
 */
fun parseSharedLink(text: String?, subject: String?): SharedLink? {
    val body = text ?: return null
    if (body.toByteArray(Charsets.UTF_8).size > MAX_SHARED_TEXT || (subject?.toByteArray(Charsets.UTF_8)?.size ?: 0) > MAX_SHARED_TEXT) return null
    val match = urlPattern.find(body) ?: return null
    val url = match.value.trimEnd('.', ',', ';', ':', '!', '?', ')', ']', '。', '，', '；', '！', '？')
    if (url.length > 4096) return null
    val uri = runCatching { URI(url) }.getOrNull() ?: return null
    if (uri.host.isNullOrBlank() || uri.userInfo != null) return null
    val rest = body.replace(urlPattern, " ").replace(Regex("\\s+"), " ").trim().trim('-', '|', '—', ':', '：').trim()
    val title = subject?.trim()?.takeIf { it.isNotEmpty() } ?: rest.takeIf { it.isNotEmpty() }
    return SharedLink(url, title?.take(200))
}

/** Shared content is delivered through the trusted bridge, never through browser history. */
@Suppress("UNUSED_PARAMETER")
fun sharedLinkPath(link: SharedLink): String = "/mobile/capture"
