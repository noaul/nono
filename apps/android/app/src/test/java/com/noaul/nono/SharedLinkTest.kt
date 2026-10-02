package com.noaul.nono

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SharedLinkTest {
    @Test
    fun browserShareUsesTheSubjectAsTitle() {
        assertEquals(
            SharedLink("https://example.com/post?id=1", "Example post"),
            parseSharedLink("https://example.com/post?id=1", "Example post"),
        )
    }

    @Test
    fun chatShareTakesTheFirstLinkAndSurroundingText() {
        assertEquals(
            SharedLink("https://b23.tv/abc", "【好看的视频】"),
            parseSharedLink("【好看的视频】 https://b23.tv/abc。", null),
        )
        assertEquals(
            SharedLink("https://a.example/x", "看这个 还有"),
            parseSharedLink("看这个 https://a.example/x, 还有 https://b.example/y", " "),
        )
    }

    @Test
    fun ignoresTextWithoutAWebLink() {
        assertNull(parseSharedLink("just words", null))
        assertNull(parseSharedLink("ftp://example.com/file", null))
        assertNull(parseSharedLink(null, "title"))
    }

    @Test
    fun buildsAnEncodedBookmarkPath() {
        assertEquals(
            "/admin/links?share_url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2&share_title=%E6%A0%87%E9%A2%98%20A",
            sharedLinkPath(SharedLink("https://example.com/a?b=1&c=2", "标题 A")),
        )
        assertEquals("/admin/links?share_url=https%3A%2F%2Fx.test%2F", sharedLinkPath(SharedLink("https://x.test/", null)))
    }
}
