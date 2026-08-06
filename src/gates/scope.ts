import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EX_USAGE } from "../cli.ts";
import {
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import { formatDiagnostics, loadSchema, validate } from "./validate.ts";
import type { SchemaDocument } from "./validate.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type { GateResultFields, GateStatus } from "./result.ts";

/**
 * THE SCOPE AUDITOR (kernel plan M2, M2-P4).
 *
 * Makes "every changed path is on the phase's declared list, or a declared
 * extra, or one of the two standing extras" a check with an exit code,
 * derived from the diff rather than trusted to a prose deviation section.
 *
 * WHY THIS IS A STANDALONE SCRIPT AND NOT A `tiphys gates` SUBCOMMAND. This
 * phase's files-to-touch list (delivery/plan/phase-declarations/m2-p4.json,
 * committed on `main` before this branch existed, read at M2-C-1) does not
 * include src/cli.ts or src/commands/gates.ts, and M2-D-19's concurrency
 * structure runs seven phases against the same shared files without
 * re-serializing them. So this module is both the gate's logic and its own
 * entry point, invoked directly as `node src/gates/scope.ts ...args`, the
 * way `gates.manifest.json`'s `manifest-self-check` entry invokes
 * `bin/tiphys.ts` for the ONE gate that phase's file list does own.
 *
 * THE ANTI-WIDENING PROPERTY (criterion 5, this phase's reason to exist).
 * The declaration is read from the MERGE BASE of `--base` and `--head` via
 * `git show <mergeBaseSha>:<path>`, which reads the git object database and
 * never touches the working tree at that path, so an implementer's own
 * edit to the declaration on the branch being audited cannot change what
 * this run considers authorized. The merge base is computed explicitly
 * with `git merge-base`, and diffs are computed against THAT commit, never
 * against `--base` directly and never against `main`'s current tip: if
 * `main` has advanced past the true fork point by the time this runs
 * (another phase merged in the interim), diffing directly against `--base`
 * would misattribute every path `main` changed afterward to this branch.
 * `--base`/`--head` are still both required (a check that cannot compute a
 * merge base has not reached a verdict, M2-C-3).
 *
 * M2-C-6, applied. `--result` and the optional `--evidence` side artifact
 * are opened only through `refuseOpenForWrite`. The phase-declaration
 * schema document, shipped with this gate, is read through
 * `readRegularFileIfPresent`, the same pattern src/gates/manifest.ts uses
 * for its own two schema documents. The declaration ITSELF is never opened
 * as a filesystem path at all: it is read out of the git object database by
 * `git show`, which cannot be blocked by a named pipe sitting at that path
 * in the working tree, because a git ref lookup never touches the working
 * tree's inode at all. This is a stronger guarantee than classifyEntry
 * would give a filesystem read, and it exists here as a side effect of the
 * anti-widening design, not as a second implementation of the primitive.
 *
 * RENAMES AND DELETIONS (criteria 3 and 4). `git diff --name-status`
 * reports a rename as one line carrying both the old and the new path; this
 * module treats a rename or copy as touching BOTH names, so an old path
 * that leaves the declared set and a new path that never entered it are
 * each auditable on their own. A deletion is one line carrying only the
 * path that stopped existing, audited the same way an addition or a
 * modification is: present in the diff, so it must be declared.
 */

const USAGE =
  "usage: node src/gates/scope.ts --declarations <dir> --result <file> " +
  "[--evidence <dir>] --base <ref> [--head <ref>] --phase <id>";

interface Flags {
  declarations?: string;
  result?: string;
  evidence?: string;
  base?: string;
  head?: string;
  phase?: string;
}

const VALUE_FLAGS = [
  "--declarations",
  "--result",
  "--evidence",
  "--base",
  "--head",
  "--phase",
] as const;

function parseFlags(args: string[]): Flags | undefined {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || !(VALUE_FLAGS as readonly string[]).includes(flag)) {
      return undefined;
    }
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }
    const key = flag.slice(2) as keyof Flags;
    flags[key] = value;
    index += 1;
  }
  return flags;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys gates scope: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

/* -------------------------------------------------------------------- */
/* The phase-declaration schema document (M2-C-6: opened through the     */
/* delivered primitive, the same pattern src/gates/manifest.ts uses).    */
/* -------------------------------------------------------------------- */

