package zovo.officeviewer

/** Links for the "Support and more tools" row (owner rule). PayPal is added only when factory/sprint/funding.json has it. */
object Support {
    const val REPO = "https://github.com/theluckystrike/office-viewer-jetbrains"
    const val ISSUES = "$REPO/issues"
    const val SPONSORS = "https://github.com/sponsors/theluckystrike"
    const val PROFILE = "https://github.com/theluckystrike"

    data class Link(val text: String, val url: String, val note: String)

    val SUPPORT = listOf(
        Link("Source code on GitHub", REPO, "Read the code, star it, or report a bug."),
        Link("Report an issue", ISSUES, "A file that does not show right? Attach it if you can."),
        Link("Sponsor on GitHub", SPONSORS, "Keeps the viewer free and maintained."),
    )

    val RELATED = listOf(
        Link("Context Drift for JetBrains IDEs", "https://github.com/theluckystrike/context-drift-jetbrains", "Finds stale commands and paths in AGENTS.md and CLAUDE.md."),
        Link("DOCX Viewer for VS Code", "https://marketplace.visualstudio.com/items?itemName=zovo.docx-viewer-vscode", "The Word viewer for VS Code, with a Git compare."),
        Link("PPTX Viewer for VS Code", "https://marketplace.visualstudio.com/items?itemName=zovo.pptx-slide-viewer", "PowerPoint slides and notes in VS Code."),
        Link("All Zovo tools", PROFILE, "theluckystrike on GitHub."),
    )
}
