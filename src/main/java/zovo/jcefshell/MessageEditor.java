package zovo.jcefshell;

import com.intellij.openapi.fileEditor.FileEditor;
import com.intellij.openapi.fileEditor.FileEditorState;
import com.intellij.openapi.util.UserDataHolderBase;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.ui.components.JBLabel;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.UIUtil;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.*;
import java.awt.*;
import java.beans.PropertyChangeListener;

/**
 * A plain Swing editor tab with a title, a message, the file size and an "Open in Default App"
 * button. Used when JCEF is missing (remote development, some Linux setups) and for formats the
 * viewer cannot draw (old binary .doc and .ppt).
 */
public class MessageEditor extends UserDataHolderBase implements FileEditor {
    private final VirtualFile file;
    private final JPanel panel;
    private final JButton open;

    public MessageEditor(@NotNull VirtualFile file, @NotNull String title, @NotNull String message) {
        this.file = file;
        JPanel box = new JPanel();
        box.setLayout(new BoxLayout(box, BoxLayout.Y_AXIS));
        box.setOpaque(false);
        JBLabel head = new JBLabel(title);
        head.setFont(JBUI.Fonts.label().biggerOn(4).asBold());
        JBLabel body = new JBLabel("<html><div style='width:420px'>" + StringUtil.escapeXmlEntities(message) + "</div></html>");
        JBLabel size = new JBLabel(file.getName() + " · " + StringUtil.formatFileSize(file.getLength()));
        size.setForeground(UIUtil.getContextHelpForeground());
        open = new JButton("Open in Default App");
        open.setEnabled(DefaultApp.canOpen(file));
        open.addActionListener(e -> DefaultApp.open(file));
        for (JComponent c : new JComponent[]{head, body, size, open}) {
            c.setAlignmentX(Component.LEFT_ALIGNMENT);
            box.add(c);
            box.add(Box.createVerticalStrut(JBUI.scale(10)));
        }
        panel = new JPanel(new GridBagLayout());
        panel.setBorder(JBUI.Borders.empty(24));
        panel.add(box);
    }

    @Override public @NotNull JComponent getComponent() { return panel; }
    @Override public @Nullable JComponent getPreferredFocusedComponent() { return open; }
    @Override public @NotNull String getName() { return "Viewer"; }
    @Override public @NotNull VirtualFile getFile() { return file; }
    @Override public void setState(@NotNull FileEditorState state) {}
    @Override public boolean isModified() { return false; }
    @Override public boolean isValid() { return file.isValid(); }
    @Override public void addPropertyChangeListener(@NotNull PropertyChangeListener listener) {}
    @Override public void removePropertyChangeListener(@NotNull PropertyChangeListener listener) {}
    @Override public void dispose() {}
}
