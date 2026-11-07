package zovo.jcefshell;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.icons.AllIcons;
import com.intellij.ide.ui.LafManagerListener;
import com.intellij.openapi.actionSystem.*;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileEditor.FileEditor;
import com.intellij.openapi.fileEditor.FileEditorState;
import com.intellij.openapi.project.DumbAwareAction;
import com.intellij.openapi.util.Disposer;
import com.intellij.openapi.util.UserDataHolderBase;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.ui.JBColor;
import com.intellij.ui.jcef.JBCefBrowser;
import com.intellij.ui.jcef.JBCefBrowserBase;
import com.intellij.ui.jcef.JBCefJSQuery;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.handler.CefLoadHandlerAdapter;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.*;
import java.awt.*;
import java.beans.PropertyChangeListener;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Function;

/**
 * Read-only editor tab that shows one file in a JCEF browser. The page and its scripts come from
 * the plugin's resources through the private origin http://zovo-viewer/ (see {@link ViewerRoutes});
 * the page fetches the file bytes from http://zovo-viewer/file. The page talks back through
 * window.zovoHost.send(json) (a JBCefJSQuery); the IDE calls window.zovoCommand(name) and
 * window.zovoTheme(theme). The browser is disposed with the editor.
 */
public class JcefViewerEditor extends UserDataHolderBase implements FileEditor {
    private static final Logger LOG = Logger.getInstance(JcefViewerEditor.class);

    /** What a product puts into the shell. */
    public record Spec(
            @NotNull String resourceRoot,
            @NotNull String page,
            @NotNull String tabName,
            @NotNull Function<JcefViewerEditor, List<AnAction>> extraActions,
            @Nullable BiConsumer<JcefViewerEditor, JsonObject> onMessage) {}

    private final VirtualFile file;
    private final Spec spec;
    private final JBCefBrowser browser;
    private final JBCefJSQuery query;
    private final JPanel panel;
    private volatile long openedAt;
    private volatile boolean disposed;

