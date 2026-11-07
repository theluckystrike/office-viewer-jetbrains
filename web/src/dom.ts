// Small DOM helpers so the views read like the Obsidian port they came from.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	if (parent) parent.appendChild(e);
	return e;
}

export function div(parent: HTMLElement, cls?: string, text?: string): HTMLDivElement {
	return el("div", cls, text, parent);
}

export function button(parent: HTMLElement, text: string, title: string, onClick: () => void): HTMLButtonElement {
	const b = el("button", "ov-btn", text, parent);
	b.title = title;
	b.setAttribute("aria-label", title);
	b.addEventListener("click", onClick);
	return b;
}

export function empty(e: HTMLElement): void {
	while (e.firstChild) e.removeChild(e.firstChild);
}
