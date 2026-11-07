package zovo.jcefshell

import com.intellij.ide.BrowserUtil
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefRequestHandlerAdapter
import org.cef.handler.CefResourceHandler
import org.cef.handler.CefResourceRequestHandler
import org.cef.handler.CefResourceRequestHandlerAdapter
import org.cef.misc.BoolRef
import org.cef.network.CefRequest

/**
 * Serves http://zovo-viewer/ for one browser and blocks every other request. A click on a web link
 * inside a document opens the system browser instead of navigating the viewer away.
 */
class ViewerRequestHandler(private val routes: ViewerRoutes) : CefRequestHandlerAdapter() {
    private val resources = object : CefResourceRequestHandlerAdapter() {
        override fun getResourceHandler(browser: CefBrowser?, frame: CefFrame?, request: CefRequest): CefResourceHandler =
            BytesResourceHandler(routes)
    }

    override fun getResourceRequestHandler(
        browser: CefBrowser?, frame: CefFrame?, request: CefRequest,
        isNavigation: Boolean, isDownload: Boolean, requestInitiator: String?, disableDefaultHandling: BoolRef?,
    ): CefResourceRequestHandler? {
        if (ViewerRoutes.isOwnUrl(request.url)) return resources
        // Not ours: answer with an empty 404 instead of going to the network.
        return blocked
    }

    override fun onBeforeBrowse(browser: CefBrowser?, frame: CefFrame?, request: CefRequest, userGesture: Boolean, isRedirect: Boolean): Boolean {
        val url = request.url ?: return true
        if (ViewerRoutes.isOwnUrl(url)) return false
        if (userGesture && (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("mailto:"))) BrowserUtil.browse(url)
        return true
    }

    private val blocked = object : CefResourceRequestHandlerAdapter() {
        override fun getResourceHandler(browser: CefBrowser?, frame: CefFrame?, request: CefRequest): CefResourceHandler =
            BytesResourceHandler(ViewerRoutes("", javaClass.classLoader) { null })
    }
}
