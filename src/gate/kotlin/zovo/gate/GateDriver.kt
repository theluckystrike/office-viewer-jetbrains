package zovo.gate

import com.intellij.ide.ui.LafManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.vfs.LocalFileSystem
import kotlinx.coroutines.delay
import java.io.File

/**
 * Real-IDE gate driver. Only compiled into gate builds (./gradlew runIde -Pgate=true -Dzovo.gate.dir=...),
 * never into the Marketplace zip. Reads one command per line from <dir>/cmd.txt:
 * `open <path>`, `closeall`, `laf <theme name>`, and appends results to <dir>/out.txt.
 */
class GateDriver : ProjectActivity {
    override suspend fun execute(project: Project) {
        val dir = System.getProperty("zovo.gate.dir") ?: return
        val cmd = File(dir, "cmd.txt")
        val out = File(dir, "out.txt")
        out.appendText("ready ${System.currentTimeMillis()}\n")
        while (!project.isDisposed) {
            if (cmd.isFile && cmd.length() > 0) {
                val lines = cmd.readLines().filter { it.isNotBlank() }
                cmd.writeText("")
                for (line in lines) {
                    val (op, arg) = line.trim().split(" ", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
                    ApplicationManager.getApplication().invokeAndWait {
                        val res = try {
                            when (op) {
                                "open" -> {
                                    val vf = LocalFileSystem.getInstance().refreshAndFindFileByPath(arg)
                                    if (vf == null) "nofile" else {
                                        val eds = FileEditorManager.getInstance(project).openFile(vf, true)
                                        "editors=" + eds.joinToString(",") { it.javaClass.simpleName }
                                    }
                                }
                                "closeall" -> {
                                    val fem = FileEditorManager.getInstance(project)
                                    fem.openFiles.forEach { fem.closeFile(it) }
                                    "closed"
                                }
                                "laf" -> {
                                    val lm = LafManager.getInstance()
                                    val t = lm.installedThemes.firstOrNull { it.name == arg }
                                    if (t == null) "themes=" + lm.installedThemes.joinToString("|") { it.name } else {
                                        lm.setCurrentLookAndFeel(t, true); lm.updateUI(); "laf=${t.name}"
                                    }
                                }
                                "editorcmd" -> {
                                    val ed = FileEditorManager.getInstance(project).selectedEditor
                                    if (ed is zovo.jcefshell.JcefViewerEditor) { ed.command(arg); "sent $arg" } else "no viewer"
                                }
                                "action" -> {
                                    val am = com.intellij.openapi.actionSystem.ActionManager.getInstance()
                                    val a = am.getAction(arg)
                                    if (a == null) "no action" else {
                                        ApplicationManager.getApplication().invokeLater {
                                            am.tryToExecute(a, null, null, com.intellij.openapi.actionSystem.ActionPlaces.UNKNOWN, true)
                                        }
                                        "queued ${a.templatePresentation.text}"
                                    }
                                }
                                else -> "unknown"
                            }
                        } catch (e: Throwable) { "error ${e.javaClass.simpleName}: ${e.message}" }
                        out.appendText("${System.currentTimeMillis()} $line -> $res\n")
                    }
                }
            }
            delay(250)
        }
    }
}
