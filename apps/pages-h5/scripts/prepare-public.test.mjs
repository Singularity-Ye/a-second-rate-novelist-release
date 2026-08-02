import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(scriptDir, "../../h5/public");
const routeSnapshotRoot = resolve(scriptDir, "../../h5/app/room/route-publish/published");
const allowlistPath = resolve(scriptDir, "public-assets.allowlist.json");

async function readAllowlist() {
  return JSON.parse(await readFile(allowlistPath, "utf8"));
}

test("Pages public assets are an explicit runtime-only allowlist", async () => {
  const allowlist = await readAllowlist();
  assert.equal(Array.isArray(allowlist), true);
  assert.equal(allowlist.length, 58);
  assert.equal(new Set(allowlist).size, allowlist.length);

  const forbiddenFragments = [
    "reference-pack",
    "source-png",
    "_deprecated",
    ".tmp",
    "compression-manifest",
    ".env",
  ];

  for (const relativePath of allowlist) {
    assert.equal(typeof relativePath, "string");
    assert.equal(relativePath.startsWith("assets/"), true, relativePath);
    assert.equal(relativePath.includes("\\"), false, relativePath);
    assert.equal(relativePath.split("/").includes(".."), false, relativePath);
    assert.equal(forbiddenFragments.some((fragment) => relativePath.includes(fragment)), false, relativePath);
    assert.equal((await stat(resolve(sourceRoot, relativePath))).isFile(), true, relativePath);
  }
});

test("the Xuanzhu release package contains only eleven pages, one card and its manifest", async () => {
  const allowlist = await readAllowlist();
  const xuanzhu = allowlist
    .filter((entry) => entry.startsWith("assets/prologue/reincarnation/xuanzhu/v1/"))
    .sort();
  const expected = [
    ...Array.from({ length: 11 }, (_, index) => `assets/prologue/reincarnation/xuanzhu/v1/b${String(index + 1).padStart(2, "0")}.webp`),
    "assets/prologue/reincarnation/xuanzhu/v1/character-card.webp",
    "assets/prologue/reincarnation/xuanzhu/v1/manifest.json",
  ].sort();
  assert.deepEqual(xuanzhu, expected);
});

test("published route snapshots reference public assets instead of embedding image data", async () => {
  const snapshots = (await readdir(routeSnapshotRoot))
    .filter((name) => name.endsWith(".formal-route-snapshot.v1.json"));

  assert.equal(snapshots.length > 0, true);
  for (const snapshot of snapshots) {
    const source = await readFile(resolve(routeSnapshotRoot, snapshot), "utf8");
    assert.equal(source.includes("data:image/"), false, snapshot);
  }
});
