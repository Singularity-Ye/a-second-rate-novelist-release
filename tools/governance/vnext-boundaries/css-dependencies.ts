import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { isWithin } from "./policy";
import type { ViolationRecorder } from "./types";

interface CssScanOptions {
  entryPath: string;
  entryReferrer: { file: string; line: number };
  lexicalRoot: string;
  record: ViolationRecorder;
}

interface CssReference {
  line: number;
  specifier: string;
}

const TEST_CSS = /\.(?:spec|test)\.module\.css$/;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?[^;]*;/gi;
const CSS_COMPOSES = /composes\s*:[^;]*?\sfrom\s+(["'])([^"']+)\1/gi;

function lineAt(source: string, offset: number) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function analyzeCssSource(source: string) {
  const characters = source.split("");
  const code = new Uint8Array(source.length);
  let quote: "\"" | "'" | undefined;
  let escaped = false;
  let inComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (inComment) {
      if (character === "*" && nextCharacter === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        inComment = false;
      } else if (character !== "\r" && character !== "\n") {
        characters[index] = " ";
      }
      continue;
    }
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      inComment = true;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    code[index] = 1;
  }
  return { analyzableSource: characters.join(""), codePositions: code };
}

function collectCssReferences(
  file: string,
  source: string,
  record: ViolationRecorder,
) {
  const { analyzableSource, codePositions } = analyzeCssSource(source);
  const references: CssReference[] = [];
  const ranges: Array<readonly [number, number]> = [];
  for (const expression of [CSS_IMPORT, CSS_COMPOSES]) {
    expression.lastIndex = 0;
    for (
      let match = expression.exec(analyzableSource);
      match !== null;
      match = expression.exec(analyzableSource)
    ) {
      if (codePositions[match.index] !== 1) {
        continue;
      }
      references.push({ line: lineAt(analyzableSource, match.index), specifier: match[2]! });
      ranges.push([match.index, match.index + match[0].length]);
    }
  }

  const dependencySyntax = /@import\b|composes\s*:[^;]*\sfrom\b/gi;
  for (
    let match = dependencySyntax.exec(analyzableSource);
    match !== null;
    match = dependencySyntax.exec(analyzableSource)
  ) {
    if (codePositions[match.index] !== 1) {
      continue;
    }
    if (!ranges.some(([start, end]) => match!.index >= start && match!.index < end)) {
      record(
        file,
        lineAt(analyzableSource, match.index),
        "forbidden-import",
        "unsupported CSS dependency syntax",
      );
    }
  }
  return references;
}

function isTestCss(file: string) {
  return TEST_CSS.test(path.basename(file)) || file.split(path.sep).includes("__tests__");
}

export function scanCssDependencyGraph({
  entryPath,
  entryReferrer,
  lexicalRoot,
  record,
}: CssScanOptions) {
  const queue = [{
    file: path.resolve(entryPath),
    referrer: entryReferrer,
  }];
  const visited = new Set<string>();
  let realRoot: string;
  try {
    realRoot = realpathSync(lexicalRoot);
  } catch {
    record(entryPath, 1, "forbidden-import", "unresolved local dependency");
    return;
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    const lexicalFile = item.file;
    const report = (match: string) =>
      record(item.referrer.file, item.referrer.line, "forbidden-import", match);
    if (isTestCss(lexicalFile)) {
      report("test CSS dependency");
      continue;
    }
    if (!lexicalFile.endsWith(".module.css") || !isWithin(lexicalFile, lexicalRoot)) {
      report("CSS dependency escapes vNext boundary");
      continue;
    }
    if (!existsSync(lexicalFile)) {
      report("unresolved local dependency");
      continue;
    }

    let realFile: string;
    try {
      realFile = realpathSync(lexicalFile);
      if (!statSync(realFile).isFile()) {
        throw new Error("not a file");
      }
    } catch {
      report("unresolved local dependency");
      continue;
    }
    if (!isWithin(realFile, realRoot) || !realFile.endsWith(".module.css")) {
      report("symlink escapes vNext boundary");
      continue;
    }
    if (visited.has(realFile)) {
      continue;
    }
    visited.add(realFile);

    const source = readFileSync(realFile, "utf8");
    for (const reference of collectCssReferences(lexicalFile, source, record)) {
      if (
        !reference.specifier.startsWith(".") ||
        reference.specifier.includes("?") ||
        reference.specifier.includes("#")
      ) {
        record(
          lexicalFile,
          reference.line,
          "forbidden-import",
          "unsupported CSS dependency syntax",
        );
        continue;
      }
      const target = path.resolve(path.dirname(lexicalFile), reference.specifier);
      queue.push({
        file: target,
        referrer: { file: lexicalFile, line: reference.line },
      });
    }
  }
}
