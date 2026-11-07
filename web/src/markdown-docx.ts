// "Copy as Markdown" for Word files: mammoth HTML (core/docx.ts), then the parser and Markdown
// writer from the Zovo DOCX viewer for VS Code (vendor/html.js).
import { docxToHtml } from "./core/docx";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const H = require("./vendor/html.js") as { parse(h: string): unknown; sanitize(t: unknown): { tree: unknown }; toMarkdown(t: unknown): string };

export async function docxToMarkdown(bytes: ArrayBuffer): Promise<string> {
	const { html } = await docxToHtml(bytes.slice(0));
	const clean = H.sanitize(H.parse(html));
	return H.toMarkdown(clean.tree);
}
