package zovo.jcefshell;

import com.intellij.ide.actions.RevealFileAction;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.vfs.VfsUtilCore;
import com.intellij.openapi.vfs.VirtualFile;
import org.jetbrains.annotations.NotNull;

import java.awt.Desktop;
import java.io.File;

/** Opens a file with the app the operating system uses for it (Word, PowerPoint, LibreOffice, Keynote...). */
public final class DefaultApp {
    private DefaultApp() {}

    public static boolean canOpen(@NotNull VirtualFile file) {
        return file.isInLocalFileSystem();
    }

    public static void open(@NotNull VirtualFile file) {
        File io = VfsUtilCore.virtualToIoFile(file);
        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            try {
                if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                    Desktop.getDesktop().open(io);
                    return;
                }
            } catch (Exception ignored) {
                // fall through to the IDE helper
            }
            RevealFileAction.openFile(io);
        });
    }
}
