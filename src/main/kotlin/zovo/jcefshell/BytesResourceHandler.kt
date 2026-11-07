package zovo.jcefshell

import org.cef.callback.CefCallback
import org.cef.handler.CefResourceHandler
import org.cef.misc.IntRef
import org.cef.misc.StringRef
import org.cef.network.CefRequest
import org.cef.network.CefResponse

/** Streams one [ViewerRoutes.Response] to the browser in the chunks CEF asks for. */
class BytesResourceHandler(private val routes: ViewerRoutes) : CefResourceHandler {
    private var response: ViewerRoutes.Response = ViewerRoutes.NOT_FOUND
    private var offset = 0

    override fun processRequest(request: CefRequest, callback: CefCallback): Boolean {
        response = routes.resolve(request.url ?: "")
        offset = 0
        callback.Continue()
        return true
    }

    override fun getResponseHeaders(response: CefResponse, responseLength: IntRef, redirectUrl: StringRef) {
        val r = this.response
        response.status = r.status
        response.statusText = if (r.ok) "OK" else "Not Found"
        response.mimeType = r.mime
        response.setHeaderByName("Cache-Control", "no-store", true)
        response.setHeaderByName("X-Content-Type-Options", "nosniff", true)
        responseLength.set(r.bytes.size)
    }

    override fun readResponse(dataOut: ByteArray, bytesToRead: Int, bytesRead: IntRef, callback: CefCallback): Boolean {
        val bytes = response.bytes
        val left = bytes.size - offset
        if (left <= 0) {
            bytesRead.set(0)
            return false
        }
        val n = minOf(left, bytesToRead, dataOut.size)
        System.arraycopy(bytes, offset, dataOut, 0, n)
        offset += n
        bytesRead.set(n)
        return true
    }

    override fun cancel() {
        offset = response.bytes.size
    }
}
