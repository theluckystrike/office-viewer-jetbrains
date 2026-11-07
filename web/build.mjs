// Builds the two viewer bundles (docx.js, pptx.js) with esbuild and copies them, with the HTML
// pages and viewer.css, into ../src/main/resources/web/. The Gradle build only packs those files,
// so a plugin build does not need Node. Run `npm run bundle` after changing anything under web/.
// `node build.mjs --tests` bundles test/*.test.{ts,js} for node:test instead.
import esbuild from "esbuild";
import { readdirSync, rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, "..", "src", "main", "resources", "web");
const common = {
	bundle: true, platform: "browser", target: "chrome120", format: "iife", minify: true, legalComments: "none",
	logLevel: "warning", metafile: true,
	// jszip from source with "stream" stubbed, as in the Obsidian build: the prebuilt file asks for Node streams.
	alias: { jszip: path.join(here, "node_modules/jszip/lib/index.js"), stream: path.join(here, "empty-stream.js") },
	define: { "process.env.NODE_ENV": "\"production\"" },
};

if (process.argv.includes("--tests")) {
	rmSync(path.join(here, ".test-out"), { recursive: true, force: true });
	const entries = readdirSync(path.join(here, "test")).filter((f) => /\.test\.(ts|js)$/.test(f)).map((f) => path.join(here, "test", f));
	await esbuild.build({ entryPoints: entries, bundle: true, platform: "node", format: "cjs", target: "node18", outdir: path.join(here, ".test-out"), outExtension: { ".js": ".cjs" }, logLevel: "warning" });
} else {
	mkdirSync(out, { recursive: true });
	const packages = new Map();
	for (const name of ["docx", "pptx"]) {
		const r = await esbuild.build({ ...common, entryPoints: [path.join(here, "src", name + "-main.ts")], outfile: path.join(out, name + ".js") });
		for (const input of Object.keys(r.metafile.inputs)) {
			const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
			if (m && !packages.has(m[1])) packages.set(m[1], path.join(here, "node_modules", m[1]));
		}
	}
	for (const f of ["docx.html", "pptx.html", "viewer.css"]) copyFileSync(path.join(here, "pages", f), path.join(out, f));
	// THIRD-PARTY-NOTICES.md lists every npm package that went into a bundle, with its license text.
	const allowed = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|\(MIT OR GPL-3\.0-or-later\)|MIT OR GPL-3\.0-or-later|BlueOak-1\.0\.0|0BSD|\(MIT AND Zlib\))$/;
	let md = "# Third-party notices\n\nDOCX & PPTX Viewer is MIT licensed. The viewer pages in `src/main/resources/web/` bundle the npm packages below.\n";
	const problems = [];
	for (const [name, dir] of [...packages].sort()) {
		const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
		const lic = typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? "UNKNOWN";
		if (!allowed.test(lic)) problems.push(`${name}: ${lic}`);
		const file = readdirSync(dir).find((f) => /^(license|licence|copying)(\.md|\.txt)?$/i.test(f));
		md += `\n## ${name} ${pkg.version}\n\nLicense: ${lic}${lic.includes("GPL") ? " (used under MIT)" : ""}\n`;
		if (file) md += "\n```text\n" + readFileSync(path.join(dir, file), "utf8").trim() + "\n```\n";
	}
	writeFileSync(path.join(here, "..", "THIRD-PARTY-NOTICES.md"), md);
	if (problems.length) { console.error("License check failed: " + problems.join(", ")); process.exit(1); }
	console.log(`Bundled ${packages.size} packages: ${[...packages.keys()].sort().join(", ")}`);
	for (const f of readdirSync(out)) console.log(`  web/${f} ${readFileSync(path.join(out, f)).length} bytes`);
	if (!existsSync(path.join(out, "docx.js"))) process.exit(1);
}
