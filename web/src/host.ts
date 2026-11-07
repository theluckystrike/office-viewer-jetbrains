// Bridge between the page and the IDE. The page runs in a JCEF browser on the private origin
// http://zovo-viewer/. The IDE injects window.zovoHost (backed by JBCefJSQuery) after the page
// loads; messages sent before that wait in a queue. The IDE calls window.zovoCommand(name, arg)
// for its toolbar buttons and window.zovoTheme("dark" | "light") when the IDE theme changes.

export interface HostMessage { type: string; [k: string]: unknown }

declare global {
	interface Window {
		zovoHost?: { send(json: string): void };
		zovoCommand?: (name: string, arg?: string) => void;
		zovoTheme?: (theme: string) => void;
		__zovoFlush?: () => void;
	}
}

const queue: string[] = [];
const commands = new Map<string, (arg?: string) => void>();

export function send(msg: HostMessage): void {
	const json = JSON.stringify(msg);
	if (window.zovoHost) window.zovoHost.send(json);
	else queue.push(json);
}

window.__zovoFlush = (): void => {
	while (queue.length && window.zovoHost) window.zovoHost.send(queue.shift() as string);
};

export function onCommand(name: string, fn: (arg?: string) => void): void {
	commands.set(name, fn);
}

window.zovoCommand = (name: string, arg?: string): void => {
	const fn = commands.get(name);
	if (fn) fn(arg);
};

export function applyTheme(theme: string): void {
	document.documentElement.classList.toggle("theme-dark", theme === "dark");
	document.documentElement.classList.toggle("theme-light", theme !== "dark");
}
window.zovoTheme = applyTheme;

export interface Params { theme: string; name: string; ext: string }

export function params(): Params {
	const q = new URLSearchParams(location.search);
	return { theme: q.get("theme") ?? "light", name: q.get("name") ?? "document", ext: (q.get("ext") ?? "").toLowerCase() };
}

/** The file bytes come from the same private origin, so no base64 copy goes through JavaScript calls. */
export async function loadFile(): Promise<ArrayBuffer> {
	const r = await fetch("/file", { cache: "no-store" });
	if (!r.ok) throw new Error("The IDE could not read the file (HTTP " + r.status + ").");
	return r.arrayBuffer();
}
