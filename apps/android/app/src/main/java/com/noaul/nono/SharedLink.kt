package com.noaul.nono

import java.net.URLEncoder

data class SharedLink(val url: String, val title: String?)

private val urlPattern = Regex("""https?://[^\s<>"'“”‘’（）【】]+""", RegexOption.IGNORE_CASE)
private const val MAX_SHARED_TEXT = 16 * 1024

/**
 * Picks the first web link out of text shared from another app, e.g. "Some title https://…" from a
 * browser or a chat message. The subject, or the text around the link, becomes the suggested name.
 */
fun parseSharedLink(text: String?, subject: String?): SharedLink? {
    val body = text?.take(MAX_SHARED_TEXT) ?: return null
    val match = urlPattern.find(body) ?: return null
    val url = match.value.trimEnd('.', ',', ';', ':', '!', '?', ')', ']', '。', '，', '；', '！', '？')
    if (url.length > 4096) return null
    val rest = body.replace(urlPattern, " ").replace(Regex("\\s+"), " ").trim().trim('-', '|', '—', ':', '：').trim()
    val title = subject?.trim()?.takeIf { it.isNotEmpty() } ?: rest.takeIf { it.isNotEmpty() }
    return SharedLink(url, title?.take(200))
}

/** The bookmark page path that opens a prefilled "new bookmark" row. */
fun sharedLinkPath(link: SharedLink): String {
    fun encode(value: String) = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    val title = link.title?.let { "&share_title=${encode(it)}" } ?: ""
    return "/admin/links?share_url=${encode(link.url)}$title"
}
