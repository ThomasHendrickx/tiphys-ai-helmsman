import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
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
 * this run considers authorized THROUGH THE WORKING TREE. The merge base is
 * computed explicitly with `git merge-base`, and diffs are computed against
 * THAT commit, never against `--base` directly and never against `main`'s
 * current tip: if `main` has advanced past the true fork point by the time
 * this runs (another phase merged in the interim), diffing directly against
 * `--base` would misattribute every path `main` changed afterward to this
 * branch. `--base`/`--head` are still both required (a check that cannot
 * compute a merge base has not reached a verdict, M2-C-3).
 *
 * CORRECTION, fix round 1 (CR-1046): reading via the object database is NOT
 * by itself enough to make the property above a structural fact about this
 * module's code, because `--base` is supplied by the party under audit.
 * Before this round, `--base` could name a ref on the AUDITED BRANCH ITSELF
 * (for example `HEAD~1` after committing a widened declaration), which
 * makes `git merge-base(--base, --head)` resolve to a commit that is only
 * reachable from that branch, so the "merge base" blob read is the widened
 * one, not main's. This was reproduced live (clean-room hazard CR-1045,
 * witness W2) before this round closed it. The property now holds because
 * of TWO checks together, not one: the object-database read above, AND the
 * merge-base-vs-trunk validation immediately below, which this round added.
 *
 * CROSS-CHECKING EVERY CALLER-SUPPLIED INPUT AGAINST THE BRANCH UNDER AUDIT
 * (fix round 1, CR-1030/CR-1045, the mechanism, not the three
 * witnesses that exposed it). Before this round `--phase`, `--base` and
 * `--head` were forwarded to the diff/declaration machinery exactly as
 * supplied, so the audited party chose which declaration governed it
 * (`--phase` naming a different, more permissive, already-committed
 * declaration), which commit's blob the merge base pinned (`--base` forked
 * onto the audited branch), and how much of the branch's own history was
 * measured (`--head` set short of the real tip). All three are now
 * cross-checked against a property of the branch under audit that the
 * caller does not get to redefine per invocation:
 *   - `--phase` must equal the loaded declaration's own `id` field;
 *   - the branch this process actually has checked out (`currentBranch`)
 *     must equal the loaded declaration's own `branch` field;
 *   - `--head`, resolved, must equal the commit this process actually has
 *     checked out (`git rev-parse HEAD`), so a `--head` that is an ancestor
 *     of the real tip is rejected rather than silently narrowing the diff;
 *   - the merge base must be an ancestor of the repository's configured
 *     trunk (`origin/main`, falling back to a local `main` where there is
 *     no `origin` remote, for example a scratch test repository), so a
 *     merge base forked onto the audited branch itself is rejected.
 * A divergence in any of the four is `error`, naming what was expected and
 * what was supplied. None of the four can be satisfied by editing anything
 * on the audited branch, because each is checked against either the
 * declaration's own OWN fields (read from the object database at the merge
 * base, already anti-widened) or against a reference this process resolves
 * itself (the real checkout, the real trunk), never against a second
 * caller-supplied string.
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
 * THE ANTI-WIDENING PROPERTY IS DELIBERATELY WEAKENED FOR ADDITIONS, AND
 * SAYING SO IS PART OF THE CHANGE (M3-P11 change B, DR-0031). From this
 * phase on, the declaration is read from BOTH the merge base and the head.
 * A removal is still refused outright and the merge base is still the
 * yardstick for `id` and `branch`, so every cross-check above is unchanged.
 * But an entry ADDED on the head is now ALLOWED, and the gate's protection
 * against it is that the addition is PRINTED BY NAME on stdout and recorded
 * in `scope-audit.json`, for a human reviewer to sign off. That is a real
 * reduction in what this gate refuses, traded for the ability to land a
 * declaration amendment with the phase that needs it rather than in a
 * separate pull request. It is a trade, not a free improvement, and a
 * reviewer who ignores the printed line gets no protection from it at all.
 *
 * FIX ROUND 1 STRENGTHENED THE VISIBLE HALF THREE WAYS, because a hard
 * control relaxed into a visible one is only as good as the visibility, and
 * two clean-room reviewers found the visibility defective in three
 * independent places. The note now says when an addition is a DIRECTORY
 * PREFIX rather than a single file (M-1); `tiphys gates run` relays every
 * gate row rather than non-green ones only, so the note reaches stdout on
 * the GREEN arm, which is the only arm this is about (C-1); and a phase
 * branch that touches any path under the declarations directory other than
 * its own declaration is RED, so the removal refusal is no longer scoped to
 * one file while the grant can reach every file (C-2).
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

