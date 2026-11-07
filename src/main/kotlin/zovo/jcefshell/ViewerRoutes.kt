package zovo.jcefshell

import java.net.URI

/**
 * What the private origin http://zovo-viewer/ serves to one viewer page. Pure logic, so it is
 * tested without a browser: `/file` is the bytes of the open file, `/<name>.<ext>` is a bundled
 * resource under [resourceRoot], anything else (other hosts, sub-folders, `..`) is a 404.
 */
class ViewerRoutes(
    private val resourceRoot: String,
    private val loader: ClassLoader,
    private val fileBytes: () -> ByteArray?,
) {
    data class Response(val status: Int, val mime: String, val bytes: ByteArray) {
        val ok: Boolean get() = status == 200
    }

    fun resolve(url: String): Response {
        val uri = try { URI(url) } catch (_: Exception) { return NOT_FOUND }
        if (!"http".equals(uri.scheme, true) || !HOST.equals(uri.host, true)) return NOT_FOUND
        val path = uri.rawPath ?: return NOT_FOUND
        if (path == "/file") {
            val bytes = try { fileBytes() } catch (_: Exception) { null } ?: return NOT_FOUND
            return Response(200, "application/octet-stream", bytes)
        }
        val name = path.removePrefix("/")
        if (!SAFE_NAME.matches(name)) return NOT_FOUND
        val stream = loader.getResourceAsStream("${resourceRoot.trim('/')}/$name") ?: return NOT_FOUND
        val bytes = stream.use { it.readBytes() }
        return Response(200, mimeFor(name), bytes)
    }

    companion object {
        const val HOST = "zovo-viewer"
        const val ORIGIN = "http://$HOST"
        private val SAFE_NAME = Regex("[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*\\.(html|js|mjs|css|wasm|svg|png|json|woff2)")
        @JvmField val NOT_FOUND = Response(404, "text/plain", "Not found".toByteArray())

        @JvmStatic fun isOwnUrl(url: String?): Boolean = url != null && url.startsWith("$ORIGIN/", ignoreCase = true)

        @JvmStatic fun mimeFor(name: String): String = when (name.substringAfterLast('.').lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "wasm" -> "application/wasm"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "json" -> "application/json"
            "woff2" -> "font/woff2"
            else -> "application/octet-stream"
        }
    }
}
