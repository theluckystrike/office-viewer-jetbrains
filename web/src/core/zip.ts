// Reads only the XML parts of an OOXML package (pptx, docx, xlsx). Media is skipped,
// so a deck full of videos still opens fast. Ported from the Zovo PPTX viewer.
import { unzipSync, strFromU8 } from "fflate";

const MAX_PART_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

export class PackageError extends Error {}

export function isZip(bytes: Uint8Array): boolean {
	return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
}

/** Map of part name -> XML string for the .xml and .rels parts. */
export function readXmlParts(bytes: Uint8Array): Map<string, string> {
	if (!isZip(bytes)) throw new PackageError("This file is not a ZIP package. It may be an old binary Office file or damaged.");
	let total = 0;
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes, {
			filter(f) {
				if (!/\.(xml|rels)$/i.test(f.name)) return false;
				if (f.originalSize > MAX_PART_BYTES) return false;
				total += f.originalSize;
				if (total > MAX_TOTAL_BYTES) throw new PackageError("The XML inside this file is larger than 256 MB. It was not opened.");
				return true;
			},
		});
	} catch (e) {
		if (e instanceof PackageError) throw e;
		throw new PackageError("The file could not be unzipped: " + (e instanceof Error ? e.message : String(e)));
	}
	const parts = new Map<string, string>();
	for (const [name, data] of Object.entries(files)) {
		if (data.length > MAX_PART_BYTES) continue;
		parts.set(name.replace(/^\/+/, ""), strFromU8(data));
	}
	return parts;
}

/** Resolves a relationship target against the folder of the source part. */
export function resolveTarget(sourcePart: string, target: string): string {
	if (target.startsWith("/")) return target.slice(1);
	const base = sourcePart.split("/").slice(0, -1);
	for (const seg of target.split("/")) {
		if (seg === "..") base.pop();
		else if (seg && seg !== ".") base.push(seg);
	}
	return base.join("/");
}

export function relsPathFor(part: string): string {
	const i = part.lastIndexOf("/");
	return part.slice(0, i + 1) + "_rels/" + part.slice(i + 1) + ".rels";
}
