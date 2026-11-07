package zovo.jcefshell

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ViewerRoutesTest {
    private val fileBytes = byteArrayOf(0x50, 0x4B, 3, 4, 9, 9)
    private val routes = ViewerRoutes("web", javaClass.classLoader) { fileBytes }

    @Test
    fun servesTheBundlesWithTheirTypes() {
        val html = routes.resolve("http://zovo-viewer/docx.html?theme=dark&name=a.docx&ext=docx")
        assertEquals(200, html.status)
        assertEquals("text/html", html.mime)
        assertTrue(String(html.bytes).contains("<script src=\"docx.js\">"))
        val js = routes.resolve("http://zovo-viewer/pptx.js")
        assertEquals(200, js.status)
        assertEquals("text/javascript", js.mime)
        assertTrue(js.bytes.size > 100_000)
        assertEquals("text/css", routes.resolve("http://zovo-viewer/viewer.css").mime)
    }

    @Test
    fun servesTheFileBytes() {
        val r = routes.resolve("http://zovo-viewer/file")
        assertEquals(200, r.status)
        assertEquals("application/octet-stream", r.mime)
        assertArrayEquals(fileBytes, r.bytes)
    }

    @Test
    fun everythingElseIs404() {
        for (url in listOf(
            "http://zovo-viewer/missing.js", "http://zovo-viewer/", "http://zovo-viewer/../META-INF/plugin.xml",
            "http://zovo-viewer/%2e%2e/META-INF/plugin.xml", "http://zovo-viewer/META-INF/plugin.xml", "http://example.com/docx.js",
            "https://zovo-viewer/docx.js", "file:///etc/passwd", "not a url", "http://zovo-viewer/docx.exe",
        )) assertEquals(url, 404, routes.resolve(url).status)
        assertEquals(404, ViewerRoutes("web", javaClass.classLoader) { null }.resolve("http://zovo-viewer/file").status)
        assertEquals(404, ViewerRoutes("web", javaClass.classLoader) { throw IllegalStateException("gone") }.resolve("http://zovo-viewer/file").status)
    }

    @Test
    fun ownUrlCheck() {
        assertTrue(ViewerRoutes.isOwnUrl("http://zovo-viewer/docx.html"))
        assertFalse(ViewerRoutes.isOwnUrl("http://zovo-viewer.evil.com/x"))
        assertFalse(ViewerRoutes.isOwnUrl("https://example.com/"))
        assertFalse(ViewerRoutes.isOwnUrl(null))
    }
}
