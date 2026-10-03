package com.noaul.nono.web

import org.junit.Assert.assertEquals
import org.junit.Test

class BackCoordinatorTest {
    private val sent = mutableListOf<String>()
    private var fallbacks = 0
    private val timers = mutableListOf<Pair<Long, () -> Unit>>()
    private var nextId = 0
    private val back = BackCoordinator(
        send = { sent += it },
        fallback = { fallbacks++ },
        schedule = { delay, action -> timers += delay to action },
        newRequestId = { "back-${++nextId}" },
    )

    @Test
    fun withoutAnOpenLayerTheAppGoesBackItself() {
        back.onBack()

        assertEquals(emptyList<String>(), sent)
        assertEquals(1, fallbacks)
    }

    @Test
    fun aPageThatClosesALayerConsumesTheBack() {
        back.pageCanHandle = true
        back.onBack()
        back.onResult("back-1", handled = true)

        assertEquals(listOf("back-1"), sent)
        assertEquals(0, fallbacks)
        assertEquals(BackCoordinator.TIMEOUT_MS, timers.single().first)
    }

    @Test
    fun aPageThatDeclinesFallsBackExactlyOnce() {
        back.pageCanHandle = true
        back.onBack()
        back.onResult("back-1", handled = false)
        back.onResult("back-1", handled = false)

        assertEquals(1, fallbacks)
    }

    @Test
    fun aTimeoutReleasesWithoutAnExtraHistoryStepAndLateRepliesAreDropped() {
        back.pageCanHandle = true
        back.onBack()
        timers.single().second()
        back.onResult("back-1", handled = false)

        assertEquals(0, fallbacks)
        back.onBack()
        assertEquals(listOf("back-1", "back-2"), sent)
    }

    @Test
    fun extraPressesWhileWaitingAreIgnoredAndANewPageForgetsTheOldState() {
        back.pageCanHandle = true
        back.onBack()
        back.onBack()
        assertEquals(listOf("back-1"), sent)

        back.reset()
        back.onBack()
        assertEquals(1, fallbacks)
    }
}
