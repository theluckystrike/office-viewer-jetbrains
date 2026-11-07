package zovo.officeviewer

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.HyperlinkLabel
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import javax.swing.Action
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel

/** Help | DOCX & PPTX Viewer: Support and More Tools. */
class SupportAction : DumbAwareAction() {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        SupportDialog().show()
    }

    private class SupportDialog : DialogWrapper(true) {
        init {
            title = "DOCX & PPTX Viewer: Support and More Tools"
            setOKButtonText("Close")
            init()
        }

        override fun createActions(): Array<Action> = arrayOf(okAction)

        override fun createCenterPanel(): JComponent {
            val panel = JPanel()
            panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
            panel.border = JBUI.Borders.empty(4, 8)
            fun section(title: String, links: List<Support.Link>) {
                panel.add(JBLabel(title).apply { font = JBUI.Fonts.label().asBold(); border = JBUI.Borders.empty(8, 0, 4, 0) })
                for (l in links) {
                    panel.add(HyperlinkLabel(l.text).apply { setHyperlinkTarget(l.url) })
                    panel.add(JBLabel(l.note).apply {
                        foreground = UIUtil.getContextHelpForeground()
                        border = JBUI.Borders.empty(0, 2, 6, 0)
                    })
                }
            }
            section("Support", Support.SUPPORT)
            section("More tools by Zovo", Support.RELATED)
            return panel
        }
    }
}
