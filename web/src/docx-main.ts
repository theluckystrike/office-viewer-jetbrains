// Word page view: page layout (docx-preview), zoom, find, a tracked changes toggle, an outline of
// headings and Copy as Markdown. Ported from the Zovo Office Viewer for Obsidian (views/docx.ts).
import { renderAsync, Options } from "docx-preview";
import { label, summarizeDocx, RevisionSummary } from "./core/revisions";
import { stepZoom } from "./core/grid";
import { markMatches } from "./find";
import { onCommand, send } from "./host";
import { button, div, el, empty } from "./dom";
import { start, copyText, isTyping, Layout } from "./shell";
import { docxToMarkdown } from "./markdown-docx";

// From the Zovo DOCX viewer (media/page.js). altChunks are raw HTML parts, so they never render.
const RENDER_OPTIONS: Partial<Options> = {
	className: "docx", inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true,
	ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, renderHeaders: true, renderFooters: true,
	renderFootnotes: true, renderEndnotes: true, renderAltChunks: false, renderComments: false,
	useBase64URL: false, experimental: false, trimXmlDeclaration: true, debug: false,
};
const REMOTE = /^\s*(https?:|\/\/|ftp:|file:)/i;
const HEADING = /\bdocx_(?:heading([1-6])|title)\b/i;

/** No scripts, no remote sources, no inline handlers in the rendered pages. */
export function scrub(root: HTMLElement): void {
	root.querySelectorAll("script, iframe, object, embed, link, meta, base, form").forEach((e) => e.remove());
	root.querySelectorAll("*").forEach((e) => {
		for (const attr of Array.from(e.attributes)) {
			const n = attr.name.toLowerCase();
			if (n.startsWith("on")) e.removeAttribute(attr.name);
			else if ((n === "src" || n === "srcset" || n === "poster" || n === "xlink:href") && REMOTE.test(attr.value)) e.removeAttribute(attr.name);
		}
	});
}

interface Heading { level: number; text: string; el: HTMLElement }

class DocxPage {
	private zoom = 1;
	private changes = false;
	private summary: RevisionSummary | null = null;
	private pagesEl: HTMLElement | null = null;
	private scroller!: HTMLElement;
	private outlineEl!: HTMLElement;
	private marks: HTMLElement[] = [];
	private current = -1;
	private findInput!: HTMLInputElement;
	private countEl!: HTMLElement;
	private zoomLabel!: HTMLElement;
	private changesBtn: HTMLButtonElement | null = null;
	private outlineBtn!: HTMLButtonElement;
	private pageCount = 0;
	private headings: Heading[] = [];

	constructor(private l: Layout, private bytes: ArrayBuffer) {}

	async open(): Promise<void> {
		try { this.summary = summarizeDocx(new Uint8Array(this.bytes)); } catch { this.summary = null; }
		this.buildToolbar();
		this.l.body.classList.add("ov-docx");
		this.outlineEl = div(this.l.body, "ov-outline ov-hidden");
		this.scroller = div(this.l.body, "ov-docx-scroller");
		this.bindKeys();
		await this.draw();
		// A page wider than the pane starts at "fit width" instead of a sideways scroll.
		const page = this.pagesEl?.querySelector("section.docx");
		if (page && page.getBoundingClientRect().width > this.scroller.clientWidth - 24) this.fitWidth();
	}

