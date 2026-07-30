import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputRoot = resolve(scriptDir, "../out");
const requestedBasePath = process.env.PAGES_BASE_PATH?.trim() ?? "";
const basePath = requestedBasePath && requestedBasePath !== "/"
  ? `/${requestedBasePath.replace(/^\/+|\/+$/gu, "")}`
  : "";
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".txt", ".xml"]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(target));
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) files.push(target);
  }
  return files;
}

function withBasePath(text, publicPath) {
  if (!basePath) return text;
  const protectedMarker = `__ERLIU_BASE_PATH_${publicPath.replace(/[^a-z]/giu, "_")}__`;
  return text
    .replaceAll(`${basePath}${publicPath}`, protectedMarker)
    .replaceAll(publicPath, `${basePath}${publicPath}`)
    .replaceAll(protectedMarker, `${basePath}${publicPath}`);
}

for (const file of await filesBelow(outputRoot)) {
  const original = await readFile(file, "utf8");
  const rewritten = withBasePath(withBasePath(original, "/assets/"), "/icon.svg");
  if (rewritten !== original) await writeFile(file, rewritten, "utf8");
}

// Branch-based GitHub Pages deployments otherwise run the exported tree
// through Jekyll, which ignores Next.js' required `_next` directory.
await writeFile(resolve(outputRoot, ".nojekyll"), "", "utf8");

if (basePath) {
  const unresolved = [];
  for (const file of await filesBelow(outputRoot)) {
    const text = await readFile(file, "utf8");
    const protectedText = text.replaceAll(`${basePath}/assets/`, "");
    if (protectedText.includes("/assets/")) unresolved.push(file);
  }
  if (unresolved.length > 0) {
    throw new Error(`unresolved root-relative assets in ${unresolved.length} exported files`);
  }
}
