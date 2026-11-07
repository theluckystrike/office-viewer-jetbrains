// Page layout shared by the DOCX and PPTX views: toolbar, body, status line, errors, copy.
import { applyTheme, params, send, loadFile, Params } from "./host";
import { div, el, empty } from "./dom";

export interface Layout { root: HTMLElement; toolbar: HTMLElement; body: HTMLElement; status: HTMLElement; params: Params }

export function layout(): Layout {
	const p = params();
	applyTheme(p.theme);
	const root = document.getElementById("app") as HTMLElement;
	empty(root);
	root.className = "ov-view";
	const toolbar = div(root, "ov-toolbar");
	const body = div(root, "ov-body");
	const status = div(root, "ov-status", "Opening " + p.name + "…");
	return { root, toolbar, body, status, params: p };
}

export function showError(l: Layout, e: unknown): void {
	const msg = e instanceof Error ? e.message : String(e);
	empty(l.body);
	const box = div(l.body, "ov-error");
	el("p", "", "This file could not be shown.", box);
	el("p", "ov-error-detail", msg, box);
	el("p", "", "Use “Open in Default App” in the editor toolbar to open it in Word or PowerPoint.", box);
	l.status.textContent = "";
	send({ type: "error", message: msg });
}

/** The IDE puts the text on the clipboard (the JCEF page may not have clipboard access). */
export function copyText(l: Layout, text: string, what: string): void {
	send({ type: "copy", text, what });
	l.status.textContent = `Copied ${what} as Markdown (${text.length.toLocaleString()} characters).`;
}

export async function start(run: (l: Layout, bytes: ArrayBuffer) => Promise<void>): Promise<void> {
	const l = layout();
	const t0 = performance.now();
	try {
		const bytes = await loadFile();
		await run(l, bytes);
		send({ type: "ready", ms: Math.round(performance.now() - t0), bytes: bytes.byteLength });
	} catch (e) {
		showError(l, e);
	}
}

export function isTyping(e: KeyboardEvent): boolean {
	const t = e.target as HTMLElement | null;
	return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
}
