package com.noaul.nono.files

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.junit.Assert.*
import org.junit.Test

class DownloadCoordinatorTest {
    private val initial = "https://noaul.com/api/admin/bookmarks/export"
    private class Response(url: String, private val status: Int = 200, private val headers: Map<String, String> = mapOf("Content-Type" to "application/json", "Content-Disposition" to "attachment; filename=backup.json"), private val bytes: ByteArray = "{}".toByteArray()) : HttpURLConnection(URL(url)) {
        var disconnected = false
        override fun connect() {}
        override fun disconnect() { disconnected = true }
        override fun usingProxy() = false
        override fun getResponseCode() = status
        override fun getHeaderField(name: String?) = headers[name]
        override fun getInputStream() = ByteArrayInputStream(bytes)
        override fun getContentLengthLong() = headers["Content-Length"]?.toLong() ?: -1
    }
    @Test fun stopsBeforeConnectingToCrossOriginRedirect() {
        val response = Response(initial, 302, mapOf("Location" to "https://evil.example/steal"))
        val visited = mutableListOf<String>()
        val downloader = DownloadCoordinator(DownloadPolicy("https://noaul.com"), { "session=secret" }, { url -> visited.add(url); response })
        assertThrows(IOException::class.java) { downloader.transfer(initial, ByteArrayOutputStream()) }
        assertEquals(listOf(initial), visited)
        assertEquals("session=secret", response.getRequestProperty("Cookie"))
        assertFalse(response.instanceFollowRedirects)
        assertTrue(response.disconnected)
    }
    @Test fun limitsUnknownLengthStreamAndCancellation() {
        val response = Response(initial, bytes = ByteArray(10))
        val downloader = DownloadCoordinator(DownloadPolicy("https://noaul.com"), { null }, { response }, maxBytes = 5)
        val output = ByteArrayOutputStream()
        assertThrows(IOException::class.java) { downloader.transfer(initial, output) }
        assertEquals(0, output.size())
        val canceled = DownloadCoordinator(DownloadPolicy("https://noaul.com"), { null }, { error("must not connect") })
        canceled.cancel()
        assertThrows(IOException::class.java) { canceled.transfer(initial, output) }
    }
    @Test fun streamsValidExportAndRejectsTruncatedBody() {
        val good = Response(initial)
        val output = ByteArrayOutputStream()
        DownloadCoordinator(DownloadPolicy("https://noaul.com"), { null }, { good }).transfer(initial, output)
        assertEquals("{}", output.toString())
        val truncated = Response(initial, headers = mapOf("Content-Type" to "application/json", "Content-Disposition" to "attachment", "Content-Length" to "10"))
        assertThrows(IOException::class.java) { DownloadCoordinator(DownloadPolicy("https://noaul.com"), { null }, { truncated }).transfer(initial, ByteArrayOutputStream()) }
    }
    @Test fun failedDestinationWriteClosesAndDeletesPartialDocument() {
        var closed = false
        var removed = false
        val fullDisk = object : java.io.OutputStream() {
            override fun write(value: Int) { throw IOException("No space left") }
            override fun close() { closed = true }
        }
        val download = DownloadCoordinator(DownloadPolicy("https://noaul.com"), { null }, { Response(initial) })
        assertThrows(IOException::class.java) {
            download.save(initial, { fullDisk }, { removed = true })
        }
        assertTrue(closed)
        assertTrue(removed)
    }

    @Test fun failedDocumentOpenAlsoDeletesTheEmptyDocument() {
        var removed = false
        val download = DownloadCoordinator(DownloadPolicy("https://noaul.com"), { null }, { error("must not connect") })
        assertThrows(IOException::class.java) {
            download.save(initial, { throw IOException("Access lost") }, { removed = true })
        }
        assertTrue(removed)
    }

}
