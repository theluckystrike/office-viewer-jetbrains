package zovo.officeviewer

import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.ex.FileEditorProviderManager
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.io.File

class ProviderPlatformTest : BasePlatformTestCase() {
    override fun getTestDataPath(): String = System.getProperty("officeviewer.fixtures")

    fun testProviderPicksASampleDocxAndHidesTheDefaultEditor() {
        val file = myFixture.copyFileToProject("sample.docx")
        val providers = FileEditorProviderManager.getInstance().getProviderList(project, file)
        val ours = providers.filterIsInstance<OfficeEditorProvider>()
        assertEquals(1, ours.size)
        assertEquals(FileEditorPolicy.HIDE_DEFAULT_EDITOR, ours[0].policy)
        assertEquals(OfficeEditorProvider.TYPE_ID, ours[0].editorTypeId)
        assertTrue(file.fileType.isBinary)
        assertEquals("Word Document", file.fileType.name)
    }

    fun testSlidesAndOldFormatsAreAcceptedButNotText() {
        val provider = OfficeEditorProvider()
        for (name in listOf("quarterly-review.pptx", "quarterly-review.ppsx", "legacy.doc", "legacy-basic.ppt")) {
            val file = myFixture.copyFileToProject(name)
            assertTrue(name, provider.accept(project, file))
        }
        assertEquals("PowerPoint Presentation", FileTypeManager.getInstance().getFileTypeByFileName("deck.pptx").name)
        val text = myFixture.addFileToProject("notes.txt", "hello").virtualFile
        assertFalse(provider.accept(project, text))
        assertTrue(File(testDataPath, "sample.docx").isFile)
    }
}
