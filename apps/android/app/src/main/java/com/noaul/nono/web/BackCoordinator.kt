package com.noaul.nono.web

/**
 * Back presses go to the page first while it reports an open layer (dialog, panel, menu); the page
 * answers with `ui.backResult`. Only an explicit "not handled" falls back to history or leaving the
 * app. A missing answer releases the gesture without a history step, so a page that closed its
 * layer but replied late never causes a second, unwanted back.
 */
class BackCoordinator(
    private val send: (requestId: String) -> Unit,
    private val fallback: () -> Unit,
    private val schedule: (delayMs: Long, action: () -> Unit) -> Unit,
    private val newRequestId: () -> String,
) {
    /** Set from the page's `ui.backState` message. */
    var pageCanHandle = false
    private var pending: String? = null

    fun onBack() {
        if (pending != null) return
        if (!pageCanHandle) {
            fallback()
            return
        }
        val requestId = newRequestId()
        pending = requestId
        send(requestId)
        schedule(TIMEOUT_MS) { if (pending == requestId) pending = null }
    }

    fun onResult(requestId: String, handled: Boolean) {
        if (pending != requestId) return
        pending = null
        if (!handled) fallback()
    }

    /** A new document must announce its own layers again. */
    fun reset() {
        pending = null
        pageCanHandle = false
    }

    companion object {
        const val TIMEOUT_MS = 500L
    }
}
