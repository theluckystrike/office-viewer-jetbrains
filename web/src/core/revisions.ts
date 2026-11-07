// Tracked changes summary, read-only. Ported from the Zovo DOCX viewer (src/revisions.js).
// Run-level w:ins / w:del / w:moveFrom / w:moveTo count as changes. The same tags inside w:rPr
// mark a changed paragraph mark or run property, not changed text, so they are left out.
import { parseXml, elements, findAll, XNode } from "./xml";
import { readXmlParts } from "./zip";

const QUICK = /<w:(ins|del|moveFrom|moveTo)[\s>]/;
const CHANGE_TAGS: Record<string, "ins" | "del"> = { "w:ins": "ins", "w:moveTo": "ins", "w:del": "del", "w:moveFrom": "del" };

export interface Change { kind: "ins" | "del"; author: string; date: string }
export interface RevisionSummary { changes: number; insertions: number; deletions: number; authors: string[]; comments: number; list: Change[] }

export function hasChanges(documentXml: string): boolean {
	return QUICK.test(documentXml);
}

function changeElements(node: XNode, parent: string, out: XNode[]): XNode[] {
	for (const c of elements(node)) {
		if (CHANGE_TAGS[c.name] && parent !== "w:rPr") out.push(c);
		changeElements(c, c.name, out);
	}
	return out;
}

export function summarize(documentXml: string, commentsXml?: string): RevisionSummary {
	const s: RevisionSummary = { changes: 0, insertions: 0, deletions: 0, authors: [], comments: 0, list: [] };
	if (hasChanges(documentXml)) {
		for (const el of changeElements(parseXml(documentXml), "", [])) {
			const kind = CHANGE_TAGS[el.name] ?? "ins";
			const author = el.attrs["w:author"] || "Unknown author";
			s.changes++;
			if (kind === "ins") s.insertions++; else s.deletions++;
			if (!s.authors.includes(author)) s.authors.push(author);
			s.list.push({ kind, author, date: (el.attrs["w:date"] ?? "").slice(0, 10) });
		}
	}
	if (commentsXml) s.comments = findAll(parseXml(commentsXml), "w:comment").length;
	return s;
}

/** Summary straight from the .docx bytes. */
export function summarizeDocx(bytes: Uint8Array): RevisionSummary {
	const parts = readXmlParts(bytes);
	return summarize(parts.get("word/document.xml") ?? "", parts.get("word/comments.xml"));
}

/** Bar text, for example "3 changes by 2 people, 1 comment". Empty when there is nothing. */
export function label(s: RevisionSummary): string {
	const out: string[] = [];
	if (s.changes) {
		const people = s.authors.length;
		out.push(`${s.changes} ${s.changes === 1 ? "change" : "changes"} by ${people} ${people === 1 ? "person" : "people"}`);
	}
	if (s.comments) out.push(`${s.comments} ${s.comments === 1 ? "comment" : "comments"}`);
	return out.join(", ");
}