const schemaDirectory = new URL("./schemas/", import.meta.url);
let cachedSchema: SchemaDocument | undefined;

function declarationSchema(): SchemaDocument {
  if (cachedSchema !== undefined) {
    return cachedSchema;
  }
  const path = fileURLToPath(new URL("phase-declaration.schema.json", schemaDirectory));
  const read = readRegularFileIfPresent(path);
  if (read.kind !== "read") {
    throw new Error(
      read.kind === "absent"
        ? `schema document ${path} is missing from this installation`
        : read.reason,
    );
  }
  const parsed = JSON.parse(read.body) as unknown;
  const loaded = loadSchema(parsed, "phase-declaration.schema.json");
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  cachedSchema = loaded.schema;
  return cachedSchema;
}

interface PhaseDeclaration {
  id: string;
  branch: string;
  filesToTouch: string[];
  declaredExtras: string[];
  citations: string[];
}

/* -------------------------------------------------------------------- */
/* git plumbing, pinned against REAL captured output (work history).     */
/* -------------------------------------------------------------------- */

function runGit(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("git", args, { cwd });
}

function bufferToUtf8(value: Buffer | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString("utf8");
}

type MergeBaseResult = { ok: true; sha: string } | { ok: false; reason: string };

function resolveMergeBase(cwd: string, base: string, head: string): MergeBaseResult {
  const result = runGit(cwd, ["merge-base", base, head]);
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git merge-base ${base} ${head} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git merge-base ${base} ${head} exited ${String(result.status)}: ${singleLine(bufferToUtf8(result.stderr))}`,
    };
  }
  const sha = bufferToUtf8(result.stdout).trim();
  if (sha === "") {
    return {
      ok: false,
      reason: `git merge-base ${base} ${head} produced no output`,
    };
  }
  return { ok: true, sha };
}

interface TouchedPath {
  path: string;
  status: string;
}

type DiffResult = { ok: true; paths: TouchedPath[] } | { ok: false; reason: string };

/**
 * `git diff --name-status <mergeBase> <head>`. Never `<base> <head>` and
 * never against `main`'s tip: see the module comment on the anti-widening
 * property. A rename or copy line (`R###` / `C###`) carries the old path
 * and the new path tab-separated on one line; every other status carries
 * exactly one path. Pinned against the captured shape in this phase's work
 * history, not against a hand-written example (MECHANISMS.md, "Deciding
 * what another program will do by pattern-matching the text of a file it
 * consumes").
 */
function computeTouchedPaths(cwd: string, mergeBase: string, head: string): DiffResult {
  const result = runGit(cwd, ["diff", "--name-status", mergeBase, head]);
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git diff --name-status ${mergeBase} ${head} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git diff --name-status ${mergeBase} ${head} exited ${String(result.status)}: ${singleLine(bufferToUtf8(result.stderr))}`,
    };
  }
  const lines = bufferToUtf8(result.stdout)
    .split("\n")
    .filter((line) => line !== "");
  const paths: TouchedPath[] = [];
  for (const line of lines) {
    const fields = line.split("\t");
    const status = fields[0] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = fields[1];
      const newPath = fields[2];
      if (oldPath === undefined || newPath === undefined) {
        return {
          ok: false,
          reason: `git diff --name-status produced an unparseable rename/copy line: ${JSON.stringify(line)}`,
        };
      }
      paths.push({ path: oldPath, status });
      paths.push({ path: newPath, status });
      continue;
    }
    const path = fields[1];
    if (path === undefined) {
      return {
        ok: false,
        reason: `git diff --name-status produced an unparseable line: ${JSON.stringify(line)}`,
      };
    }
    paths.push({ path, status });
  }
  return { ok: true, paths };
}

/** Best-effort branch name for a red detail line; never load-bearing for logic. */
function currentBranch(cwd: string): string {
  const result = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (result.error !== undefined || result.status !== 0) {
    return "<unknown>";
  }
  const name = bufferToUtf8(result.stdout).trim();
  return name === "" ? "<unknown>" : name;
}

/**
 * Text git emits for "this path does not exist at this commit", captured
 * for the direct case (this phase's work history) and, for the second
 * shape, taken from git's own documented message for the same condition
 * reached through an unstaged path, RECORDED as an unreproduced derivation
 * gap in the work history rather than asserted as witnessed. Every other
 * nonzero `git show` outcome is ERROR, never a guessed RED (M2-C-3).
 */
const DECLARATION_ABSENT_PATTERNS = [/does not exist in/, /exists on disk, but not in/];

type DeclarationLoad =
  | { ok: true; declaration: PhaseDeclaration; sha256: string; path: string }
  | { ok: false; kind: "missing"; path: string }
  | { ok: false; kind: "error"; reason: string };

/**
 * Read `<declarationsDir>/<phase>.json` out of the MERGE BASE commit, never
 * out of the working tree and never out of `--head`. This is the one
 * function the anti-widening property depends on.
 */
function loadDeclarationAtMergeBase(
  cwd: string,
  mergeBase: string,
  declarationsDir: string,
  phase: string,
): DeclarationLoad {
  const relPath = `${declarationsDir.replace(/\/+$/, "")}/${phase}.json`;
  const ref = `${mergeBase}:${relPath}`;
  const result = runGit(cwd, ["show", ref]);
  if (result.error !== undefined) {
    return {
      ok: false,
      kind: "error",
      reason: `git show ${ref} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    const stderr = bufferToUtf8(result.stderr);
    if (DECLARATION_ABSENT_PATTERNS.some((pattern) => pattern.test(stderr))) {
      return { ok: false, kind: "missing", path: relPath };
    }
    return {
      ok: false,
      kind: "error",
      reason: `git show ${ref} exited ${String(result.status)}: ${singleLine(stderr)}`,
    };
  }
  const buffer: Buffer = result.stdout instanceof Buffer ? result.stdout : Buffer.from(bufferToUtf8(result.stdout));
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      reason: `declaration ${relPath} at merge base ${mergeBase} does not parse as JSON: ${(error as Error).message}`,
    };
  }
  const diagnostics = formatDiagnostics(validate(declarationSchema(), parsed));
  if (diagnostics.length > 0) {
    return {
      ok: false,
      kind: "error",
      reason: `declaration ${relPath} at merge base ${mergeBase} is not a valid phase declaration: ${diagnostics.join("; ")}`,
    };
  }
  return { ok: true, declaration: parsed as PhaseDeclaration, sha256, path: relPath };
}

