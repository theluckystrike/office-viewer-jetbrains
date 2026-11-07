package zovo.officeviewer;

import com.intellij.openapi.fileTypes.FileType;
import com.intellij.openapi.util.IconLoader;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.Icon;

/** Binary file types, so the IDE does not ask what .docx or .pptx is and never opens them as text. */
public final class OfficeFileTypes {
    private OfficeFileTypes() {}

    public static final class Word implements FileType {
        public static final Word INSTANCE = new Word();
        private static final Icon ICON = IconLoader.getIcon("/icons/word.svg", OfficeFileTypes.class);
        @Override public @NotNull String getName() { return "Word Document"; }
        @Override public @NotNull String getDescription() { return "Word document (DOCX & PPTX Viewer)"; }
        @Override public @NotNull String getDefaultExtension() { return "docx"; }
        @Override public @Nullable Icon getIcon() { return ICON; }
        @Override public boolean isBinary() { return true; }
        @Override public boolean isReadOnly() { return true; }
    }

    public static final class Slides implements FileType {
        public static final Slides INSTANCE = new Slides();
        private static final Icon ICON = IconLoader.getIcon("/icons/slides.svg", OfficeFileTypes.class);
        @Override public @NotNull String getName() { return "PowerPoint Presentation"; }
        @Override public @NotNull String getDescription() { return "PowerPoint presentation (DOCX & PPTX Viewer)"; }
        @Override public @NotNull String getDefaultExtension() { return "pptx"; }
        @Override public @Nullable Icon getIcon() { return ICON; }
        @Override public boolean isBinary() { return true; }
        @Override public boolean isReadOnly() { return true; }
    }
}
