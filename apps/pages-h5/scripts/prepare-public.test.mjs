import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(scriptDir, "../../h5/public");
const routeSnapshotRoot = resolve(scriptDir, "../../h5/app/room/route-publish/published");
const allowlistPath = resolve(scriptDir, "public-assets.allowlist.json");
const activeRuntimeFiles = [
  resolve(scriptDir, "../../h5/app/room/system/system-layer-panel.tsx"),
  resolve(scriptDir, "../../h5/app/room/system/system-layer-panel.module.css"),
  resolve(scriptDir, "../../h5/app/room/novelist/novelist-room.tsx"),
  resolve(scriptDir, "../../h5/app/room/novelist/novelist-room.module.css"),
  resolve(scriptDir, "../../h5/app/room/novelist/novelist-motion-actor.tsx"),
  resolve(scriptDir, "../../h5/app/room/reincarnation/reincarnation-flow.tsx"),
  resolve(scriptDir, "../../h5/app/room/reincarnation/reincarnation-flow.module.css"),
];
const publicAssetBudgetBytes = 25 * 1024 * 1024;
const publicUiAssetBudgetBytes = 300 * 1024;

async function readAllowlist() {
  return JSON.parse(await readFile(allowlistPath, "utf8"));
}

test("Pages public assets are an explicit runtime-only allowlist", async () => {
  const allowlist = await readAllowlist();
  assert.equal(Array.isArray(allowlist), true);
  assert.equal(allowlist.length > 0, true);
  assert.equal(new Set(allowlist).size, allowlist.length);
  assert.deepEqual(allowlist, [...allowlist].sort(), "public asset allowlist must stay sorted");

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

test("active room and published route asset references are present in the Pages allowlist", async () => {
  const allowlist = new Set(await readAllowlist());
  const routeSnapshots = (await readdir(routeSnapshotRoot))
    .filter((name) => name.endsWith(".formal-route-snapshot.v1.json"))
    .map((name) => resolve(routeSnapshotRoot, name));
  const references = new Set();
  const assetPattern = /\/assets\/[A-Za-z0-9_./+@() -]+\.(?:webp|png|jpe?g)/gu;

  for (const file of [...activeRuntimeFiles, ...routeSnapshots]) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(assetPattern)) references.add(match[0].slice(1));
  }

  assert.equal(references.size > 0, true);
  for (const reference of [...references].sort()) {
    assert.equal(allowlist.has(reference), true, `runtime asset is not public: ${reference}`);
    assert.equal((await stat(resolve(sourceRoot, reference))).isFile(), true, reference);
  }
});

test("Pages runtime assets stay within format and transfer budgets", async () => {
  const allowlist = await readAllowlist();
  let totalBytes = 0;
  for (const relativePath of allowlist) {
    const details = await stat(resolve(sourceRoot, relativePath));
    totalBytes += details.size;
    if (relativePath.startsWith("assets/ui/")) {
      assert.equal(/\.(?:png|jpe?g)$/iu.test(relativePath), false, `runtime UI must use WebP: ${relativePath}`);
      assert.equal(details.size <= publicUiAssetBudgetBytes, true, `runtime UI exceeds 300KiB: ${relativePath}`);
    }
  }
  assert.equal(totalBytes <= publicAssetBudgetBytes, true, `public assets exceed 25MiB: ${totalBytes}`);
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
