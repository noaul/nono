package com.noaul.nono

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CssColorTest {
    @Test
    fun parsesComputedStyleColours() {
        assertEquals(0xFFF8FAFC.toInt(), parseCssColor("rgb(248, 250, 252)"))
        assertEquals(0xFF0B1120.toInt(), parseCssColor("rgba(11, 17, 32, 0.9)"))
        assertEquals(0xFF0D9488.toInt(), parseCssColor("rgb(13 148 136 / 50%)"))
        assertNull(parseCssColor("rgba(0, 0, 0, 0)"))
        assertNull(parseCssColor("transparent"))
        assertNull(parseCssColor(""))
        assertNull(parseCssColor(null))
    }

    @Test
    fun choosesIconContrast() {
        assertTrue(isLightColor(0xFFFFFFFF.toInt()))
        assertTrue(isLightColor(0xFFF8FAFC.toInt()))
        assertFalse(isLightColor(0xFF0B1120.toInt()))
        assertFalse(isLightColor(0xFF1E293B.toInt()))
    }
}
