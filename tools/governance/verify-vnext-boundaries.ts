import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findVnextBoundaryViolations } from "./vnext-boundaries/dependency-graph";

export type {
  VnextBoundaryRule,
  VnextBoundaryViolation,
} from "./vnext-boundaries/types";
export { findVnextBoundaryViolations };

function parseRootArgument(args: readonly string[]) {
  if (args.length === 0) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  }
  if (args.length === 2 && args[0] === "--root" && args[1] !== undefined) {
    return path.resolve(args[1]);
  }
  throw new Error("usage: verify-vnext-boundaries [--root <repo-root>]");
}

export function runVnextBoundaryVerification(args: readonly string[]) {
  const root = parseRootArgument(args);
  const violations = findVnextBoundaryViolations(root);
  if (violations.length === 0) {
    process.stdout.write("vNext boundary verification passed\n");
    return 0;
  }
  for (const violation of violations) {
    process.stderr.write(
      `${violation.file}:${violation.line} [${violation.rule}] ${violation.match}\n`,
    );
  }
  return 1;
}

function sameRealPath(left: string | undefined, right: string) {
  if (left === undefined || !existsSync(left)) {
    return false;
  }
  return realpathSync(left) === realpathSync(right);
}

if (sameRealPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = runVnextBoundaryVerification(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
