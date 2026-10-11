package com.noaul.nono

import java.net.URI

data class SharedLink(val url: String, val title: String?)

// Printable ASCII except " ' < >. Chat apps glue links to Chinese text and full-width punctuation
// ("https://b23.tv/abc哔哩哔哩", "…/AbC，复制本条信息"), so the first non-ASCII character ends the link.
// Explicit ranges, and case folding only for the scheme: Android's ICU engine is Unicode-aware for
// \p{Graph} and case-insensitive classes, which would let some non-ASCII letters back in.
private val urlPattern = Regex("""(?i:https?)://[!#-&(-;=?-~]+""")
private const val MAX_SHARED_TEXT = 16 * 1024

/**
 * Picks the first web link out of text shared from another app, e.g. "Some title https://…" from a
 * browser or a chat message. The subject, or the text around the link, becomes the suggested name.
 */
fun parseSharedLink(text: String?, subject: String?): SharedLink? {
    val body = text ?: return null
    if (body.toByteArray(Charsets.UTF_8).size > MAX_SHARED_TEXT || (subject?.toByteArray(Charsets.UTF_8)?.size ?: 0) > MAX_SHARED_TEXT) return null
    val match = urlPattern.find(body) ?: return null
    val url = trimTrailingPunctuation(match.value)
    if (url.length > 4096) return null
    val uri = runCatching { URI(url) }.getOrNull() ?: return null
    if (uri.host.isNullOrBlank() || uri.userInfo != null) return null
    val rest = body.replace(urlPattern, " ").replace(Regex("\\s+"), " ").trim().trim('-', '|', '—', ':', '：', '。', '，', '；', '！', '？').trim()
    val title = subject?.trim()?.takeIf { it.isNotEmpty() } ?: rest.takeIf { it.isNotEmpty() }
    return SharedLink(url, title?.take(200))
}

/** Drops sentence punctuation after a link, and a closing bracket only when the link did not open it. */
private fun trimTrailingPunctuation(match: String): String {
    var url = match
    while (url.isNotEmpty()) {
        val last = url.last()
        val unbalanced = when (last) {
            ')' -> url.count { it == ')' } > url.count { it == '(' }
            ']' -> url.count { it == ']' } > url.count { it == '[' }
            else -> last in ".,;:!?"
        }
        if (!unbalanced) break
        url = url.dropLast(1)
    }
    return url
}

/** Shared content is delivered through the trusted bridge, never through browser history. */
@Suppress("UNUSED_PARAMETER")
fun sharedLinkPath(link: SharedLink): String = "/mobile/capture"
