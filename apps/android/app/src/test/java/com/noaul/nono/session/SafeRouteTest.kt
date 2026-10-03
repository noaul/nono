package com.noaul.nono.session

import org.junit.Assert.*
import org.junit.Test

class SafeRouteTest {
    private val routes = SafeRoute("https://noaul.com")
    @Test fun restoresOnlyAppGetRoutesAndDropsQueryAndFragment() {
        assertEquals("https://noaul.com/nomoney/domains", routes.restore("https://noaul.com/nomoney/domains?private=secret#form"))
        assertEquals("https://noaul.com/nodesk/", routes.restore("https://noaul.com/nodesk/"))
        listOf("/blog", "/api/export", "/nomoney/api/expenses", "/yumi/%61pi/logout", "/login", "/mobile/capture", "/unknown/mutation", "/nomoney/../api/logout", "//evil.example/nodesk").forEach {
            assertNull(it, routes.restore("https://noaul.com$it"))
        }
        assertNull(routes.restore("https://evil.example/nodesk"))
    }
}
