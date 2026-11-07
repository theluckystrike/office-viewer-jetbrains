// Markdown helpers shared by the slide and sheet exports.

export function mdEscapeInline(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/([*_`[\]#<>|])/g, "\\$1").replace(/\r?\n/g, " ");
}

export function mdCell(s: string): string {
	return mdEscapeInline(s).trim() || " ";
}

/** A Markdown table. The first row is the header. Short rows are padded. */
export function markdownTable(rows: string[][]): string {
	if (!rows.length) return "";
	const cols = Math.max(1, ...rows.map((r) => r.length));
	const pad = (r: string[]): string[] => r.concat(Array<string>(Math.max(0, cols - r.length)).fill(""));
	const head = rows[0] ?? [];
	const lines = [
		"| " + pad(head).map(mdCell).join(" | ") + " |",
		"|" + " --- |".repeat(cols),
	];
	for (const r of rows.slice(1)) lines.push("| " + pad(r).map(mdCell).join(" | ") + " |");
	return lines.join("\n") + "\n";
}
