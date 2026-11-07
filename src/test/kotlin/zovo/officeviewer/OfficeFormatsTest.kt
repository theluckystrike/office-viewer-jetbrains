package zovo.officeviewer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class OfficeFormatsTest {
    private val fixtures = File(System.getProperty("officeviewer.fixtures"))
    private fun head(name: String) = File(fixtures, name).readBytes().copyOf(8)

    @Test
    fun acceptsByExtension() {
        for (e in listOf("docx", "DOCX", "dotx", "docm", "pptx", "ppsx", "pptm", "potx", "doc", "ppt")) assertTrue(e, OfficeFormats.accepts(e))
        for (e in listOf("xlsx", "pdf", "txt", "", "docxx", "md")) assertFalse(e, OfficeFormats.accepts(e))
    }

    @Test
    fun picksThePageFromExtensionAndBytes() {
        assertEquals(OfficeFormats.Kind.DOCX, OfficeFormats.kindOf("docx", head("sample.docx")))
        assertEquals(OfficeFormats.Kind.DOCX, OfficeFormats.kindOf("dotx", head("sample.dotx")))
        assertEquals(OfficeFormats.Kind.PPTX, OfficeFormats.kindOf("ppsx", head("quarterly-review.ppsx")))
        assertEquals(OfficeFormats.Kind.DOCX, OfficeFormats.kindOf("doc", head("docx-as.doc")))
        assertEquals(OfficeFormats.Kind.LEGACY_DOC, OfficeFormats.kindOf("doc", head("legacy.doc")))
        assertEquals(OfficeFormats.Kind.PPTX, OfficeFormats.kindOf("ppt", head("renamed-pptx.ppt")))
        assertEquals(OfficeFormats.Kind.LEGACY_PPT, OfficeFormats.kindOf("ppt", head("legacy-basic.ppt")))
        assertEquals(OfficeFormats.Kind.LEGACY_PPT, OfficeFormats.kindOf("ppt", ByteArray(0)))
        assertNull(OfficeFormats.kindOf("txt", head("sample.docx")))
        assertEquals("docx.html", OfficeFormats.Kind.DOCX.page)
        assertNull(OfficeFormats.Kind.LEGACY_DOC.page)
        assertTrue(OfficeFormats.legacyMessage(OfficeFormats.Kind.LEGACY_DOC).second.contains("--convert-to docx"))
    }
}
