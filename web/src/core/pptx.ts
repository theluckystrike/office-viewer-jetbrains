// The text of a PowerPoint deck: slide order, titles, bullets with levels, tables, speaker notes,
// and the things that cannot be drawn. Ported from the Zovo PPTX viewer (src/pptx.js, media/core.js).
import { readXmlParts, resolveTarget, relsPathFor } from "./zip";
import { parseXml, child, find, findAll, elements, local, XNode } from "./xml";
import { mdEscapeInline, markdownTable } from "./markdown";

export interface Paragraph { text: string; level: number }
export type Block =
	| { kind: "text"; subtitle: boolean; paragraphs: Paragraph[] }
	| { kind: "table"; rows: string[][] };
export interface Slide {
	index: number;
	title: string;
	fallbackTitle?: string;
	blocks: Block[];
	notes: string;
	notices: string[];
	images: number;
	hidden: boolean;
}
export interface Deck { kind: string; width: number; height: number; widthPx: number; heightPx: number; slides: Slide[] }
interface Rel { type: string; target: string; external: boolean }

const REL_NOTES = /\/notesSlide$/;
const SKIP_PH = new Set(["sldNum", "dt", "ftr", "hdr", "sldImg"]);
const TITLE_PH = new Set(["title", "ctrTitle"]);
const EMU_PER_PX = 9525;
const MAIN_TYPES: Record<string, string> = {
	"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": "pptx",
	"application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml": "pptm",
	"application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": "ppsx",
	"application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml": "ppsm",
	"application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": "potx",
	"application/vnd.ms-powerpoint.template.macroEnabled.main+xml": "potm",
};
export const NOTICE_LABEL: Record<string, string> = {
	smartart: "SmartArt", chart: "chart", video: "video", audio: "audio", object: "embedded object", ink: "ink drawing", missing: "missing slide part",
};

function parseRels(xml: string | undefined): Map<string, Rel> {
	const map = new Map<string, Rel>();
	if (!xml) return map;
	for (const r of findAll(parseXml(xml), "Relationship")) {
		map.set(r.attrs.Id ?? "", { type: r.attrs.Type ?? "", target: r.attrs.Target ?? "", external: r.attrs.TargetMode === "External" });
	}
	return map;
}

function placeholderType(sp: XNode): string | null {
	const nv = elements(sp).find((e) => local(e.name).startsWith("nv"));
	const ph = nv ? find(nv, "p:ph") : null;
	if (!ph) return null;
	return ph.attrs.type ?? "body";
}

function paragraphText(p: XNode): string {
	let s = "";
	for (const c of elements(p)) {
		const n = local(c.name);
		if (n === "r" || n === "fld") {
			const t = child(c, "a:t");
			if (t) s += t.children.filter((x): x is string => typeof x === "string").join("");
		} else if (n === "br") s += "\n";
	}
	return s.split("\u000b").join("\n");
}

function textBodyParagraphs(txBody: XNode): Paragraph[] {
	const out: Paragraph[] = [];
	for (const p of elements(txBody)) {
		if (p.name !== "a:p") continue;
		const text = paragraphText(p).trim();
		if (!text) continue;
		const pPr = child(p, "a:pPr");
		const level = pPr?.attrs.lvl ? Math.min(8, parseInt(pPr.attrs.lvl, 10) || 0) : 0;
		out.push({ text, level });
	}
	return out;
}

function tableRows(tbl: XNode): string[][] {
	return elements(tbl).filter((e) => e.name === "a:tr").map((tr) =>
		elements(tr).filter((e) => e.name === "a:tc").map((tc) => {
			const body = child(tc, "a:txBody");
			return body ? textBodyParagraphs(body).map((p) => p.text).join(" ") : "";
		}));
}

function addNotice(slide: Slide, kind: string): void {
	if (!slide.notices.includes(kind)) slide.notices.push(kind);
}

function walkShapes(tree: XNode, slide: Slide): void {
	for (const el of elements(tree)) {
		const n = el.name;
		if (n === "p:sp") {
			const ph = placeholderType(el);
			if (ph && SKIP_PH.has(ph)) continue;
			const body = child(el, "p:txBody");
			if (!body) continue;
			const paras = textBodyParagraphs(body);
			if (!paras.length) continue;
			if (ph && TITLE_PH.has(ph) && !slide.title) slide.title = paras.map((p) => p.text).join(" ");
			else slide.blocks.push({ kind: "text", subtitle: ph === "subTitle", paragraphs: paras });
		} else if (n === "p:grpSp") {
			walkShapes(el, slide);
		} else if (n === "p:graphicFrame") {
			const gd = find(el, "a:graphicData");
			const uri = gd?.attrs.uri ?? "";
			const tbl = gd ? find(gd, "a:tbl") : null;
			if (tbl) slide.blocks.push({ kind: "table", rows: tableRows(tbl) });
			else if (/\/diagram$/.test(uri)) addNotice(slide, "smartart");
			else if (/\/chart$/.test(uri) || /chartex/i.test(uri)) addNotice(slide, "chart");
			else if (/\/ole$/.test(uri)) addNotice(slide, "object");
		} else if (n === "p:pic") {
			const nvPr = find(el, "p:nvPr");
			if (nvPr && (find(nvPr, "a:videoFile") || find(nvPr, "a:quickTimeFile") || find(nvPr, "p14:media"))) addNotice(slide, "video");
			else if (nvPr && (find(nvPr, "a:audioFile") || find(nvPr, "a:wavAudioFile"))) addNotice(slide, "audio");
			else slide.images += 1;
		} else if (n === "mc:AlternateContent") {
			const choice = child(el, "mc:Choice") ?? child(el, "mc:Fallback");
			if (choice) walkShapes(choice, slide);
		} else if (n === "p:contentPart") {
			addNotice(slide, "ink");
		}
	}
}

