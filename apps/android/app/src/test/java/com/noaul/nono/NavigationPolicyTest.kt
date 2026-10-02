package com.noaul.nono

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationPolicyTest {
    private val policy = NavigationPolicy("https://noaul.com")

    @Test
    fun onlyTheExactOriginLoadsInTheApp() {
        assertEquals(Destination.IN_APP, policy.classify("https://noaul.com/nodesk/"))
        assertEquals(Destination.IN_APP, policy.classify("https://NOAUL.com:443/nomoney/dashboard?x=1#y"))
        assertEquals(Destination.BROWSER, policy.classify("http://noaul.com/nodesk"))
        assertEquals(Destination.BROWSER, policy.classify("https://noaul.com:8443/"))
        assertEquals(Destination.BROWSER, policy.classify("https://noaul.com.evil.example/"))
        assertEquals(Destination.BROWSER, policy.classify("https://sub.noaul.com/"))
        assertEquals(Destination.BROWSER, policy.classify("https://github.com/noaul/nono"))
    }

    @Test
    fun credentialsInTheUrlAreNeverFollowed() {
        assertEquals(Destination.BLOCKED, policy.classify("https://noaul.com@evil.example/"))
        assertEquals(Destination.BLOCKED, policy.classify("https://user:pass@noaul.com/"))
    }

    @Test
    fun dangerousSchemesAreBlockedAndContactLinksGoToTheSystem() {
        for (url in listOf("javascript:alert(1)", "file:///sdcard/a", "intent://x#Intent;end", "data:text/html,hi", "content://x", "not a url", "")) {
            assertEquals(url, Destination.BLOCKED, policy.classify(url))
        }
        assertEquals(Destination.SYSTEM, policy.classify("mailto:me@example.com"))
        assertEquals(Destination.SYSTEM, policy.classify("tel:+8613800000000"))
    }

    @Test
    fun resolvesPathsAgainstTheBase() {
        assertEquals("https://noaul.com/nodesk/", policy.resolve("/nodesk/"))
        assertTrue(policy.isSameOrigin("https://noaul.com/api/export/json"))
        assertFalse(policy.isSameOrigin("blob:https://noaul.com/123"))
    }

    @Test
    fun debugServersKeepTheirPort() {
        val local = NavigationPolicy("http://10.0.2.2:3000")
        assertEquals(Destination.IN_APP, local.classify("http://10.0.2.2:3000/nodesk"))
        assertEquals(Destination.BROWSER, local.classify("http://10.0.2.2/nodesk"))
    }

    @Test
    fun wallpaperHomesAreEdgeToEdge() {
        assertTrue(policy.isEdgeToEdge("https://noaul.com/"))
        assertTrue(policy.isEdgeToEdge("https://noaul.com"))
        assertTrue(policy.isEdgeToEdge("https://noaul.com/noaul"))
        assertFalse(policy.isEdgeToEdge("https://noaul.com/login?next=%2Fnodesk%2F"))
        assertFalse(policy.isEdgeToEdge("https://noaul.com/privacy"))
        assertFalse(policy.isEdgeToEdge("https://noaul.com/admin"))
        assertFalse(policy.isEdgeToEdge("https://noaul.com/nostar/"))
        assertTrue(policy.isEdgeToEdge("https://noaul.com/nodesk"))
        assertTrue(policy.isEdgeToEdge("https://noaul.com/nodesk/?settings=backups"))
        assertFalse(policy.isEdgeToEdge("https://noaul.com/nodesk/blog/post"))
        assertFalse(policy.isEdgeToEdge("https://noaul.com/nomoney/dashboard"))
        assertFalse(policy.isEdgeToEdge("https://evil.example/nodesk"))
        assertFalse(policy.isEdgeToEdge(null))
    }
}
