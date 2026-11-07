package zovo.officeviewer;

import com.google.gson.JsonObject;
import com.intellij.icons.AllIcons;
import com.intellij.notification.NotificationGroupManager;
import com.intellij.notification.NotificationType;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.fileEditor.FileEditor;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;
import org.jetbrains.annotations.NotNull;
import zovo.jcefshell.JcefViewerEditor;
import zovo.jcefshell.JcefViewerProvider;
import zovo.jcefshell.MessageEditor;

import java.awt.datatransfer.StringSelection;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** Opens .docx/.dotx/.docm and .pptx/.ppsx/.pptm/.potx in the viewer; .doc and .ppt get a clear message. */
public final class OfficeEditorProvider extends JcefViewerProvider {
    public static final String TYPE_ID = "zovo-office-viewer";
    private static final String RESOURCES = "web";

    @Override
    protected boolean acceptsExtension(@NotNull String ext) {
        return OfficeFormats.INSTANCE.accepts(ext);
    }

    @Override
    protected @NotNull String productName() { return "DOCX & PPTX Viewer"; }

    @Override
    protected @NotNull FileEditor createViewer(@NotNull Project project, @NotNull VirtualFile file) {
        OfficeFormats.Kind kind = OfficeFormats.INSTANCE.kindOf(String.valueOf(file.getExtension()), head(file));
        if (kind == null || kind.getPage() == null) {
            var msg = OfficeFormats.INSTANCE.legacyMessage(kind == null ? OfficeFormats.Kind.LEGACY_DOC : kind);
            return new MessageEditor(file, msg.getFirst(), msg.getSecond());
        }
        boolean slides = kind == OfficeFormats.Kind.PPTX;
        return new JcefViewerEditor(file, new JcefViewerEditor.Spec(
                RESOURCES, kind.getPage(), slides ? "Slides" : "Pages",
                editor -> actions(editor, slides),
                OfficeEditorProvider::onMessage));
    }

    private static List<AnAction> actions(JcefViewerEditor editor, boolean slides) {
        List<AnAction> list = new ArrayList<>();
        if (slides) {
            list.add(new JcefViewerEditor.Cmd("Previous Slide", "Previous slide (Left arrow)", AllIcons.Actions.Back, () -> editor.command("prev")));
            list.add(new JcefViewerEditor.Cmd("Next Slide", "Next slide (Right arrow)", AllIcons.Actions.Forward, () -> editor.command("next")));
        } else {
            list.add(new JcefViewerEditor.Cmd("Outline", "Show or hide the outline of headings", AllIcons.Toolwindows.ToolWindowStructure, () -> editor.command("outline")));
        }
        list.add(new JcefViewerEditor.Cmd("Copy as Markdown", "Copy the text as Markdown", AllIcons.Actions.Copy, () -> editor.command("copyMarkdown")));
        return list;
    }

    private static void onMessage(JcefViewerEditor editor, JsonObject msg) {
        String type = msg.has("type") ? msg.get("type").getAsString() : "";
        if (!"copy".equals(type) || !msg.has("text")) return;
        String text = msg.get("text").getAsString();
        String what = msg.has("what") ? msg.get("what").getAsString() : "the text";
        CopyPasteManager.getInstance().setContents(new StringSelection(text));
        NotificationGroupManager.getInstance().getNotificationGroup("DOCX & PPTX Viewer")
                .createNotification("Copied " + what + " as Markdown (" + text.length() + " characters).", NotificationType.INFORMATION)
                .notify(null);
    }

    private static byte[] head(VirtualFile file) {
        try (InputStream in = file.getInputStream()) {
            return in.readNBytes(8);
        } catch (Exception e) {
            return new byte[0];
        }
    }

    @Override
    public @NotNull String getEditorTypeId() { return TYPE_ID; }
}
