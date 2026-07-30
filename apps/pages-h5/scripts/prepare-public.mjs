import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const source = resolve(appRoot, "../h5/public");
const destination = resolve(appRoot, "public");
const allowlistPath = resolve(scriptDir, "public-assets.allowlist.json");

if (!destination.startsWith(`${appRoot}\\`) && !destination.startsWith(`${appRoot}/`)) {
  throw new Error("refusing to prepare public assets outside pages-h5");
}

const allowlist = JSON.parse(await readFile(allowlistPath, "utf8"));
if (!Array.isArray(allowlist) || allowlist.length === 0) {
  throw new Error("public asset allowlist must be a non-empty array");
}

const normalized = [...new Set(allowlist)].sort();
if (normalized.length !== allowlist.length) {
  throw new Error("public asset allowlist contains duplicate entries");
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const relativePath of normalized) {
  if (
    typeof relativePath !== "string"
    || relativePath.length === 0
    || relativePath.includes("\\")
    || relativePath.startsWith("/")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`invalid public asset allowlist entry: ${JSON.stringify(relativePath)}`);
  }

  const sourceFile = resolve(source, relativePath);
  const destinationFile = resolve(destination, relativePath);
  const sourcePrefix = `${source}\\`;
  const destinationPrefix = `${destination}\\`;
  if (
    (!sourceFile.startsWith(sourcePrefix) && !sourceFile.startsWith(`${source}/`))
    || (!destinationFile.startsWith(destinationPrefix) && !destinationFile.startsWith(`${destination}/`))
  ) {
    throw new Error(`public asset escaped its allowed root: ${relativePath}`);
  }

  await mkdir(dirname(destinationFile), { recursive: true });
  await cp(sourceFile, destinationFile, { force: false, errorOnExist: true });
}
