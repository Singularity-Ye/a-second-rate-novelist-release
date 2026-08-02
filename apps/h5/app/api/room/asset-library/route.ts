import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

const IMAGE_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg", ".gif", ".svg"]);
const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

type AssetLibraryItem = {
  src: string;
  name: string;
  relativePath: string;
  extension: string;
  bytes: number;
};

function assetsRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "h5"
    ? path.join(cwd, "public", "assets")
    : path.join(cwd, "apps", "h5", "public", "assets");
}

async function collectImages(root: string, current = root): Promise<AssetLibraryItem[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const items: AssetLibraryItem[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      items.push(...await collectImages(root, absolute));
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const relativePath = path.relative(root, absolute).split(path.sep).join("/");
    const stat = await fs.stat(absolute);
    items.push({
      src: `/assets/${relativePath}`,
      name: entry.name,
      relativePath,
      extension: extension.slice(1),
      bytes: stat.size,
    });
  }
  return items;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const requestedLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.round(requestedLimit)))
    : DEFAULT_LIMIT;
  try {
    const root = assetsRoot();
    const allItems = await collectImages(root);
    const filtered = query
      ? allItems.filter((item) => `${item.name} ${item.relativePath}`.toLowerCase().includes(query))
      : allItems;
    filtered.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return NextResponse.json({
      query,
      total: filtered.length,
      items: filtered.slice(0, limit),
    });
  } catch (error) {
    console.error("[asset-library] unable to scan public/assets", error);
    return NextResponse.json({ error: "项目资源目录暂时不可读" }, { status: 500 });
  }
}
