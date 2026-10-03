package com.noaul.nono.files

import org.junit.Assert.*
import org.junit.Test

class DownloadPolicyTest {
    private val policy = DownloadPolicy("https://noaul.com")
    @Test fun allowsOnlyKnownExportsAndRejectsTraversalOtherOriginsAndLogin() {
        assertTrue(policy.allows("https://noaul.com/api/admin/backups/a.tar.gz/download"))
        assertTrue(policy.allows("https://noaul.com:443/api/admin/bookmarks/export"))
        assertTrue(policy.allows("https://noaul.com/nomoney/api/subscriptions/export.csv"))
        assertTrue(policy.allows("https://noaul.com/yumi/api/vps/export.csv"))
        assertTrue(policy.allows("https://noaul.com/yumi/api/domains/export.csv"))
        listOf("http://noaul.com/api/admin/bookmarks/export", "https://evil.example/api/admin/bookmarks/export", "https://noaul.com@login.evil/api/admin/bookmarks/export", "https://noaul.com/login", "https://noaul.com/api/admin/backups/../download", "https://noaul.com/api/admin/backups/%2e%2e/download", "https://noaul.com/api/admin/bookmarks/export?token=secret").forEach { assertFalse(it, policy.allows(it)) }
    }
    @Test fun sanitizesFilenameAndRejectsHtmlLoginResponse() {
        assertEquals("backup.zip", policy.filename("../../backup.zip"))
        assertEquals("safe.json", policy.filename("C:\\folder\\safe.json"))
        assertFalse(policy.acceptsResponse(401, "text/html", "attachment; filename=login.html"))
        assertFalse(policy.acceptsResponse(200, "text/html", null))
        assertTrue(policy.acceptsResponse(200, "text/html; charset=utf-8", "attachment; filename=bookmarks.html"))
        assertTrue(policy.acceptsResponse(200, "application/zip", "attachment; filename=backup.zip"))
    }
}
