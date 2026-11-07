// Slide view: a thumbnail strip, the large slide fit to the pane, arrow keys, speaker notes,
// find in slides and notes, Copy as Markdown. Ported from the Zovo Office Viewer for Obsidian (views/pptx.ts).
import { init } from "pptx-preview";
import { clampSlide, Deck, deckToMarkdown, NOTICE_LABEL, parseDeck, searchDeck, slideTitle } from "./core/pptx";
import { onCommand } from "./host";
import { button, div, el, empty } from "./dom";
import { start, copyText, isTyping, Layout } from "./shell";

/**
 * The bundled chart drawing does not read the series from the file, so a drawn chart would be wrong.
 * Charts are drawn a moment after the slides, so this runs again whenever a slide is shown.
 */
function hideCharts(root: HTMLElement): void {
	root.querySelectorAll<HTMLElement>(".chart-node").forEach((n) => {
		if (n.classList.contains("ov-chart-note")) return;
		empty(n);
		n.classList.add("ov-chart-note");
		div(n, "ov-chart-msg", "Chart not drawn in this version. Copy as Markdown keeps the slide text.");
	});
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

class PptxPage {
	private deck!: Deck;
	private slides: HTMLElement[] = [];
	private thumbs: HTMLElement[] = [];
	private index = 1;
	private zoom = 1;
	private stage!: HTMLElement;
	private box!: HTMLElement;
	private notesEl!: HTMLElement;
	private counter!: HTMLElement;
	private zoomLabel!: HTMLElement;
	private notesOn = true;
	private hits: number[] = [];
	private findInput!: HTMLInputElement;

	constructor(private l: Layout, private bytes: ArrayBuffer) {}

	async open(): Promise<void> {
		this.deck = parseDeck(new Uint8Array(this.bytes));
		this.buildToolbar();
		const body = this.l.body;
		body.classList.add("ov-pptx");
		const strip = div(body, "ov-strip");
		const main = div(body, "ov-pptx-main");
		this.stage = div(main, "ov-stage");
		this.notesEl = div(main, "ov-notes");
		this.l.status.textContent = `Drawing ${this.deck.slides.length} slides…`;
		this.box = div(this.stage, "ov-slides");
		const previewer = init(this.box, { width: this.deck.widthPx, height: this.deck.heightPx, mode: "list" });
		await previewer.preview(this.bytes);
		this.box.querySelectorAll("script, iframe, object, embed").forEach((n) => n.remove());
		hideCharts(this.box);
		this.slides = Array.from(this.box.querySelectorAll<HTMLElement>(".pptx-preview-slide-wrapper"));
		const w = 150;
		const scale = w / Math.max(1, this.deck.widthPx);
		this.slides.forEach((s, i) => {
			const t = div(strip, "ov-thumb");
			t.setAttribute("aria-label", `Slide ${i + 1}`);
			div(t, "ov-thumb-num", String(i + 1));
			const frame = div(t, "ov-thumb-frame");
			const clone = s.cloneNode(true) as HTMLElement;
			frame.appendChild(clone);
			frame.style.setProperty("--ov-w", `${w}px`);
			frame.style.setProperty("--ov-h", `${Math.round(this.deck.heightPx * scale)}px`);
			clone.classList.add("ov-scaled");
			clone.style.setProperty("--ov-scale", String(scale));
			t.addEventListener("click", () => this.go(i + 1));
			this.thumbs.push(t);
		});
		new ResizeObserver(() => this.fit()).observe(this.stage);
		this.bindKeys();
		this.go(1);
		window.setTimeout(() => hideCharts(this.l.root), 1000);
	}

	private buildToolbar(): void {
		const tb = this.l.toolbar;
		const nav = div(tb, "ov-group");
		button(nav, "←", "Previous slide (Left arrow)", () => this.go(this.index - 1));
		this.counter = el("span", "ov-count", "", nav);
		button(nav, "→", "Next slide (Right arrow)", () => this.go(this.index + 1));
		const zoom = div(tb, "ov-group");
		button(zoom, "−", "Zoom out", () => this.stepZoom(-1));
		this.zoomLabel = el("span", "ov-zoom-label", "Fit", zoom);
		button(zoom, "+", "Zoom in", () => this.stepZoom(1));
		const find = div(tb, "ov-group ov-find");
		const input = el("input", "ov-find-input", undefined, find);
		this.findInput = input;
		input.type = "search";
		input.placeholder = "Find in slides and notes";
		const count = el("span", "ov-count", "", find);
		input.addEventListener("input", () => {
			this.hits = searchDeck(this.deck, input.value);
			count.textContent = input.value.trim() ? `${this.hits.length} ${this.hits.length === 1 ? "slide" : "slides"}` : "";
			this.thumbs.forEach((t, i) => t.classList.toggle("is-hit", this.hits.includes(i + 1)));
			const first = this.hits[0];
			if (first !== undefined) this.go(first);
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") { input.value = ""; input.dispatchEvent(new Event("input")); input.blur(); return; }
			if (e.key !== "Enter" || !this.hits.length) return;
			e.preventDefault();
			const next = e.shiftKey
				? [...this.hits].reverse().find((h) => h < this.index) ?? this.hits[this.hits.length - 1]
				: this.hits.find((h) => h > this.index) ?? this.hits[0];
			if (next !== undefined) this.go(next);
		});
		const right = div(tb, "ov-group ov-right");
		const notesBtn = button(right, "Notes", "Show or hide speaker notes", () => {
			this.notesOn = !this.notesOn;
			notesBtn.classList.toggle("is-active", this.notesOn);
			this.showNotes();
		});
		notesBtn.classList.add("is-active");
		button(right, "Copy as Markdown", "Copy all slides and notes as Markdown", () => this.copyMarkdown());
	}

	private bindKeys(): void {
		document.addEventListener("keydown", (e) => {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); this.findInput.focus(); this.findInput.select(); return; }
			if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); this.stepZoom(1); return; }
			if (mod && e.key === "-") { e.preventDefault(); this.stepZoom(-1); return; }
			if (isTyping(e) || mod || e.altKey) return;
			const n = this.slides.length;
			if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); this.go(this.index + 1); }
			else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); this.go(this.index - 1); }
			else if (e.key === "Home") { e.preventDefault(); this.go(1); }
			else if (e.key === "End") { e.preventDefault(); this.go(n); }
		});
		onCommand("zoomIn", () => this.stepZoom(1));
		onCommand("zoomOut", () => this.stepZoom(-1));
		onCommand("zoomReset", () => this.setZoom(1));
		onCommand("fit", () => this.setZoom(1));
		onCommand("find", () => { this.findInput.focus(); this.findInput.select(); });
		onCommand("next", () => this.go(this.index + 1));
		onCommand("prev", () => this.go(this.index - 1));
		onCommand("copyMarkdown", () => this.copyMarkdown());
	}

	private go(n: number): void {
		const count = this.slides.length || this.deck.slides.length;
		this.index = clampSlide(n, count);
		this.slides.forEach((s, i) => s.classList.toggle("ov-hidden", i !== this.index - 1));
		this.thumbs.forEach((t, i) => t.classList.toggle("is-active", i === this.index - 1));
		this.thumbs[this.index - 1]?.scrollIntoView({ block: "nearest" });
		this.counter.textContent = count ? `${this.index} / ${count}` : "No slides";
		if (!count) { this.l.status.textContent = "This presentation has no slides."; return; }
		this.showNotes();
		hideCharts(this.l.root);
		const s = this.deck.slides[this.index - 1];
		const notices = s?.notices.filter((x) => x !== "chart") ?? [];
		this.l.status.textContent = s ? `Slide ${this.index} of ${count} · ${slideTitle(s)}` + (notices.length ? ` · not drawn: ${notices.map((x) => NOTICE_LABEL[x] ?? x).join(", ")}` : "") : "";
	}

	private showNotes(): void {
		this.notesEl.classList.toggle("ov-hidden", !this.notesOn);
		empty(this.notesEl);
		const notes = this.deck.slides[this.index - 1]?.notes ?? "";
		div(this.notesEl, "ov-notes-title", "Speaker notes");
		div(this.notesEl, notes ? "ov-notes-text" : "ov-notes-text ov-muted", notes || "No notes on this slide.");
		this.fit();
	}

	private stepZoom(dir: 1 | -1): void {
		const i = ZOOMS.findIndex((z) => z >= this.zoom - 1e-9);
		this.setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + dir))] ?? 1);
	}

	private setZoom(z: number): void {
		this.zoom = z;
		this.zoomLabel.textContent = z === 1 ? "Fit" : Math.round(z * 100) + "%";
		this.stage.classList.toggle("ov-zoomed", z > 1);
		this.fit();
	}

	private fit(): void {
		const s = this.slides[this.index - 1];
		if (!s) return;
		const w = this.stage.clientWidth - 32;
		const h = this.stage.clientHeight - 32;
		const scale = Math.max(0.05, Math.min(w / this.deck.widthPx, h / this.deck.heightPx)) * this.zoom;
		s.classList.add("ov-scaled");
		s.style.setProperty("--ov-scale", String(scale));
		this.box.style.setProperty("--ov-w", `${Math.round(this.deck.widthPx * scale)}px`);
		this.box.style.setProperty("--ov-h", `${Math.round(this.deck.heightPx * scale)}px`);
	}

	private copyMarkdown(): void {
		copyText(this.l, deckToMarkdown(this.deck, this.l.params.name.replace(/\.[^.]+$/, "")), "the slides");
	}
}

void start("pptx", async (l, bytes) => { await new PptxPage(l, bytes).open(); });
