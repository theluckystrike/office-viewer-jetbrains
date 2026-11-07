package zovo.officeviewer

/** Which page shows a file. Decided by extension, and for .doc/.ppt by the first bytes. */
object OfficeFormats {
    enum class Kind(val page: String?) { DOCX("docx.html"), PPTX("pptx.html"), LEGACY_DOC(null), LEGACY_PPT(null) }

    val WORD = setOf("docx", "dotx", "docm")
    val SLIDES = setOf("pptx", "ppsx", "pptm", "potx")
    const val OLD_WORD = "doc"
    const val OLD_SLIDES = "ppt"

    fun accepts(ext: String): Boolean {
        val e = ext.lowercase()
        return e in WORD || e in SLIDES || e == OLD_WORD || e == OLD_SLIDES
    }

    /** A ZIP file starts with "PK\u0003\u0004". A .docx saved as .doc is still a ZIP and is shown as Word. */
    fun isZip(head: ByteArray): Boolean =
        head.size >= 4 && head[0] == 0x50.toByte() && head[1] == 0x4B.toByte() && head[2] == 0x03.toByte() && head[3] == 0x04.toByte()

    fun kindOf(ext: String, head: ByteArray): Kind? = when (ext.lowercase()) {
        in WORD -> Kind.DOCX
        in SLIDES -> Kind.PPTX
        OLD_WORD -> if (isZip(head)) Kind.DOCX else Kind.LEGACY_DOC
        OLD_SLIDES -> if (isZip(head)) Kind.PPTX else Kind.LEGACY_PPT
        else -> null
    }

    fun legacyMessage(kind: Kind): Pair<String, String> = when (kind) {
        Kind.LEGACY_DOC -> "Old Word format (.doc)" to
            "This is a Word 97-2003 binary file. The viewer shows .docx files. Open it in Word, LibreOffice or Pages and save it as .docx, " +
            "or convert it on the command line with: soffice --headless --convert-to docx file.doc"
        Kind.LEGACY_PPT -> "Old PowerPoint format (.ppt)" to
            "This is a PowerPoint 97-2003 binary file. The viewer shows .pptx files. Open it in PowerPoint, LibreOffice or Keynote and save it as .pptx, " +
            "or convert it on the command line with: soffice --headless --convert-to pptx file.ppt"
        else -> "" to ""
    }
}
