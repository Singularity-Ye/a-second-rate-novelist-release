import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputRoot = resolve(scriptDir, "../out");
const requestedBasePath = process.env.PAGES_BASE_PATH?.trim() ?? "";
const basePath = requestedBasePath && requestedBasePath !== "/"
  ? `/${requestedBasePath.replace(/^\/+|\/+$/gu, "")}`
  : "";
const textExtensions = new Set([".css", ".html", ".js", ".json", ".txt"]);
const nonFetchingMigrationReferences = new Set([
  "assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp",
  "assets/ecology/formal-scenes/entrance/entrance-scene-master-2x1-v1.webp",
  "assets/ecology/formal-scenes/entrance/entrance-scene-master-transit-hub-v1-lossless.webp",
]);

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(target));
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) files.push(target);
  }
  return files;
}

const references = new Set();
const escapedBasePath = basePath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const assetPattern = new RegExp(
  `${escapedBasePath}/assets/[A-Za-z0-9_./+@%()\\-]+?\\.(?:avif|jpe?g|png|svg|webp)(?=["'\\s)?,#]|$)`,
  "gu",
);
for (const file of await filesBelow(outputRoot)) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(assetPattern)) {
    references.add(match[0].slice(basePath.length + 1).split(/[?#]/u, 1)[0]);
  }
}

const missing = [];
for (const reference of [...references].sort()) {
  if (nonFetchingMigrationReferences.has(reference)) continue;
  try {
    if (!(await stat(resolve(outputRoot, reference))).isFile()) missing.push(reference);
  } catch {
    missing.push(reference);
  }
}

if (missing.length > 0) {
  throw new Error(`exported Pages output has ${missing.length} missing runtime assets:\n${missing.join("\n")}`);
}

console.log(JSON.stringify({ exportedAssetReferences: references.size, missing: 0 }));
