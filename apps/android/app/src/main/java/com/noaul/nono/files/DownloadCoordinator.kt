package com.noaul.nono.files

import java.io.IOException
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** Downloads only allowlisted GET exports. Redirects are validated before obtaining cookies or connecting. */
class DownloadCoordinator(
    private val policy: DownloadPolicy,
    private val cookies: (String) -> String?,
    private val connect: (String) -> HttpURLConnection = { URL(it).openConnection() as HttpURLConnection },
    private val maxBytes: Long = 256L * 1024 * 1024,
) {
    @Volatile private var canceled = false
    @Volatile private var connection: HttpURLConnection? = null

    fun cancel() { canceled = true; connection?.disconnect() }
    private fun checkCanceled() { if (canceled || Thread.currentThread().isInterrupted) throw IOException("Download canceled") }

    /** The document is created by SAF before this call, so even open failures need cleanup. */
    fun save(initialUrl: String, open: () -> OutputStream, deletePartial: () -> Unit,
             progress: (Long, Long) -> Unit = { _, _ -> }) {
        try {
            checkCanceled()
            open().use { transfer(initialUrl, it, progress) }
        } catch (error: Exception) {
            runCatching(deletePartial)
            throw error
        }
    }

    fun transfer(initialUrl: String, output: OutputStream, progress: (Long, Long) -> Unit = { _, _ -> }) {
        var url = initialUrl
        repeat(6) { hop ->
            checkCanceled()
            if (!policy.allows(url)) throw IOException("Download address is not allowed")
            val current = connect(url)
            connection = current
            try {
                current.instanceFollowRedirects = false
                current.connectTimeout = 15000
                current.readTimeout = 15000
                current.requestMethod = "GET"
                current.setRequestProperty("Accept-Encoding", "identity")
                cookies(url)?.takeIf { it.isNotBlank() }?.let { current.setRequestProperty("Cookie", it) }
                checkCanceled()
                val status = current.responseCode
                if (status in listOf(301, 302, 303, 307, 308)) {
                    if (hop == 5) throw IOException("Too many redirects")
                    val location = current.getHeaderField("Location") ?: throw IOException("Missing redirect address")
                    url = runCatching { URI(url).resolve(location).toString() }.getOrElse { throw IOException("Invalid redirect address") }
                    // Next iteration validates before opening the next connection or copying cookies.
                } else {
                    if (!policy.acceptsResponse(status, current.getHeaderField("Content-Type"), current.getHeaderField("Content-Disposition"))) throw IOException("Server did not return an export (HTTP $status)")
                    val total = current.contentLengthLong
                    if (total > maxBytes) throw IOException("Export exceeds 256 MiB; use your browser")
                    var written = 0L
                    current.inputStream.use { input ->
                        val buffer = ByteArray(32 * 1024)
                        while (true) {
                            checkCanceled()
                            val count = input.read(buffer)
                            if (count < 0) break
                            checkCanceled()
                            if (written + count > maxBytes) throw IOException("Export exceeds 256 MiB; use your browser")
                            output.write(buffer, 0, count)
                            written += count
                            progress(written, total)
                        }
                    }
                    checkCanceled()
                    if (total >= 0 && written != total) throw IOException("Incomplete export")
                    output.flush()
                    return
                }
            } finally {
                current.disconnect()
                connection = null
            }
        }
    }
}