type RefResolution = { ok: true; sha: string } | { ok: false; reason: string };

/**
 * Resolve any ref-ish string (a sha, a branch, `HEAD`, `HEAD~1`, ...) to the
 * commit sha it names, or a reason it could not be resolved as a commit.
 * Fix round 1 (CR-1030/CR-1045, W3): used to compare the CALLER-SUPPLIED
 * `--head` against the commit this process actually has checked out, so a
 * `--head` set short of the real tip is caught rather than silently
 * narrowing the diff.
 */
function resolveRef(cwd: string, ref: string): RefResolution {
  const result = runGit(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git rev-parse --verify ${ref} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git rev-parse --verify ${ref} exited ${String(result.status)}: ${singleLine(bufferToUtf8(result.stderr))}`,
    };
  }
  const sha = bufferToUtf8(result.stdout).trim();
  if (sha === "") {
    return { ok: false, reason: `git rev-parse --verify ${ref} produced no output` };
  }
  return { ok: true, sha };
}

/**
 * The one trunk reference the merge base is checked against (fix round 1,
 * CR-1030/CR-1045, W2). Tried in order: a real checkout of this repository
 * carries an `origin` remote (`.github/workflows/gates.yml` fetches full
 * history), while a scratch repository built for this suite, or a plain
 * local clone, typically does not. Either way this kernel has exactly one
 * branch it calls trunk, so the first candidate that resolves to a real
 * commit is it; a repository with neither is one this check cannot be
 * performed against, which is `error`, never a guessed pass.
 */
const TRUNK_CANDIDATES = ["origin/main", "main"] as const;

type TrunkResolution = { ok: true; ref: string; sha: string } | { ok: false; reason: string };

function resolveTrunk(cwd: string): TrunkResolution {
  const failures: string[] = [];
  for (const ref of TRUNK_CANDIDATES) {
    const resolved = resolveRef(cwd, ref);
    if (resolved.ok) {
      return { ok: true, ref, sha: resolved.sha };
    }
    failures.push(`${ref} (${resolved.reason})`);
  }
  return {
    ok: false,
    reason:
      `could not resolve a trunk reference to validate the merge base against, tried ` +
      `${failures.join(", ")}`,
  };
}

type AncestorCheck = { ok: true; isAncestor: boolean } | { ok: false; reason: string };

/** `git merge-base --is-ancestor`: exit 0 is yes, exit 1 is no, anything else is error. */
function isAncestorOf(cwd: string, ancestor: string, descendant: string): AncestorCheck {
  const result = runGit(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
  if (result.error !== undefined) {
    return {
      ok: false,
      reason:
        `git merge-base --is-ancestor ${ancestor} ${descendant} could not be run: ` +
        `${singleLine(String(result.error))}`,
    };
  }
  if (result.status === 0) {
    return { ok: true, isAncestor: true };
  }
  if (result.status === 1) {
    return { ok: true, isAncestor: false };
  }
  return {
    ok: false,
    reason:
      `git merge-base --is-ancestor ${ancestor} ${descendant} exited ${String(result.status)}: ` +
      `${singleLine(bufferToUtf8(result.stderr))}`,
  };
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
  return loadDeclarationAtCommit(cwd, mergeBase, declarationsDir, phase);
}

/**
 * The same object-database read at ANY commit (M3-P11 change B). The
 * merge-base wrapper above keeps its name and its exported identity because
 * the anti-widening property is a statement about THAT call, and a reader
 * following the property should land on a function whose name says which
 * side it reads.
 */
function loadDeclarationAtCommit(
  cwd: string,
  commit: string,
  declarationsDir: string,
  phase: string,
): DeclarationLoad {
  const relPath = `${declarationsDir.replace(/\/+$/, "")}/${phase}.json`;
  const ref = `${commit}:${relPath}`;
  const mergeBase = commit;
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
/* M3-P11 change A: a phase's OWN evidence is a standing extra.          */
/* -------------------------------------------------------------------- */

/**
 * WHY (DR-0031, delivery/plan/m3-p11-phase-spec.md:142). The standing
 * pre-authorized extras were `test/behaviors.json` and the phase work
 * history, so the only way to land a clean-room review or a delta
 * verification without reddening this gate was a SEPARATE pull request.
 * That is not a theoretical cost. Measured on `main` at bdec27d, while
 * M3-P9 was still open: the two clean-room reviews and the delta
 * verification for M3-P9 were PRESENT and `AGENTS.md` was ABSENT, so `main`
 * carried review evidence for code it did not contain.
 *
 * WHAT COUNTS AS THE PHASE'S OWN EVIDENCE, and the rule is mechanical
 * because the alternative is a reviewer's judgment about a filename. A
 * changed path qualifies when all three hold:
 *
 *   1. it sits DIRECTLY under `delivery/review/` or
 *      `delivery/verification/`, one level only, so nothing under
 *      `delivery/review/evidence/` is swept in by a directory prefix;
 *   2. its basename begins with one of the evidence-kind prefixes below,
 *      possibly the empty one;
 *   3. what follows that prefix is the phase id, followed by a BOUNDARY:
 *      `-`, `.`, or the end of the basename.
 *
 * RULE 3'S BOUNDARY IS LOAD-BEARING AND IT IS NOT DECORATION. Phase ids in
 * this project are not prefix-free: `m3-p1` is a proper string prefix of
 * `m3-p11`. Without the boundary, the M3-P1 branch would silently own every
 * M3-P11 review document, which is precisely the cross-phase leak the
 * "another phase's evidence still reddens" arm of criterion 8 exists to
 * refuse.
 *
 * THE PREFIX LIST IS DERIVED, NOT INVENTED. `clean-room-` and the empty
 * prefix come from criterion 8 and from the spec's own list;
 * `arbitration-` comes from the spec's list; `verification-` comes from
 * CLAUDE.md's durability table, which names
 * `delivery/review/verification-<phase>-fix-round.md` as a required
 * artifact. Names in use on `main` that are NOT covered (`final-review-`,
 * `open-call-`) are left out deliberately: nothing binding requires them,
 * and a phase that needs one declares it. That limit is recorded in
 * delivery/work-history/m3-p11.md rather than left to be discovered.
 */
const PHASE_EVIDENCE_DIRECTORIES = ["delivery/review/", "delivery/verification/"] as const;
const PHASE_EVIDENCE_PREFIXES = ["", "clean-room-", "arbitration-", "verification-"] as const;

function isPhaseOwnEvidence(path: string, phase: string): boolean {
  const id = phase.toLowerCase();
  if (id === "") {
    return false;
  }
  const directory = PHASE_EVIDENCE_DIRECTORIES.find((entry) => path.startsWith(entry));
  if (directory === undefined) {
    return false;
  }
  const basename = path.slice(directory.length);
  if (basename === "" || basename.includes("/")) {
    return false;
  }
  const lower = basename.toLowerCase();
  return PHASE_EVIDENCE_PREFIXES.some((prefix) => {
    if (!lower.startsWith(prefix)) {
      return false;
    }
    const rest = lower.slice(prefix.length);
    if (!rest.startsWith(id)) {
      return false;
    }
    const after = rest.slice(id.length);
    return after === "" || after.startsWith("-") || after.startsWith(".");
  });
}

/* -------------------------------------------------------------------- */
/* M3-P11 change B: the declaration is read from BOTH sides.             */
/* -------------------------------------------------------------------- */

interface DeclarationDelta {
  /** Entries present at the head and absent from the merge base. */
  added: string[];
  /** Entries present at the merge base and absent from the head. */
  removed: string[];
}

/**
 * Compare the merge-base declaration with the head's, field by field.
 *
 * THE ASYMMETRY IS THE POINT (DR-0031,
 * delivery/plan/m3-p11-phase-spec.md:156). Reading the declaration from the
 * head alone would let a phase grant itself scope, which removes the only
 * check on scope there is; reading it from the merge base alone means a
 * declaration amendment can never ride with the phase that needs it, and
 * three of one day's ten pull requests existed for nothing else. So an
 * ADDITION is allowed and reported as a loud NAMED diff for a reviewer to
 * sign off, and a REMOVAL stays hard.
 *
 * `id` and `branch` are compared as scalars and any difference is a
 * REMOVAL, never an addition: they are the two fields the anti-widening
 * cross-checks are anchored to, and a phase that renames its own anchor has
 * changed which declaration governs it.
 */
function compareDeclarations(
  base: PhaseDeclaration,
  head: PhaseDeclaration,
): DeclarationDelta {
  const added: string[] = [];
  const removed: string[] = [];
  for (const field of ["filesToTouch", "declaredExtras", "citations"] as const) {
    const baseSet = new Set(base[field]);
    const headSet = new Set(head[field]);
    for (const entry of headSet) {
      if (!baseSet.has(entry)) {
        added.push(`${field} ${entry}`);
      }
    }
    for (const entry of baseSet) {
      if (!headSet.has(entry)) {
        removed.push(`${field} ${entry}`);
      }
    }
  }
  for (const field of ["id", "branch"] as const) {
    if (base[field] !== head[field]) {
      removed.push(`${field} ${base[field]} (the head declares ${head[field]})`);
    }
  }
  return { added: added.sort(), removed: removed.sort() };
}

/**
 * One added entry, rendered for the line a reviewer actually reads.
 *
 * FIX ROUND 1, finding M-1. `isAllowed` above treats a trailing slash as a
 * DIRECTORY PREFIX matching every path beneath it, so `filesToTouch src/`
 * grants scope over an entire tree, present and future. Printed by the
 * unannotated diff it was a string the same shape and roughly the same
 * length as a single-file addition, and change B's whole protection is a
 * human scanning that line for something anomalous. Disclosure that does not
 * distinguish "one file" from "everything under this tree" is not disclosure
 * at the strength the refusal it replaced had.
 *
 * The delta itself stays unannotated data (`scope-audit.json` records the
 * raw entries); the annotation is applied where the sentence is composed.
 */
function describeAddition(entry: string): string {
  return entry.endsWith("/")
    ? `${entry} (DIRECTORY PREFIX: grants every current and future path under it, not one file)`
    : entry;
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

  // CR-1047: the failure path below reads a shipped schema document
  // (`declarationSchema`, invoked from `loadDeclarationAtMergeBase`), which
  // THROWS on a missing schema, a schema outside the closed keyword set, or
  // an irregular entry (a named pipe) at the schema path. Node's default
  // uncaught-exception exit code is 1, identical to EXIT_RED, so before this
  // wrap a crash there was indistinguishable from a genuine red verdict to
  // any consumer reading only the exit code. Wrapping produces a clean
  // `error` record instead, on the same standalone path this module's own
  // USAGE line documents (the `tiphys gates run` ingest already degrades a
  // crashing subprocess to `error`; this is the backstop for running this
  // script directly, which has no such wrapper of its own until now).
  try {
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

    // Fix round 1, CR-1030/CR-1045 mechanism, member W3: --head is supplied
    // by the party under audit; a --head set to an ancestor of the real tip
    // hides later commits from the diff without changing the merge base at
    // all (the merge base depends only on the fork point, not on which
    // descendant of it --head names), so this cannot be caught by the
    // trunk-ancestry check below. Cross-check the resolved --head against a
    // property the caller does not supply: the commit this process actually
    // has checked out.
    const actualHeadResult = resolveRef(cwd, "HEAD");
    if (!actualHeadResult.ok) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail: `could not resolve the commit actually checked out: ${actualHeadResult.reason}`,
      });
    }
    const resolvedHeadResult = resolveRef(cwd, head);
    if (!resolvedHeadResult.ok) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail: `could not resolve --head ${head}: ${resolvedHeadResult.reason}`,
      });
    }
    if (resolvedHeadResult.sha !== actualHeadResult.sha) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail:
          `--head ${head} resolves to ${resolvedHeadResult.sha}, but the commit actually checked ` +
          `out in this working tree is ${actualHeadResult.sha}; refusing to audit a diff whose ` +
          "right-hand side is not what is really checked out, which could omit later commits",
      });
    }

    // Fix round 1, CR-1030/CR-1045 mechanism, member W2: --base is equally
    // caller-supplied. A merge base forked onto the audited branch itself
    // (for example `--base HEAD~1` after committing a widened declaration)
    // makes the object-database read above resolve the BRANCH's own blob,
    // not main's, defeating the anti-widening property this phase exists
    // for. Cross-check the merge base against a reference this process
    // resolves itself, not a second caller-supplied string.
    const trunkResult = resolveTrunk(cwd);
    if (!trunkResult.ok) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail: trunkResult.reason,
      });
    }
    const ancestorResult = isAncestorOf(cwd, mergeBase, trunkResult.sha);
    if (!ancestorResult.ok) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail: ancestorResult.reason,
      });
    }
    if (!ancestorResult.isAncestor) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail:
          `merge base ${mergeBase} (of --base ${base} and --head ${head}) is not an ancestor of ` +
          `the configured trunk ${trunkResult.ref} (${trunkResult.sha}); this is the shape of a ` +
          "merge base forked onto the branch under audit rather than the true fork point with main",
      });
    }

    const declLoad = loadDeclarationAtMergeBase(cwd, mergeBase, declarationsDir, phase);
    const branch = currentBranch(cwd);
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

    const declaration = declLoad.declaration;
    const declarationSha256 = declLoad.sha256;
    const declarationPath = declLoad.path;

    // Fix round 1, CR-1030/CR-1045 mechanism, member W1 (the yardstick
    // swap): --phase selects WHICH declaration governs this run. Before this
    // round nothing checked that the declaration read back actually claims
    // to be for that phase or that branch, so a caller could name a
    // different, more permissive, already-committed declaration and have it
    // silently accepted for this branch's diff. Declaration ids are the
    // plan's uppercase spelling (schema pattern `^M[0-9]+-P[0-9]+$`); --phase
    // is the lowercase, hyphenated filename form (a deviation this phase
    // already records), so the comparison is case-normalized, not literal.
    if (phase.toUpperCase() !== declaration.id) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail:
          `--phase ${phase} does not match declaration ${declarationPath}'s own id ${declaration.id} ` +
          `(read from merge base ${mergeBase}); refusing to audit this diff against a declaration ` +
          "that does not claim to be the one --phase named",
      });
    }
    if (branch !== declaration.branch) {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail:
          `the current branch ${branch} does not match declaration ${declarationPath}'s own branch ` +
          `${declaration.branch} (read from merge base ${mergeBase}); refusing to audit a branch ` +
          "against a declaration that does not claim to govern it",
      });
    }

    // M3-P11 change B. The head's declaration is read as well, from the
    // object database at the commit this process has already proven is the
    // real checkout. An ADDITION is allowed and named; a REMOVAL is red.
    const headDeclLoad = loadDeclarationAtCommit(
      cwd,
      actualHeadResult.sha,
      declarationsDir,
      phase,
    );
    if (!headDeclLoad.ok && headDeclLoad.kind === "error") {
      return emit(resultPath, {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail: `reading the head declaration: ${headDeclLoad.reason}`,
      });
    }
    if (!headDeclLoad.ok) {
      // The declaration exists at the merge base and NOT at the head: the
      // branch deleted it. That is the largest possible removal, so it takes
      // the removal arm rather than being treated as "no delta".
      return emit(resultPath, {
        ...shared,
        status: "red",
        units: 0,
        endedAt: now(),
        detail:
          `declaration ${declarationPath} exists at merge base ${mergeBase} but not at head ` +
          `${actualHeadResult.sha}; a phase branch may ADD to its own declaration, and this ` +
          "branch removed the whole of it",
      });
    }
    const delta = compareDeclarations(declaration, headDeclLoad.declaration);
    if (delta.removed.length > 0) {
      return emit(resultPath, {
        ...shared,
        status: "red",
        units: 0,
        endedAt: now(),
        detail:
          `declaration ${declarationPath} REMOVES ${String(delta.removed.length)} entry/entries at ` +
          `head ${actualHeadResult.sha} that are present at merge base ${mergeBase}: ` +
          `${delta.removed.join(", ")}; a phase branch may ADD to its own declaration, never remove ` +
          "from it, because a removal narrows what a later audit will check",
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

    const standingExtras = ["test/behaviors.json", `delivery/work-history/${phase}.md`];
    // The allowed set is the UNION of the two sides. Only additions can reach
    // here: a removal already returned red above, so the union never grants
    // less than the merge base did.
    const headDeclaration = headDeclLoad.declaration;
    const allowed = [
      ...new Set([
        ...declaration.filesToTouch,
        ...declaration.declaredExtras,
        ...headDeclaration.filesToTouch,
        ...headDeclaration.declaredExtras,
        ...standingExtras,
      ]),
    ];

    // FIX ROUND 1, finding C-2. The removal refusal above reads exactly ONE
    // file, `<declarationsDir>/<phase>.json`, on both sides. Every other
    // phase's declaration is, to this gate, an ordinary path: allow it into
    // scope by any route and the branch may NARROW it, with no delta check at
    // all, and the narrowing lands on main and governs that phase's later
    // audit. Change B made that reachable without a separate merged pull
    // request, which is the friction it was written to remove and was also
    // the review point. Measured green in a scratch repository by a clean-room
    // reviewer before this round.
    //
    // The rule is a property of the DIRECTORY, not of the route that granted
    // access, so it covers a directory-prefix addition, an explicitly listed
    // foreign declaration, and a grant that was already in the merge base
    // alike. It is deliberately blunt: ANY touched path under the
    // declarations directory other than this phase's own declaration is red,
    // including a non-declaration file such as that directory's README, which
    // a phase branch has no business editing either. Paperwork branches do
    // not match the phase-branch pattern, so this gate is not applicable to
    // them and they remain the place such edits are made.
    const declarationsPrefix = `${declarationsDir.replace(/\/+$/, "")}/`;
    const foreignDeclarations = [
      ...new Set(
        touched
          .map((entry) => entry.path)
          .filter((path) => path.startsWith(declarationsPrefix) && path !== declarationPath),
      ),
    ].sort();

    const violations = [
      ...new Set(
        touched
          .filter(
            (entry) =>
              !isAllowed(entry.path, allowed) && !isPhaseOwnEvidence(entry.path, phase),
          )
          .map((entry) => entry.path),
      ),
    ].sort();

    const declaredLiterals = [
      ...new Set([
        ...declaration.filesToTouch,
        ...declaration.declaredExtras,
        ...headDeclaration.filesToTouch,
        ...headDeclaration.declaredExtras,
      ]),
    ].filter((entry) => !entry.endsWith("/"));
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
          headDeclarationSha256: headDeclLoad.sha256,
          declarationDelta: delta,
          touchedPaths: touched,
          allowed,
          violations,
          foreignDeclarations,
          underTouched,
        },
        null,
        2,
      )}\n`,
    );
    const evidence = evidenceName === undefined ? [] : [evidenceName];

    const units = touched.length;
    // M3-P11 criterion 9. The addition is PRINTED BY NAME, on both the green
    // and the red arm, because a silent pass is the exact failure this change
    // would otherwise introduce: the gate would stop refusing a widened
    // declaration and say nothing about it, which is worse than either the
    // old hard red or an honest named note. `emit` writes `detail` to stdout,
    // so putting it here is what makes it a printed line rather than only a
    // field in a record somebody might read.
    //
    // FIX ROUND 1, findings C-1 and M-1. Two things were wrong with the note
    // as first written, and both are the same mechanism: a compensating
    // control is worth what it is READ at, and this one was weaker in two
    // independent ways than the hard refusal it replaced.
    //
    //   M-1, WHAT IS GRANTED WAS NOT LEGIBLE. A directory prefix printed
    //   exactly like a single file. `describeAddition` now says which it is.
    //
    //   C-1, THE NOTE DID NOT REACH THE READER on the green arm, which is
    //   the only arm criterion 9 is about, because `tiphys gates run` printed
    //   non-green rows only. That half is fixed in src/commands/gates.ts,
    //   which now relays EVERY row; it is named here so the next reader of
    //   this note knows its delivery depends on a second file.
    const directoryPrefixCount = delta.added.filter((entry) => entry.endsWith("/")).length;
    const amendmentNote =
      delta.added.length > 0
        ? ` DECLARATION AMENDED AT HEAD: ${String(delta.added.length)} entry/entries ADDED at ` +
          `head ${actualHeadResult.sha} that are absent from the merge-base declaration, allowed ` +
          `and NAMED here for a reviewer to sign off (this gate does not sign them off)` +
          (directoryPrefixCount > 0
            ? `, ${String(directoryPrefixCount)} of them a DIRECTORY PREFIX rather than a single file`
            : "") +
          `: ${delta.added.map(describeAddition).join(", ")}.`
        : "";
    const underTouchNote =
      underTouched.length > 0
        ? ` (${String(underTouched.length)} declared path(s) not touched: ${underTouched.join(", ")})`
        : "";

    if (foreignDeclarations.length > 0) {
      return emit(resultPath, {
        ...shared,
        status: "red",
        units,
        endedAt: now(),
        detail:
          `this branch changes ${String(foreignDeclarations.length)} path(s) under ` +
          `${declarationsPrefix} that are not its own declaration ${declarationPath}: ` +
          `${foreignDeclarations.join(", ")}; a phase branch may ADD to its OWN declaration and ` +
          "nothing else here, because the removal refusal reads only this phase's file and a " +
          "change to another phase's declaration is therefore unchecked and lands on main " +
          "governing that phase's later audit" +
          `${underTouchNote}${amendmentNote}`,
        evidence,
      });
    }

    if (violations.length > 0) {
      return emit(resultPath, {
        ...shared,
        status: "red",
        units,
        endedAt: now(),
        detail:
          `touched path(s) outside the declared scope: ${violations.join(", ")} ` +
          `(declaration ${declarationPath} at merge base ${mergeBase}, sha256 ${declarationSha256})` +
          `${underTouchNote}${amendmentNote}`,
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
        `at merge base ${mergeBase} (sha256 ${declarationSha256})${underTouchNote}${amendmentNote}`,
      evidence,
    });
  } catch (error) {
    return emit(resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: `scope gate crashed before reaching a verdict: ${singleLine((error as Error).message ?? String(error))}`,
    });
  }
}

/**
 * Auto-run only when this module is the DIRECTLY INVOKED entry point, never
 * on import. Tests import this module (computed-URL dynamic import, CLAUDE.md
 * warning 4) to exercise `main` and the pure helpers without spawning a
 * process, and a module that ran its CLI as a side effect of being loaded
 * would call `process.exit` out from under the test runner.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  pathsIdentifySameObject(fileURLToPath(import.meta.url), process.argv[1]);
if (invokedDirectly) {
  // CR-1047, second layer: `main` already wraps its own body, but this
  // catches anything that could escape from outside that wrap (flag
  // parsing, `usageError`, or a future change to either) so the standalone
  // entry point this module documents never exits 1 (EXIT_RED) on an
  // uncaught throw, which is indistinguishable from a genuine red verdict
  // to a consumer reading only the exit code (CR-801 recurring).
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys gates scope: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}

export {
  compareDeclarations,
  computeTouchedPaths,
  currentBranch,
  isAllowed,
  isAncestorOf,
  isPhaseOwnEvidence,
  loadDeclarationAtCommit,
  loadDeclarationAtMergeBase,
  resolveMergeBase,
  resolveRef,
  resolveTrunk,
};
export type { DeclarationDelta, PhaseDeclaration, TouchedPath };
