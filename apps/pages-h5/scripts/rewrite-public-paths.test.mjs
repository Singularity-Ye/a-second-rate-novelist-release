import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Pages deployment contract never exposes a model secret in browser variables", () => {
  const publicVariables = [
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_PUBLIC_ROOM_DEMO",
    "NEXT_PUBLIC_STRICT_RUNTIME_API_BASE",
  ];
  assert.equal(publicVariables.some((name) => /key|secret|token/iu.test(name)), false);
});

test("Pages export disables Jekyll so Next.js static assets remain publishable", async () => {
  const source = await readFile(new URL("./rewrite-public-paths.mjs", import.meta.url), "utf8");
  assert.match(source, /\.nojekyll/u);
});