/** A declared entry is a literal path, or (trailing slash) a directory prefix. */
function isAllowed(path: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
}

/* -------------------------------------------------------------------- */
/* Emitting the gate's own record (M2-C-6: --result opened through the   */
/* delivered primitive, same pattern as src/commands/gates.ts's emit()). */
/* -------------------------------------------------------------------- */

function emit(resultPath: string, fields: GateResultFields): number {
  const result = makeGateResult(fields);
  const refusal = refuseOpenForWrite(resultPath);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys gates scope: ${refusal}\n`);
    return EXIT_GATE_ERROR;
  }
  const written = runStep(`writing ${resultPath}`, () =>
    writeFileSync(resultPath, renderGateResult(result)),
  );
  if (!written.ok) {
    process.stderr.write(`tiphys gates scope: ${written.reason}\n`);
    return EXIT_GATE_ERROR;
  }
  const status: GateStatus = result.status;
  process.stdout.write(`${result.gate}: ${status} (${String(result.units)} ${result.unitLabel})\n`);
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(status);
}

/** Best-effort evidence side artifact; a failure to write it does not fail the gate. */
function writeEvidenceFile(evidenceDir: string | undefined, name: string, body: string): string | undefined {
  if (evidenceDir === undefined) {
    return undefined;
  }
  const path = join(evidenceDir, name);
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys gates scope: could not write evidence ${path}: ${refusal}\n`);
    return undefined;
  }
  const written = runStep(`writing ${path}`, () => writeFileSync(path, body));
  if (!written.ok) {
    process.stderr.write(`tiphys gates scope: ${written.reason}\n`);
    return undefined;
  }
  return name;
}