function notesText(xml: string): string {
	const tree = find(parseXml(xml), "p:spTree");
	if (!tree) return "";
	const lines: string[] = [];
	for (const sp of findAll(tree, "p:sp")) {
		if (placeholderType(sp) !== "body") continue;
		const body = child(sp, "p:txBody");
		if (body) for (const p of textBodyParagraphs(body)) lines.push(p.text);
	}
	return lines.join("\n");
}

/** Parses deck bytes into a plain object. Never runs macros; it only reads XML. */
export function parseDeck(bytes: Uint8Array): Deck {
	const parts = readXmlParts(bytes);
	const ct = parts.get("[Content_Types].xml");
	let mainPart = "ppt/presentation.xml";
	let kind = "pptx";
	if (ct) {
		for (const o of findAll(parseXml(ct), "Override")) {
			const k = MAIN_TYPES[o.attrs.ContentType ?? ""];
			if (k) { mainPart = (o.attrs.PartName ?? "").replace(/^\//, ""); kind = k; break; }
		}
	}
	const presXml = parts.get(mainPart);
	if (!presXml) throw new Error("No presentation part found. This is not a PowerPoint file.");
	const pres = parseXml(presXml);
	const rels = parseRels(parts.get(relsPathFor(mainPart)));
	const sz = find(pres, "p:sldSz");
	const width = sz ? parseInt(sz.attrs.cx ?? "", 10) || 9144000 : 9144000;
	const height = sz ? parseInt(sz.attrs.cy ?? "", 10) || 6858000 : 6858000;
	const ids = find(pres, "p:sldIdLst");
	const slides: Slide[] = [];
	for (const sid of ids ? elements(ids).filter((e) => e.name === "p:sldId") : []) {
		const rel = rels.get(sid.attrs["r:id"] ?? "");
		if (!rel || rel.external) continue;
		const part = resolveTarget(mainPart, rel.target);
		const xml = parts.get(part);
		const slide: Slide = { index: slides.length + 1, title: "", blocks: [], notes: "", notices: [], images: 0, hidden: false };
		if (!xml) { slide.notices.push("missing"); slides.push(slide); continue; }
		const doc = parseXml(xml);
		const sld = find(doc, "p:sld");
		if (sld && sld.attrs.show === "0") slide.hidden = true;
		const tree = find(doc, "p:spTree");
		if (tree) walkShapes(tree, slide);
		for (const r of parseRels(parts.get(relsPathFor(part))).values()) {
			if (REL_NOTES.test(r.type) && !r.external) {
				const nx = parts.get(resolveTarget(part, r.target));
				if (nx) slide.notes = notesText(nx);
			}
		}
		if (!slide.title) {
			const first = slide.blocks.find((b) => b.kind === "text");
			if (first && first.kind === "text") slide.fallbackTitle = (first.paragraphs[0]?.text ?? "").slice(0, 80);
		}
		slides.push(slide);
	}
	return { kind, width, height, widthPx: Math.round(width / EMU_PER_PX), heightPx: Math.round(height / EMU_PER_PX), slides };
}

export function slideTitle(slide: Slide): string {
	return slide.title || slide.fallbackTitle || `Slide ${slide.index}`;
}

/** Plain text used by search: title, body, table cells and notes. */
export function slideSearchText(slide: Slide): string {
	const parts: string[] = [slide.title];
	for (const b of slide.blocks) {
		if (b.kind === "text") for (const p of b.paragraphs) parts.push(p.text);
		else for (const r of b.rows) parts.push(r.join(" "));
	}
	parts.push(slide.notes);
	return parts.filter(Boolean).join("\n");
}

/** Slide numbers (1-based) whose text contains the query, case-insensitive. */
export function searchDeck(deck: Deck, query: string): number[] {
	const q = query.trim().toLocaleLowerCase();
	if (!q) return [];
	return deck.slides.filter((s) => slideSearchText(s).toLocaleLowerCase().includes(q)).map((s) => s.index);
}

export function slideToMarkdown(slide: Slide, notes = true): string {
	const lines: string[] = [`## ${mdEscapeInline(slideTitle(slide))}`];
	for (const b of slide.blocks) {
		lines.push("");
		if (b.kind === "text") {
			const only = b.paragraphs[0];
			if (b.paragraphs.length === 1 && b.subtitle && only) lines.push(`*${mdEscapeInline(only.text)}*`);
			else for (const p of b.paragraphs) lines.push(`${"  ".repeat(p.level)}- ${mdEscapeInline(p.text)}`);
		} else if (b.rows.length) {
			lines.push(markdownTable(b.rows).trimEnd());
		}
	}
	if (slide.notices.length) lines.push("", `*Not shown as text: ${slide.notices.map((n) => NOTICE_LABEL[n] ?? n).join(", ")}.*`);
	if (slide.notes && notes) lines.push("", "> **Notes:** " + slide.notes.split("\n").map(mdEscapeInline).join("\n> "));
	return lines.join("\n") + "\n";
}

export function deckToMarkdown(deck: Deck, fileName?: string): string {
	const head = fileName ? `# ${mdEscapeInline(fileName)}\n\n` : "";
	return head + deck.slides.map((s) => slideToMarkdown(s)).join("\n");
}

export function clampSlide(n: number, count: number): number {
	if (!Number.isFinite(n)) return 1;
	return Math.max(1, Math.min(Math.max(1, count), Math.floor(n)));
}
