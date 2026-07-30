import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndexPaths = [
  path.resolve(__dirname, "../dist/index.js"),
  path.resolve(__dirname, "../dist/index.d.ts"),
];

for (const distIndexPath of distIndexPaths) {
  const source = await readFile(distIndexPath, "utf8");
  const patched = source.replace(
    /(export \* from "\.\/[^".]+)(?=";)/g,
    (_match, specifier) => `${specifier}.js`,
  );

  if (patched !== source) {
    await writeFile(distIndexPath, patched, "utf8");
  }
}
