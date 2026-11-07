// Word to HTML for "Copy as Markdown" (mammoth). Images are left out so the clipboard stays small.
import mammoth from "mammoth";

export async function docxToHtml(bytes: ArrayBuffer): Promise<{ html: string; warnings: number }> {
	const res = await mammoth.convertToHtml({ arrayBuffer: bytes, buffer: bytes } as unknown as { arrayBuffer: ArrayBuffer }, {
		convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
		// Word's Title and Subtitle styles, as in the Zovo DOCX viewer for VS Code (src/convert.js STYLE_MAP).
		styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh", "p[style-name='Quote'] => blockquote > p:fresh"],
	});
	const html = res.value.replace(/<img src=""\s*\/?>/g, "");
	return { html, warnings: res.messages.length };
}
