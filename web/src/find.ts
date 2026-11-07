// Find in rendered pages: wraps every match in <mark class="ov-hit">. Ported from the Zovo DOCX
// viewer (media/search.js) without the webview messaging.

export function clearMarks(root: HTMLElement): void {
	const marks = Array.from(root.querySelectorAll("mark.ov-hit"));
	for (const m of marks) {
		const parent = m.parentNode;
		if (!parent) continue;
		parent.replaceChild(m.ownerDocument.createTextNode(m.textContent ?? ""), m);
		parent.normalize();
	}
}

export function markMatches(root: HTMLElement, query: string, limit = 5000): HTMLElement[] {
	clearMarks(root);
	const q = query.trim().toLocaleLowerCase();
	if (!q) return [];
	const doc = root.ownerDocument;
	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const texts: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const t = n as Text;
		const parent = t.parentElement;
		if (!parent || parent.closest("style, script")) continue;
		if (t.data.toLocaleLowerCase().includes(q)) texts.push(t);
	}
	const out: HTMLElement[] = [];
	for (const t of texts) {
		let node: Text = t;
		for (;;) {
			const low = node.data.toLocaleLowerCase();
			const i = low.indexOf(q);
			if (i < 0 || low.length !== node.data.length || out.length >= limit) break;
			const hit = node.splitText(i);
			const rest = hit.splitText(q.length);
			const mark = doc.createElement("mark");
			mark.className = "ov-hit";
			hit.parentNode?.replaceChild(mark, hit);
			mark.appendChild(hit);
			out.push(mark);
			node = rest;
		}
		if (out.length >= limit) break;
	}
	return out;
}
