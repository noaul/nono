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
    fun capturePathNeverIncludesSharedContent() {
        assertEquals("/mobile/capture", sharedLinkPath(SharedLink("https://example.com/?secret=token", "Private title")))
    }

    @Test
    fun rejectsOversizeOrMalformedInputInsteadOfTruncatingIt() {
        assertNull(parseSharedLink("https://example.com/ " + "a".repeat(16384), null))
        assertNull(parseSharedLink("https://example.com/ " + "中".repeat(6000), null))
        assertNull(parseSharedLink("https://", null))
        assertNull(parseSharedLink("https://user:password@example.com/", null))
    }
}