	private buildToolbar(): void {
		const tb = this.l.toolbar;
		const left = div(tb, "ov-group");
		this.outlineBtn = button(left, "Outline", "Show or hide the outline of headings", () => this.toggleOutline());
		const zoom = div(tb, "ov-group");
		button(zoom, "−", "Zoom out", () => this.setZoom(stepZoom(this.zoom, -1)));
		this.zoomLabel = el("span", "ov-zoom-label", "", zoom);
		button(zoom, "+", "Zoom in", () => this.setZoom(stepZoom(this.zoom, 1)));
		button(zoom, "Fit", "Fit page width", () => this.fitWidth());
		const find = div(tb, "ov-group ov-find");
		this.findInput = el("input", "ov-find-input", undefined, find);
		this.findInput.type = "search";
		this.findInput.placeholder = "Find in document";
		this.countEl = el("span", "ov-count", "", find);
		button(find, "↑", "Previous match (Shift+Enter)", () => this.step(-1));
		button(find, "↓", "Next match (Enter)", () => this.step(1));
		const input = this.findInput;
		input.addEventListener("input", () => this.runFind(input.value));
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
			if (e.key === "Escape") { input.value = ""; this.runFind(""); }
		});
		const right = div(tb, "ov-group ov-right");
		if (this.summary && this.summary.changes > 0) {
			this.changesBtn = button(right, "Show changes", "Show tracked changes (read-only)", () => { void this.toggleChanges(); });
			el("span", "ov-badge", label(this.summary), right);
		}
		button(right, "Copy as Markdown", "Copy the document text as Markdown", () => { void this.copyMarkdown(); });
		this.updateZoomLabel();
	}

	private bindKeys(): void {
		document.addEventListener("keydown", (e) => {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); this.focusFind(); }
			else if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); this.setZoom(stepZoom(this.zoom, 1)); }
			else if (mod && e.key === "-") { e.preventDefault(); this.setZoom(stepZoom(this.zoom, -1)); }
			else if (mod && e.key === "0") { e.preventDefault(); this.setZoom(1); }
			else if (e.key === "F3" && !isTyping(e)) { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
		});
		onCommand("zoomIn", () => this.setZoom(stepZoom(this.zoom, 1)));
		onCommand("zoomOut", () => this.setZoom(stepZoom(this.zoom, -1)));
		onCommand("zoomReset", () => this.setZoom(1));
		onCommand("fit", () => this.fitWidth());
		onCommand("find", () => this.focusFind());
		onCommand("outline", () => this.toggleOutline());
		onCommand("copyMarkdown", () => { void this.copyMarkdown(); });
	}

	private async draw(): Promise<void> {
		const query = this.findInput.value;
		empty(this.scroller);
		const pages = div(this.scroller, "ov-docx-pages");
		this.l.status.textContent = "Laying out pages…";
		await renderAsync(this.bytes, pages, pages, { ...RENDER_OPTIONS, renderChanges: this.changes });
		scrub(pages);
		this.pageCount = pages.querySelectorAll("section.docx").length;
		if (!this.pageCount) throw new Error("The document has no pages to show.");
		this.pagesEl = pages;
		this.applyZoom();
		this.buildOutline();
		this.l.status.textContent = `${this.pageCount} ${this.pageCount === 1 ? "page" : "pages"}` +
			(this.headings.length ? ` · ${this.headings.length} headings` : "") + (this.changes ? " · tracked changes shown" : "");
		if (query) this.runFind(query);
	}

	private buildOutline(): void {
		empty(this.outlineEl);
		this.headings = [];
		if (!this.pagesEl) return;
		for (const p of Array.from(this.pagesEl.querySelectorAll<HTMLElement>("section.docx article p, section.docx article h1, section.docx article h2, section.docx article h3"))) {
			const m = HEADING.exec(p.className);
			if (!m) continue;
			const text = (p.textContent ?? "").replace(/\s+/g, " ").trim();
			if (!text) continue;
			this.headings.push({ level: m[1] ? Number(m[1]) : 1, text, el: p });
		}
		el("div", "ov-outline-title", "Outline", this.outlineEl);
		if (!this.headings.length) { el("div", "ov-muted ov-outline-empty", "No headings in this document.", this.outlineEl); return; }
		for (const h of this.headings) {
			const item = el("div", "ov-outline-item", h.text, this.outlineEl);
			item.style.paddingLeft = `${8 + (h.level - 1) * 12}px`;
			item.title = h.text;
			item.addEventListener("click", () => h.el.scrollIntoView({ block: "start" }));
		}
	}

	private toggleOutline(): void {
		const hidden = this.outlineEl.classList.toggle("ov-hidden");
		this.outlineBtn.classList.toggle("is-active", !hidden);
	}

	private async toggleChanges(): Promise<void> {
		if (!this.summary?.changes) return;
		this.changes = !this.changes;
		if (this.changesBtn) {
			this.changesBtn.textContent = this.changes ? "Hide changes" : "Show changes";
			this.changesBtn.classList.toggle("is-active", this.changes);
		}
		const top = this.scroller.scrollTop;
		await this.draw();
		this.scroller.scrollTop = top;
	}

	private applyZoom(): void {
		const wrapper = this.pagesEl?.querySelector<HTMLElement>(".docx-wrapper");
		if (wrapper) wrapper.style.setProperty("zoom", String(this.zoom));
		this.updateZoomLabel();
	}

	private updateZoomLabel(): void {
		this.zoomLabel.textContent = Math.round(this.zoom * 100) + "%";
		send({ type: "zoom", value: this.zoom });
	}

	private setZoom(z: number): void {
		this.zoom = Math.max(0.25, Math.min(3, z));
		this.applyZoom();
	}

	private fitWidth(): void {
		const wrapper = this.pagesEl?.querySelector<HTMLElement>(".docx-wrapper");
		if (!wrapper) return;
		wrapper.style.setProperty("zoom", "1");
		const widths = Array.from(wrapper.querySelectorAll("section.docx")).map((s) => s.getBoundingClientRect().width);
		const widest = Math.max(1, ...widths);
		this.setZoom(Math.floor(((this.scroller.clientWidth - 48) / widest) * 100) / 100);
	}

	private focusFind(): void {
		this.findInput.focus();
		this.findInput.select();
	}

	private runFind(query: string): void {
		if (!this.pagesEl) return;
		this.marks = markMatches(this.pagesEl, query);
		this.current = -1;
		if (this.marks.length) this.step(1);
		else this.countEl.textContent = query.trim() ? "No matches" : "";
	}

	private step(dir: 1 | -1): void {
		if (!this.marks.length) return;
		this.marks[this.current]?.classList.remove("is-current");
		this.current = (this.current + dir + this.marks.length) % this.marks.length;
		const m = this.marks[this.current];
		m?.classList.add("is-current");
		m?.scrollIntoView({ block: "center" });
		this.countEl.textContent = `${this.current + 1} of ${this.marks.length}`;
	}

	private async copyMarkdown(): Promise<void> {
		this.l.status.textContent = "Converting to Markdown…";
		try {
			copyText(this.l, await docxToMarkdown(this.bytes), "the document");
		} catch (e) {
			this.l.status.textContent = "Copy as Markdown failed: " + (e instanceof Error ? e.message : String(e));
		}
	}
}

void start(async (l, bytes) => { await new DocxPage(l, bytes).open(); });