function now(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------- */
/* The audit itself.                                                      */
/* -------------------------------------------------------------------- */

export function main(argv: string[]): number {
  const flags = parseFlags(argv);
  if (flags === undefined) {
    return usageError();
  }
  const missing = (["declarations", "result", "base", "phase"] as const).filter(
    (name) => flags[name] === undefined,
  );
  if (missing.length > 0) {
    return usageError(`scope requires ${missing.map((name) => `--${name}`).join(" ")}`);
  }

  const cwd = process.cwd();
  const startedAt = now();
  const declarationsDir = flags.declarations as string;
  const resultPath = flags.result as string;
  const evidenceDir = flags.evidence;
  const base = flags.base as string;
  const head = flags.head ?? "HEAD";
  const phase = flags.phase as string;

  const shared = { gate: "scope", unitLabel: "changed paths audited", startedAt };

  const mergeBaseResult = resolveMergeBase(cwd, base, head);
  if (!mergeBaseResult.ok) {
    return emit(resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: mergeBaseResult.reason,
    });
  }
  const mergeBase = mergeBaseResult.sha;

  const declLoad = loadDeclarationAtMergeBase(cwd, mergeBase, declarationsDir, phase);
  if (!declLoad.ok) {
    if (declLoad.kind === "error") {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail: declLoad.reason,
      });
    }
    // declLoad.kind === "missing": the branch-matches precondition already
    // established (at the runner) that this branch matches the phase
    // pattern, but no declaration exists for it at the merge base.
    const branch = currentBranch(cwd);
    return emit(resultPath, {
      ...shared,
      status: "red",
      units: 0,
      endedAt: now(),
      detail:
        `branch ${branch} (phase ${phase}) matches the phase pattern but no phase declaration ` +
        `exists at ${declLoad.path} in the merge base ${mergeBase} of --base ${base} and --head ${head}; ` +
        "the declaration must be committed to main before the phase branch is created",
    });
  }

  const touchedResult = computeTouchedPaths(cwd, mergeBase, head);
  if (!touchedResult.ok) {
    return emit(resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: touchedResult.reason,
    });
  }
  const touched = touchedResult.paths;
  const declaration = declLoad.declaration;
  const declarationSha256 = declLoad.sha256;
  const declarationPath = declLoad.path;

  const standingExtras = ["test/behaviors.json", `delivery/work-history/${phase}.md`];
  const allowed = [...declaration.filesToTouch, ...declaration.declaredExtras, ...standingExtras];

  const violations = [
    ...new Set(touched.filter((entry) => !isAllowed(entry.path, allowed)).map((entry) => entry.path)),
  ].sort();

  const declaredLiterals = [...declaration.filesToTouch, ...declaration.declaredExtras].filter(
    (entry) => !entry.endsWith("/"),
  );
  const touchedSet = new Set(touched.map((entry) => entry.path));
  const underTouched = declaredLiterals.filter((entry) => !touchedSet.has(entry)).sort();

  const evidenceName = writeEvidenceFile(
    evidenceDir,
    "scope-audit.json",
    `${JSON.stringify(
      {
        phase,
        base,
        head,
        mergeBase,
        declarationPath,
        declarationSha256,
        touchedPaths: touched,
        allowed,
        violations,
        underTouched,
      },
      null,
      2,
    )}\n`,
  );
  const evidence = evidenceName === undefined ? [] : [evidenceName];

  const units = touched.length;
  const underTouchNote =
    underTouched.length > 0
      ? ` (${String(underTouched.length)} declared path(s) not touched: ${underTouched.join(", ")})`
      : "";

  if (violations.length > 0) {
    return emit(resultPath, {
      ...shared,
      status: "red",
      units,
      endedAt: now(),
      detail:
        `touched path(s) outside the declared scope: ${violations.join(", ")} ` +
        `(declaration ${declarationPath} at merge base ${mergeBase}, sha256 ${declarationSha256})${underTouchNote}`,
      evidence,
    });
  }

  return emit(resultPath, {
    ...shared,
    status: "green",
    units,
    endedAt: now(),
    detail:
      `${String(units)} changed path(s) audited against declaration ${declarationPath} ` +
      `at merge base ${mergeBase} (sha256 ${declarationSha256})${underTouchNote}`,
    evidence,
  });
}

/**
 * Auto-run only when this module is the DIRECTLY INVOKED entry point, never
 * on import. Tests import this module (computed-URL dynamic import, CLAUDE.md
 * warning 4) to exercise `main` and the pure helpers without spawning a
 * process, and a module that ran its CLI as a side effect of being loaded
 * would call `process.exit` out from under the test runner.
 */
const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}

export { computeTouchedPaths, currentBranch, isAllowed, loadDeclarationAtMergeBase, resolveMergeBase };
export type { PhaseDeclaration, TouchedPath };
