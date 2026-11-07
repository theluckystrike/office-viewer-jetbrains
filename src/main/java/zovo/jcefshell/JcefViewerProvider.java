package zovo.jcefshell;

import com.intellij.openapi.fileEditor.FileEditor;
import com.intellij.openapi.fileEditor.FileEditorPolicy;
import com.intellij.openapi.fileEditor.FileEditorProvider;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.ui.jcef.JBCefApp;
import org.jetbrains.annotations.NotNull;

/**
 * Base for a viewer tab: accepts files by extension (no read action, works while indexing) and
 * hides the default editor. Without JCEF it shows a plain message with an "Open in Default App" button.
 */
public abstract class JcefViewerProvider implements FileEditorProvider, DumbAware {
    /** Decides by extension only, so it is cheap and safe to call on any thread. */
    protected abstract boolean acceptsExtension(@NotNull String lowerCaseExtension);

    /** Creates the editor when JCEF is available. */
    protected abstract @NotNull FileEditor createViewer(@NotNull Project project, @NotNull VirtualFile file);

    protected @NotNull String productName() { return "This viewer"; }

    @Override
    public boolean accept(@NotNull Project project, @NotNull VirtualFile file) {
        return !file.isDirectory() && acceptsExtension(StringUtil.toLowerCase(StringUtil.notNullize(file.getExtension())));
    }

    @Override
    public boolean acceptRequiresReadAction() { return false; }

    @Override
    public @NotNull FileEditor createEditor(@NotNull Project project, @NotNull VirtualFile file) {
        if (!JBCefApp.isSupported()) {
            return new MessageEditor(file, "This viewer needs JCEF",
                    productName() + " draws files with the browser engine built into the IDE (JCEF), and it is not available here. "
                            + "This happens in remote development clients and on some Linux setups. You can still open the file in its own app.");
        }
        return createViewer(project, file);
    }

    @Override
    public @NotNull FileEditorPolicy getPolicy() { return FileEditorPolicy.HIDE_DEFAULT_EDITOR; }
}
