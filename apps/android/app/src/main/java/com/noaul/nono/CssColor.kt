package com.noaul.nono

/** Parses the `rgb(r, g, b)` / `rgba(r, g, b, a)` strings getComputedStyle returns into an opaque ARGB int. */
fun parseCssColor(value: String?): Int? {
    val match = Regex("""rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)""").matchEntire(value?.trim() ?: return null) ?: return null
    val (r, g, b) = match.destructured.toList().take(3).map { it.toInt().coerceIn(0, 255) }
    val alpha = match.groupValues[4].takeIf { it.isNotEmpty() }?.let { if (it.endsWith('%')) it.dropLast(1).toFloat() / 100 else it.toFloat() } ?: 1f
    if (alpha <= 0f) return null
    return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
}

/** True when dark icons are readable on this colour (WCAG relative luminance above the midpoint). */
fun isLightColor(color: Int): Boolean {
    fun channel(shift: Int): Double {
        val c = ((color shr shift) and 0xFF) / 255.0
        return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0) > 0.179
}
