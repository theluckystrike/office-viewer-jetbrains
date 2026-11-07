// A small non-validating XML parser for OOXML parts, ported from the Zovo PPTX and DOCX viewers.
// It builds a plain tree { name, attrs, children }. No DTDs, no external entities, no network.

export interface XNode {
	name: string;
	attrs: Record<string, string>;
	children: (XNode | string)[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function decodeEntities(s: string): string {
	if (s.indexOf("&") < 0) return s;
	return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m: string, e: string) => {
		if (e.startsWith("#")) {
			const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
			try { return String.fromCodePoint(cp); } catch { return ""; }
		}
		return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] ?? m : m;
	});
}

function findTagEnd(text: string, from: number): number {
	let q: string | null = null;
	for (let k = from; k < text.length; k++) {
		const c = text[k];
		if (q) { if (c === q) q = null; } else if (c === "\"" || c === "'") q = c; else if (c === ">") return k;
	}
	return text.length;
}

function top(stack: XNode[]): XNode {
	return stack[stack.length - 1] as XNode;
}

function pushText(stack: XNode[], raw: string): void {
	if (raw) top(stack).children.push(decodeEntities(raw));
}

export function parseXml(text: string): XNode {
	const root: XNode = { name: "#document", attrs: {}, children: [] };
	const stack: XNode[] = [root];
	let i = 0;
	const n = text.length;
	while (i < n) {
		const lt = text.indexOf("<", i);
		if (lt < 0) { pushText(stack, text.slice(i)); break; }
		if (lt > i) pushText(stack, text.slice(i, lt));
		if (text.startsWith("<!--", lt)) {
			const end = text.indexOf("-->", lt + 4);
			i = end < 0 ? n : end + 3;
		} else if (text.startsWith("<![CDATA[", lt)) {
			const end = text.indexOf("]]>", lt + 9);
			top(stack).children.push(text.slice(lt + 9, end < 0 ? n : end));
			i = end < 0 ? n : end + 3;
		} else if (text[lt + 1] === "?" || text[lt + 1] === "!") {
			const end = text.indexOf(">", lt);
			i = end < 0 ? n : end + 1;
		} else if (text[lt + 1] === "/") {
			const end = text.indexOf(">", lt);
			const name = text.slice(lt + 2, end < 0 ? n : end).trim();
			// Pop up to the matching element; tolerate bad nesting.
			for (let k = stack.length - 1; k > 0; k--) {
				if (stack[k]?.name === name) { stack.length = k; break; }
			}
			i = end < 0 ? n : end + 1;
		} else {
			const end = findTagEnd(text, lt + 1);
			let body = text.slice(lt + 1, end);
			const selfClose = body.endsWith("/");
			if (selfClose) body = body.slice(0, -1);
			const sp = body.search(/\s/);
			const name = sp < 0 ? body : body.slice(0, sp);
			const attrs: Record<string, string> = {};
			if (sp >= 0) {
				ATTR_RE.lastIndex = 0;
				const rest = body.slice(sp);
				let m: RegExpExecArray | null;
				while ((m = ATTR_RE.exec(rest))) attrs[m[1] ?? ""] = decodeEntities(m[3] ?? m[4] ?? "");
			}
			const node: XNode = { name, attrs, children: [] };
			top(stack).children.push(node);
			if (!selfClose) stack.push(node);
			i = end + 1;
		}
	}
	return root;
}

/** Local name without the namespace prefix: "a:t" -> "t". */
export function local(name: string): string {
	const c = name.indexOf(":");
	return c < 0 ? name : name.slice(c + 1);
}

export function elements(node: XNode | null | undefined): XNode[] {
	return node ? node.children.filter((c): c is XNode => typeof c !== "string") : [];
}

export function child(node: XNode | null | undefined, name: string): XNode | null {
	return elements(node).find((c) => c.name === name) ?? null;
}

export function findAll(node: XNode, name: string, out: XNode[] = []): XNode[] {
	for (const c of elements(node)) {
		if (c.name === name) out.push(c);
		findAll(c, name, out);
	}
	return out;
}

export function find(node: XNode, name: string): XNode | null {
	for (const c of elements(node)) {
		if (c.name === name) return c;
		const f = find(c, name);
		if (f) return f;
	}
	return null;
}

export function textOf(node: XNode): string {
	let s = "";
	for (const c of node.children) s += typeof c === "string" ? c : textOf(c);
	return s;
}