    public JcefViewerEditor(@NotNull VirtualFile file, @NotNull Spec spec) {
        this.file = file;
        this.spec = spec;
        this.openedAt = System.currentTimeMillis();
        browser = JBCefBrowser.createBuilder().build();
        Disposer.register(this, browser);
        query = JBCefJSQuery.create((JBCefBrowserBase) browser);
        Disposer.register(this, query);
        query.addHandler(json -> {
            onPageMessage(json);
            return null;
        });

        ViewerRoutes routes = new ViewerRoutes(spec.resourceRoot(), JcefViewerEditor.class.getClassLoader(), this::readBytes);
        browser.getJBCefClient().addRequestHandler(new ViewerRequestHandler(routes), browser.getCefBrowser());
        String bridge = "window.zovoHost = { send: function(json) { " + query.inject("json") + " } };"
                + " if (window.__zovoFlush) window.__zovoFlush();";
        browser.getJBCefClient().addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadEnd(CefBrowser b, CefFrame frame, int httpStatusCode) {
                if (frame.isMain()) b.executeJavaScript(bridge, b.getURL(), 0);
            }
        }, browser.getCefBrowser());

        ApplicationManager.getApplication().getMessageBus().connect(this)
                .subscribe(LafManagerListener.TOPIC, source -> run("window.zovoTheme && window.zovoTheme('" + theme() + "')"));

        DefaultActionGroup group = new DefaultActionGroup();
        group.add(new Cmd("Zoom Out", "Zoom out", AllIcons.General.ZoomOut, () -> command("zoomOut")));
        group.add(new Cmd("Zoom In", "Zoom in", AllIcons.General.ZoomIn, () -> command("zoomIn")));
        group.add(new Cmd("Fit", "Fit to the window", AllIcons.General.FitContent, () -> command("fit")));
        group.add(new Cmd("Find", "Find in the file (Ctrl+F or Cmd+F inside the page)", AllIcons.Actions.Find, () -> command("find")));
        List<AnAction> extra = spec.extraActions().apply(this);
        if (!extra.isEmpty()) {
            group.addSeparator();
            group.addAll(extra);
        }
        group.addSeparator();
        Cmd open = new Cmd("Open in Default App", "Open this file in the app your system uses for it", AllIcons.Ide.External_link_arrow, () -> DefaultApp.open(file));
        group.add(open);
        ActionToolbar toolbar = ActionManager.getInstance().createActionToolbar("ZovoViewerToolbar", group, true);
        panel = new JPanel(new BorderLayout());
        toolbar.setTargetComponent(panel);
        panel.add(toolbar.getComponent(), BorderLayout.NORTH);
        panel.add(browser.getComponent(), BorderLayout.CENTER);

        browser.loadURL(url());
    }

    private String url() {
        String name = URLEncoder.encode(file.getName(), StandardCharsets.UTF_8);
        String ext = URLEncoder.encode(String.valueOf(file.getExtension()), StandardCharsets.UTF_8);
        return ViewerRoutes.ORIGIN + "/" + spec.page() + "?theme=" + theme() + "&name=" + name + "&ext=" + ext;
    }

    public static String theme() {
        return JBColor.isBright() ? "light" : "dark";
    }

    private byte[] readBytes() {
        try {
            if (file.isInLocalFileSystem()) return Files.readAllBytes(file.toNioPath());
            return file.contentsToByteArray();
        } catch (Exception e) {
            LOG.info("Could not read " + file.getPath() + ": " + e.getMessage());
            return null;
        }
    }

    private void onPageMessage(String json) {
        JsonObject msg;
        try {
            msg = JsonParser.parseString(json).getAsJsonObject();
        } catch (Exception e) {
            return;
        }
        String type = msg.has("type") ? msg.get("type").getAsString() : "";
        if ("ready".equals(type)) {
            LOG.info("Opened " + file.getName() + " (" + file.getLength() + " bytes): page ready "
                    + msg.get("ms") + " ms after load, " + (System.currentTimeMillis() - openedAt) + " ms after the tab opened");
        } else if ("error".equals(type)) {
            LOG.info("Viewer could not show " + file.getName() + ": " + msg.get("message"));
        }
        if (spec.onMessage() != null) spec.onMessage().accept(this, msg);
    }

    /** Calls window.zovoCommand(name) in the page, for toolbar buttons. */
    public void command(@NotNull String name) {
        run("window.zovoCommand && window.zovoCommand('" + name.replaceAll("[^A-Za-z0-9_-]", "") + "')");
        browser.getComponent().requestFocusInWindow();
    }

    private void run(String js) {
        if (disposed) return;
        CefBrowser cef = browser.getCefBrowser();
        cef.executeJavaScript(js, cef.getURL(), 0);
    }

    public @NotNull VirtualFile getViewedFile() { return file; }

    @Override public @NotNull JComponent getComponent() { return panel; }
    @Override public @Nullable JComponent getPreferredFocusedComponent() { return browser.getComponent(); }
    @Override public @NotNull String getName() { return spec.tabName(); }
    @Override public @NotNull VirtualFile getFile() { return file; }
    @Override public void setState(@NotNull FileEditorState state) {}
    @Override public boolean isModified() { return false; }
    @Override public boolean isValid() { return file.isValid(); }
    @Override public void addPropertyChangeListener(@NotNull PropertyChangeListener listener) {}
    @Override public void removePropertyChangeListener(@NotNull PropertyChangeListener listener) {}
    @Override public void dispose() { disposed = true; /* the browser and the JS query are children of this editor */ }

    /** A toolbar button that runs on the UI thread. */
    public static final class Cmd extends DumbAwareAction {
        private final Runnable run;

        public Cmd(String text, String description, Icon icon, Runnable run) {
            super(text, description, icon);
            this.run = run;
        }

        @Override public void actionPerformed(@NotNull AnActionEvent e) { run.run(); }
        @Override public @NotNull ActionUpdateThread getActionUpdateThread() { return ActionUpdateThread.EDT; }
    }

    static List<AnAction> none(JcefViewerEditor e) { return new ArrayList<>(); }
}
