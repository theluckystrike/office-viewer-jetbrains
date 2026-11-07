// Checks the first bytes and the ZIP directory before a page tries to draw the file,
// so empty, encrypted and wrong files get a plain message instead of a library error.
import { unzipSync } from "fflate";
import { PackageError, isZip } from "./zip";

export type PackageKind = "docx" | "pptx";

const MAIN_PART: Record<PackageKind, RegExp> = {
	docx: /^\/?word\/document[^/]*\.xml$/i,
	pptx: /^\/?ppt\/presentation\.xml$/i,
};

/** True for an OLE compound file (Word 97-2003, PowerPoint 97-2003, or a password-protected .docx/.pptx). */
export function isOle(bytes: Uint8Array): boolean {
	const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
	return bytes.length >= 8 && sig.every((b, i) => bytes[i] === b);
}

export function checkPackage(bytes: Uint8Array, kind: PackageKind): void {
	const what = kind === "docx" ? "Word document" : "PowerPoint presentation";
	if (bytes.length === 0) throw new PackageError("This file is empty (0 bytes).");
	if (isOle(bytes)) {
		throw new PackageError(
			"This file is password-protected, or it is an old binary Office file (97-2003) with a new extension. " +
				"The viewer cannot open encrypted files.",
		);
	}
	if (!isZip(bytes)) throw new PackageError(`This file is not a ${what}. It is not a ZIP package, so it may be damaged.`);
	const names: string[] = [];
	try {
		unzipSync(bytes, { filter(f) { names.push(f.name); return false; } });
	} catch (e) {
		throw new PackageError("The file is damaged or incomplete, so it could not be unzipped (" + (e instanceof Error ? e.message : String(e)) + ").");
	}
	if (!names.some((n) => MAIN_PART[kind].test(n))) {
		const part = kind === "docx" ? "word/document.xml" : "ppt/presentation.xml";
		throw new PackageError(`This ZIP file is not a ${what}: it has no ${part} part.`);
	}
}
