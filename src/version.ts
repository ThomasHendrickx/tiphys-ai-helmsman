import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate this package's own package.json by walking up from the running
 * module's directory. The walk is depth-independent on purpose: the same
 * source runs from src/ (native type stripping) and from dist/src/
 * (compiled output), which sit at different depths below the package root.
 */
function findOwnPackageJson(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("package.json not found above " + import.meta.url);
    }
    dir = parent;
  }
}

export function readOwnVersion(): string {
  const raw = readFileSync(findOwnPackageJson(), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { version?: unknown }).version !== "string"
  ) {
    throw new Error("package.json has no string version field");
  }
  return (parsed as { version: string }).version;
}

/** The version subcommand: print the package.json version, exit 0. */
export function printVersion(): number {
  process.stdout.write(`${readOwnVersion()}\n`);
  return 0;
}
