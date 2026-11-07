import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { docxToMarkdown } from "../src/markdown-docx";
import { summarizeDocx, label, summarize } from "../src/core/revisions";
import { parseDeck, deckToMarkdown, searchDeck, slideToMarkdown, clampSlide } from "../src/core/pptx";
import { markdownTable, mdEscapeInline } from "../src/core/markdown";
import { stepZoom } from "../src/core/grid";
import { docxToHtml } from "../src/core/docx";
import { parseXml, find, textOf } from "../src/core/xml";
import { isZip, readXmlParts, resolveTarget, relsPathFor } from "../src/core/zip";

const fx = (n: string): Uint8Array => new Uint8Array(readFileSync(path.join(__dirname, "..", "test", "fixtures", n)));
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

test("xml parser keeps text, attributes and entities", () => {
	const doc = parseXml('<?xml version="1.0"?><a:p x="1 &amp; 2"><a:t>Tom &amp; Jerry &#x263A;</a:t><!-- c --><a:br/></a:p>');
	const p = find(doc, "a:p");
	assert.equal(p?.attrs.x, "1 & 2");
	assert.equal(textOf(p!), "Tom & Jerry ☺");
});

test("zip helpers resolve OOXML relationship paths", () => {
	assert.equal(resolveTarget("ppt/slides/slide1.xml", "../notesSlides/notesSlide1.xml"), "ppt/notesSlides/notesSlide1.xml");
	assert.equal(relsPathFor("ppt/presentation.xml"), "ppt/_rels/presentation.xml.rels");
	assert.equal(isZip(new Uint8Array([1, 2, 3, 4])), false);
	assert.throws(() => readXmlParts(new TextEncoder().encode("not a zip at all")), /not a ZIP/);
});

test("revisions: tracked.docx has insertions and deletions with authors", () => {
	const s = summarizeDocx(fx("tracked.docx"));
	assert.ok(s.changes >= 2, "changes " + s.changes);
	assert.ok(s.insertions >= 1 && s.deletions >= 1);
	assert.ok(s.authors.length >= 1);
	assert.match(label(s), /^\d+ changes by \d+ (person|people)/);
});

test("revisions: a clean document has no changes; w:ins inside w:rPr is not a text change", () => {
	assert.equal(summarizeDocx(fx("sample.docx")).changes, 0);
	const xml = '<w:document><w:body><w:p><w:pPr><w:rPr><w:ins w:author="A"/></w:rPr></w:pPr><w:ins w:author="B" w:date="2026-01-02T00:00:00Z"><w:r><w:t>x</w:t></w:r></w:ins></w:p></w:body></w:document>';
	const s = summarize(xml);
	assert.equal(s.changes, 1);
	assert.deepEqual(s.authors, ["B"]);
	assert.equal(s.list[0]?.date, "2026-01-02");
	assert.equal(label(summarize("<w:document/>")), "");
});

test("pptx: slide list, titles and speaker notes", () => {
	const deck = parseDeck(fx("quarterly-review.pptx"));
	assert.ok(deck.slides.length >= 2, "slides " + deck.slides.length);
	assert.ok(deck.widthPx > 0 && deck.heightPx > 0);
	assert.ok(deck.slides.some((s) => s.title.length > 0));
	assert.ok(deck.slides.some((s) => s.notes.length > 0), "some slide has notes");
	deck.slides.forEach((s, i) => assert.equal(s.index, i + 1));
	assert.equal(clampSlide(99, deck.slides.length), deck.slides.length);
	assert.equal(clampSlide(-3, deck.slides.length), 1);
});

test("pptx: Markdown export and search", () => {
	const deck = parseDeck(fx("quarterly-review.pptx"));
	const md = deckToMarkdown(deck, "quarterly-review");
	assert.match(md, /^# quarterly-review\n\n## /);
	assert.equal((md.match(/^## /gm) ?? []).length, deck.slides.length);
	const first = deck.slides[0]!;
	const word = (first.title || first.fallbackTitle || "").split(/\s+/)[0] ?? "";
	assert.ok(searchDeck(deck, word.toUpperCase()).includes(1));
	assert.deepEqual(searchDeck(deck, "   "), []);
	assert.match(slideToMarkdown({ index: 3, title: "", blocks: [{ kind: "table", rows: [["a|b", "c"], ["1"]] }], notes: "n", notices: ["video"], images: 0, hidden: false }), /## Slide 3\n\n\| a\\\|b \| c \|\n\| --- \| --- \|\n\| 1 \|   \|[\s\S]*video[\s\S]*Notes/);
});

test("Markdown escaping and zoom steps", () => {
	assert.equal(mdEscapeInline("a*b|c\nd"), "a\\*b\\|c d");
	assert.equal(markdownTable([]), "");
	assert.equal(markdownTable([["h"], ["1", "2"]]), "| h |   |\n| --- | --- |\n| 1 | 2 |\n");
	assert.equal(stepZoom(1, 1), 1.1);
	assert.equal(stepZoom(1, -1), 0.9);
});

test("docx to HTML for Markdown export (mammoth), images left out", async () => {
	const { html } = await docxToHtml(ab(fx("sample.docx")));
	assert.ok(html.length > 100);
	assert.ok(!/<img/.test(html));
	assert.match(html, /<(p|h1|h2|table)/);
});

test("docx Copy as Markdown: headings and text from sample.docx, nothing from tracked deletions", async () => {
	const md = await docxToMarkdown(ab(fx("sample.docx")));
	assert.ok(md.length > 200, "markdown " + md.length);
	assert.match(md, /^#{1,3} \S/m);
	assert.match(md, /^# \S/, "the Title style becomes the first heading");
	const tracked = await docxToMarkdown(ab(fx("tracked.docx")));
	assert.ok(tracked.trim().length > 0);
});

test(".dotx, .ppsx and renamed files parse with the same cores", () => {
	assert.equal(summarizeDocx(fx("sample.dotx")).changes, 0);
	assert.ok(parseDeck(fx("quarterly-review.ppsx")).slides.length >= 2);
	assert.ok(parseDeck(fx("renamed-pptx.ppt")).slides.length >= 2, "a .pptx saved as .ppt");
	assert.ok(isZip(fx("docx-as.doc")), "a .docx saved as .doc is a zip");
	assert.equal(isZip(fx("legacy.doc")), false);
	assert.equal(isZip(fx("legacy-basic.ppt")), false);
	const many = parseDeck(fx("many-slides.pptx"));
	assert.ok(many.slides.length >= 20, "many-slides " + many.slides.length);
});

test("bundles: one per format, no VS Code API, page shells load them from the private origin", () => {
	const web = path.join(__dirname, "..", "..", "src", "main", "resources", "web");
	for (const k of ["docx", "pptx"]) {
		const js = readFileSync(path.join(web, k + ".js"), "utf8");
		const html = readFileSync(path.join(web, k + ".html"), "utf8");
		assert.ok(js.length > 100000, k + ".js size");
		assert.ok(!js.includes("acquireVsCodeApi"), k + ".js has no VS Code API");
		assert.ok(js.includes("zovoHost") && js.includes("/file"), k + ".js uses the IDE bridge and the file route");
		assert.match(html, new RegExp('<script src="' + k + '\\.js"></script>'));
		assert.match(html, /default-src 'self'/);
	}
	assert.ok(existsSync(path.join(web, "viewer.css")));
});
