/**
 * THE DERIVED-CHECK REGISTRY (kernel plan M3, section 2.3 Kind B; step 8).
 *
 * JSON Schema expresses properties of ONE document reachable by one keyword.
 * A property that compares array elements to each other, resolves a reference
 * into another document, computes arithmetic over sibling fields or touches
 * the filesystem is not expressible by any keyword under any DR-0013 option,
 * and this module is where the plan stopped pretending otherwise (M3R-002).
 *
 * Each check runs AFTER schema validation succeeds and reports through the
 * same contract with its own id attached:
 *
 *   INVALID <json-pointer> <message> (check: <check-id>)
 *
 * A check that needs a CONTEXT it was not given reports
 * `SKIPPED <check-id> no context`. Until kernel 0.2.1 the command then exited
 * nonzero (M3 criterion 4c, delivery/plan/kernel-plan-m3.md:1809), so a
 * cross-document rule could not pass BY NOT RUNNING. Since 0.2.1, by the
 * orchestrator's ruling on the owner's report that consumer history "returns
 * false", `tiphys validate` exits 0 when SKIPPED lines are the only non-pass
 * results: the skip is still PRINTED, so a reader can tell "did not run" from
 * "passed", and `ChecksRun.failed` still reports it, but only
 * `ChecksRun.violated` decides the exit.
 *
 * DR-0013 clause 8: Kind B rules stay HERE and are never encoded as Ajv
 * extensions. The Kind A / Kind B boundary is binding.
 *
 * DR-0061 (b): a check stays here only if a kernel decision on code or git
 * state reads its result. M6-P3 deleted the checks that read only process
 * documents; the merge gate runs the remaining verdict checks by id.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { decodeDocument, readOperatorPath } from "./validate.ts";
import type { Diagnostic } from "./validate.ts";
import { classifyEntry } from "./task.ts";

/** What one derived check produced. */
export interface CheckOutcome {
  /** Violations, each of which makes the command exit nonzero. */
  violations: Diagnostic[];
  /**
   * Lines the check REPORTS rather than fails on: facts a reader needs that
   * are not a reason to reject the document.
   */
  reports: string[];
}

export interface DerivedCheck {
  id: string;
  /** The artifact type this check is registered for. */
  type: string;
  /**
   * THE OTHER artifact types this check must ALSO run on. Added by M3-P4 fix
   * round 2 for CR-001, whose MECHANISM is worth stating at the field rather
   * than at the one check that tripped over it:
   *
   *   A DERIVED CHECK IS REGISTERED PER TYPE AND READS A TYPE-SPECIFIC KEY,
   *   WHILE THE `$defs` IT GUARDS ARE SHARED ACROSS TYPES BY `$ref`.
   *   SHARING A DEFINITION THEREFORE DOES NOT SHARE ITS CHECK.
   *
   * Keywords travel through a `$ref` and derived checks do not, so a schema
   * author who moves a rule into a shared definition gets the keyword half of
   * the sharing for free and the Kind B half not at all. That asymmetry is
   * invisible at the definition site, which is why `schemas/report.schema.json`
   * could carry a comment saying a check applied where it did not.
   *
   * `guards` below names the shared definitions this check enforces, and
   * `test/report-contract.test.ts` walks the TRANSITIVE closure of `$ref` in
   * `schemas/`, failing when a guarded definition is reachable from a type
   * this check does not list, or when a `guards` pointer resolves to nothing.
   * REACHABLE was false of the ONE-HOP walk shipped before M3-P4 round 3.
   */
  alsoTypes?: readonly string[];
  /**
   * The shared `$def`s this check enforces, written as the pointer a
   * cross-document `$ref` uses (`report.schema.json#/$defs/gateResult`).
   * Absent means the check enforces nothing shared, which is the ordinary
   * case.
   */
  guards?: readonly string[];
  /**
   * True when the check resolves references into documents OTHER than the
   * instance, so `--context <dir>` is required and its absence is a SKIP
   * with a nonzero exit rather than a silent pass.
   */
  requiresContext: boolean;
  run(instance: unknown, contextDirectory: string | undefined, options?: CheckRunOptions): CheckOutcome;
}

/**
 * What a caller that knows the CHANGE UNDER AUDIT can tell a derived check.
 *
 * KERNEL 0.2.1 fix round 2 (CR-KH-003, CR-007). `base` is the ref the change
 * is measured from, the one the merge gates already take as `--base`. The two
 * merge checks use it to decide whether a head-less sibling is HISTORY (it is
 * at the merge base with the same bytes) or CURRENT WORK (the change adds or
 * edits it). A caller with no base, `tiphys validate --context` and the bare
 * script, gets the exclusion on shape alone and a line that says so.
 */
export interface CheckRunOptions {
  base?: string;
}

/** Every artifact type one check runs on, `type` first and then `alsoTypes`. */
export function typesOf(check: DerivedCheck): readonly string[] {
  return [check.type, ...(check.alsoTypes ?? [])];
}

const EMPTY: CheckOutcome = { violations: [], reports: [] };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/* ------------------------------------------------------------------ */
/* Shared readers kept for the checks below (M6-P3 deleted the checks   */
/* that only read process documents, DR-0061 (b))                       */
/* ------------------------------------------------------------------ */

const MODES_DOCUMENT = "assurance-modes.yaml";

/** `{index, record, id}` for every element of `modes[]` that is an object. */
function eachMode(
  instance: unknown,
): { index: number; mode: Record<string, unknown>; id: string }[] {
  const document = asRecord(instance);
  const modes = asArray(document?.["modes"]);
  const rows: { index: number; mode: Record<string, unknown>; id: string }[] = [];
  for (let index = 0; index < modes.length; index += 1) {
    const mode = asRecord(modes[index]);
    if (mode === undefined) {
      continue;
    }
    rows.push({ index, mode, id: String(mode["id"] ?? "") });
  }
  return rows;
}

/**
 * Read and decode a document from the CONTEXT directory, or say why not.
 *
 * FAIL CLOSED. A cross-document rule whose other document is missing must not
 * become a pass: that is the vacuous shape this whole module exists to
 * prevent, one level down from `SKIPPED <id> no context`. The path is not one
 * this program created, so it is classified before it is opened
 * (`readOperatorPath`, D-M3-27) rather than opened and hoped about.
 */
function readContextDocument(
  contextDirectory: string,
  relativePath: string,
): { ok: true; value: unknown; path: string } | { ok: false; reason: string } {
  const path = join(contextDirectory, relativePath);
  const read = readOperatorPath(path);
  if (!read.ok) {
    return { ok: false, reason: read.reason };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  return { ok: true, value: decoded.value, path };
}

/* ------------------------------------------------------------------ */
/* Review verdicts: where they live and how they are loaded           */
/* ------------------------------------------------------------------ */

/** Where a project's committed review verdicts live (DR-0012 condition 1). */
const REVIEW_DIRECTORY = join("delivery", "review");

/**
 * M6-P5: the kernel's review records live under the review directory and are
 * NEVER verdicts. The verdict loaders skip this subtree by path, and the record
 * loader (src/review.ts) reads only it, so neither can take the other's
 * document whatever its `kind` says.
 */
const REVIEW_RECORDS_SUBDIRECTORY = "records";

/** The merge-authority value that makes an approving pair a precondition of merge. */
export const DELEGATED_MERGE_AUTHORITY = "delegated-under-conditions";

export interface LoadedVerdict {
  path: string;
  record: Record<string, unknown>;
}

/**
 * What reading a candidate document's own `kind` produced, in the THREE
 * outcomes that fix round 2 exists to keep apart.
 *
 * THE MECHANISM FIX ROUND 2 CLOSES: `establishField` already separates ABSENT
 * from UNUSABLE from UNCANONICAL, and both selection sites consumed it with a
 * single `!== "established"`, which folds those outcomes back into one silent
 * skip. So "this document declares no type" and "this document declares a type
 * nobody could read" printed as the same fact, and that fact is the determinate
 * negative "not a verdict". Measured at the round-1 head: a third review
 * reading `verdict: FIX-ROUND-NEEDED` whose `kind:` was a one-element YAML list
 * was dropped and `scripts/check-dual-review.mjs` reported that the pair
 * approves. Eight deformations of one refusing document reached that same
 * green, and the table is in delivery/work-history/m4-p10.md's section 13.
 *
 * WHERE THE LINE IS DRAWN, and it is drawn at the PRESENCE OF THE KEY rather
 * than at the validity of its value:
 *
 *   `verdict`     the key is there and canonicalises to the word. A member.
 *   `other`       the document ANSWERED and the answer is not `verdict`. That
 *                 is a mapping carrying no `kind` key at all, a document that
 *                 is not a mapping (a list, a scalar, an empty file), and a
 *                 `kind` that reads as some other word. Each is a determinate
 *                 negative: nothing here claims to be a typed document, or it
 *                 claims to be a different one.
 *   `unreadable`  the key IS there and its reading failed: a list, a map, a
 *                 number, a boolean, null, an empty or whitespace-only string,
 *                 or a string carrying a character outside printable ASCII.
 *                 Writing a `kind` key is the claim to be a typed document, so
 *                 a failed reading of it is a failed claim, not an absent one.
 *
 * WHY NOT REFUSE EVERY DOCUMENT THAT IS NOT A VERDICT. Because a project is
 * entitled to keep other YAML beside its reviews, and a check that errored on
 * it would be unusable. The property is not that every file is a verdict; it is
 * that a file which LOOKS LIKE a verdict and could not be read as one is NAMED.
 *
 * EXPORTED, and that is the other half of the fix. `scripts/check-dual-review.mjs`
 * had its OWN selection rule, a raw `value["kind"] !== "verdict"`, which is a
 * second reader of one fact: it dropped `kind: Verdict` and `kind: "  verdict  "`
 * that this file's canonicalisation admits. Two readers of one fact is the shape
 * this repository's fix-round contract calls fixing the INSTANCE rather than the
 * MECHANISM, and the sibling `establishDelegatedRegime` one screen down was
 * lifted for exactly that reason. There is now one reader.
 */
export type VerdictKindReading =
  | { kind: "verdict"; record: Record<string, unknown> }
  | { kind: "other" }
  | { kind: "unreadable"; found: string };

export function readVerdictKind(value: unknown): VerdictKindReading {
  const record = asRecord(value);
  if (record === undefined) {
    return { kind: "other" };
  }
  const reading = establishField(record, "kind");
  if (reading.kind === "absent") {
    return { kind: "other" };
  }
  if (reading.kind === "unusable" || reading.kind === "uncanonical") {
    /* The vocabulary is the DOCUMENT's, as it is at `establishField`: a reader
       looking at their own YAML is helped by "a list" and by the codepoint and
       position of the character they cannot see, and not by "unestablished". */
    return { kind: "unreadable", found: reading.found };
  }
  if (reading.value !== "verdict") {
    return { kind: "other" };
  }
  return { kind: "verdict", record };
}

/**
 * WHERE A CORPUS WAS READ FROM, carried WITH the corpus and never assumed.
 *
 * THE MECHANISM THIS TYPE EXISTS TO CLOSE (M4-P11 fix round 1, CR-M4P11-001
 * and CR-M4P11-002). One decision was assembled out of TWO SOURCES OF TRUTH:
 * the declaration was read from the git object database by
 * `readReviewFamilies`, and the corpus that is supposed to refute it was read
 * from the WORKING TREE. Two sources means the two halves can be made to
 * disagree, and the actor the check exists to guard against controls the half
 * that is not committed.
 *
 * Measured by the reviewer at ONE commit, three arms, only the working tree
 * changing: all verdicts present gave red exit 1; an UNCOMMITTED `rm` of the
 * contradicting verdict gave not-applicable exit 20 with the exception
 * GRANTED; copying the file back gave red again. `git ls-tree` listed the file
 * throughout and `git show` still read the second family from it. The
 * declaration was tamper-EVIDENT and the evidence that refutes it was not.
 *
 * So the source is decided ONCE per load and travels with the result, and
 * every sentence a check prints about a corpus ends with the source it was
 * actually read from. A reader can tell a claim about a commit from a claim
 * about somebody's working tree, which is SC-011 applied to the CORPUS rather
 * than to a single check's verdict.
 */
export type VerdictCorpusSource =
  | { kind: "commit"; ref: string; refSha: string; scope: string }
  | { kind: "worktree"; reason: string; scope: string };

/**
 * The corpus, plus the source it was read from. Never one without the other.
 *
 * `unexaminable` IS M4-P10 FIX ROUND 2's CHANNEL, CARRIED ACROSS M4-P11's
 * RESTRUCTURE RATHER THAN DROPPED. M4-P10 added it to the single filesystem
 * loop this phase replaced with a commit arm and a worktree arm, and every
 * caller seeds its violation list from it. A candidate that passed the
 * extension filter and could not be read, did not decode, or declares a `kind`
 * whose reading failed is NOT the determinate answer "not a verdict": it is
 * "nobody knows whether this is a verdict", and dropping it SHRINKS the set the
 * merge predicates reason over, which is the fail-open direction for a
 * predicate that approves when the set is clean.
 */
export interface LoadedVerdictCorpus {
  verdicts: LoadedVerdict[];
  unexaminable: Diagnostic[];
  source: VerdictCorpusSource;
}

/** A verdict document is committed under one of these extensions. */
const VERDICT_FILE_PATTERN = /\.(ya?ml|json)$/i;

/**
 * The project's own paperwork root, and the widest set the FALSIFIERS look at.
 *
 * WHY THIS IS THE BOUNDARY AND NOT THE WHOLE TREE (CR-M4P11-002, and the
 * measurement that decided it). Falsifier 1 asks a question about A PROJECT'S
 * OWN RECORD, so scoping it to `delivery/review/` was defeated by FILE
 * PLACEMENT ALONE: the reviewer committed two `family-b` verdicts under
 * `delivery/evidence/`, which is where this repository actually keeps its only
 * two real verdicts, and the exception was granted anyway.
 *
 * The obvious repair, the whole tree, was tried and MEASURED WRONG. At
 * `122472b` a whole-subtree enumeration finds SEVEN verdict documents here and
 * FIVE of them are `witness/fixtures/dual-review/*.yaml`, deliberately
 * carrying `family-a` and `family-b` because they are the inputs to this very
 * check's own tests. A corpus that counts a test fixture as a project's record
 * would make the exception permanently unusable for any project that vendors
 * fixtures, and would say something false while doing it.
 *
 * `delivery/` is the kernel's OWN declared paperwork root, not a boundary
 * invented here: `REVIEW_DIRECTORY` is under it, `loadDeclaration`
 * (src/gates/release.ts:817) reads phase declarations from under it, and
 * src/gates/scope.ts:565 already treats `delivery/review/` and
 * `delivery/verification/` as the phase-evidence directories. Using it keeps
 * the rule mechanical and placement-based rather than a judgment about which
 * documents look real.
 *
 * WHAT IT STILL DOES NOT REACH, named rather than left to be found: a verdict
 * committed OUTSIDE `delivery/` is invisible to the falsifiers. That residue
 * is smaller than the one it replaces and it is stated here, in the file, so
 * the next reader does not have to re-derive it.
 */
const PAPERWORK_ROOT = "delivery";

/**
 * How to name the set a check just looked at, in the check's own output.
 *
 * SC-011 one scope out: "every verdict this project has committed" and "every
 * file that happens to be sitting in one directory right now" are different
 * claims and must not print the same sentence. This renders a TRAILING
 * parenthetical rather than a clause in the middle of one, so a sentence that
 * already names its subject keeps its shape and gains a provenance tail.
 */
export function describeVerdictCorpusSource(source: VerdictCorpusSource): string {
  return source.kind === "commit"
    ? `(corpus: ${source.scope} read from commit ${source.refSha}, resolved from ${source.ref})`
    : `(corpus: ${source.scope} read from the WORKING TREE because this context has no resolvable git ref: ${source.reason})`;
}

/**
 * How to name the source ONE context document was looked for in.
 *
 * FIX ROUND 2, DV-001. The regime report line used to say "no charter.yaml"
 * about a directory with a `charter.yaml` sitting in it, because the probe had
 * moved to the commit and the sentence had not. A record that names a document
 * and not the SOURCE it was looked for in is unfalsifiable by the person
 * reading it, which is the same SC-011 property `describeVerdictCorpusSource`
 * exists for one scope out.
 */
export function describeContextDocumentSource(source: VerdictCorpusSource): string {
  return source.kind === "commit"
    ? `in commit ${source.refSha}, resolved from ${source.ref}`
    : `in the WORKING TREE, because this context has no resolvable git ref: ${source.reason}`;
}

/**
 * The verdict documents a PAIR decision is made over: `delivery/review/`.
 *
 * TWO ARMS, AND WHICH ONE RAN IS REPORTED RATHER THAN INFERRED.
 *
 * THE COMMIT ARM is taken whenever `<context>` resolves `ref`, and it reads
 * the directory's entries out of the git object database. The filesystem is
 * not consulted at all, so an uncommitted addition, deletion or edit cannot
 * change what this returns. That is the anti-widening rule
 * `readReviewFamilies` and `loadDeclaration` (src/gates/release.ts:817)
 * already apply to a DECLARATION, now applied to the evidence beside it. It
 * closes both directions of the same hole: an uncommitted DELETION can no
 * longer remove a verdict that contradicts a declaration, and an uncommitted
 * ADDITION can no longer manufacture the pair DR-0012 condition 2 requires.
 *
 * THE WORKTREE ARM is taken only when there is no resolvable ref, which is the
 * pre-existing behaviour for a context that is not a git repository at all,
 * and it SAYS SO in every sentence it produces. No exception can be granted on
 * this arm, because `readReviewFamilies` resolves the same ref and returns
 * absent or error when it cannot: with no git there is one source of truth and
 * nothing to disagree.
 *
 * THE SCOPE STAYS `delivery/review/` HERE, and widening it was measured wrong.
 * `headGroupFor` turns this set into the reviews of one `(phase, head)`, and
 * five of the seven verdict documents in this repository's tree are fixtures
 * for this check's own tests. See `PAPERWORK_ROOT` above; the widest set is
 * what the FALSIFIERS use, and it is a different question.
 *
 * A file that does not carry `kind: verdict` is SKIPPED rather than reported,
 * because that directory also holds this project's prose reviews and a check
 * that reddened on a markdown file would be unusable. What is NOT skipped is
 * the directory being unreadable, which the caller turns into a violation:
 * "nothing to compare" and "could not look" are different facts.
 *
 * AND A CANDIDATE THAT COULD NOT BE LOOKED AT IS THE SECOND HALF OF THAT SAME
 * SENTENCE, WHICH THE FIRST ROUND WROTE AND APPLIED AT ONE SITE ONLY. A
 * `.yaml`, `.yml` or `.json` file here has passed the only filter that
 * separates a candidate verdict from a prose review, so bytes that cannot be
 * READ and bytes that do not DECODE are not "this is not a verdict", they are
 * "nobody knows whether this is a verdict". Dropping such a file SHRINKS the
 * set the merge predicates reason over, which is the fail-open direction for a
 * predicate that approves when the set is clean: measured at the reviewed head,
 * a third review reading FIX-ROUND-NEEDED with one malformed line left
 * `verdict-pair-approves` printing that the pair approves. So they are returned
 * as diagnostics and every caller seeds its violation list with them, exactly
 * as `headGroupFor` already does for a sibling with no usable head.
 */
export function loadCommittedVerdicts(
  contextDirectory: string,
  source: VerdictCorpusSource = resolveCorpusSource(contextDirectory),
): ({ ok: true } & LoadedVerdictCorpus) | { ok: false; reason: string } {
  if (source.kind !== "commit") {
    return loadVerdictsFromWorktree(contextDirectory, source.reason);
  }
  const refSha = source.refSha;
  /* RECURSIVE SINCE THE DR-0047 SWEEP (CR-VS-002), AND THE ARGUMENT THAT USED
     TO SIT AT `loadPaperworkVerdicts` FOR WHY THIS ONE WAS FLAT IS WITHDRAWN.
     One function had two callers at two depths, so a committed document could
     be INSIDE the corpus that can contradict a single-family declaration and
     OUTSIDE the corpus that can refuse a merge. Measured before the change: two
     APPROVE verdicts at this directory's top level plus a committed THIRD
     verdict for the same phase and head reading FIX-ROUND-NEEDED one directory
     down gave `check-dual-review: green`, exit 0, with the refusal neither
     counted nor mentioned; and with BOTH verdicts one directory down the gate
     reported `0 verdict document(s)` and not-applicable while `git ls-files`
     listed them. `ls-tree` without `-r` yields the SUBTREE'S NAME, which
     `VERDICT_FILE_PATTERN` discards, so the drop was silent by construction,
     which is the fail-open direction for a predicate that approves when the set
     is clean. Depth is now a property of the LISTING FUNCTION's one contract
     rather than of which caller reached it. */
  const listed = listCommittedTree(contextDirectory, refSha, REVIEW_DIRECTORY, true);
  if (!listed.ok) {
    return { ok: false, reason: listed.reason };
  }
  const recordsPrefix = `${REVIEW_DIRECTORY}/${REVIEW_RECORDS_SUBDIRECTORY}/`;
  return readCommittedVerdicts(
    contextDirectory,
    refSha,
    listed.paths.filter((path) => !path.startsWith(recordsPrefix)),
    source,
  );
}

/**
 * M6-P5: every file under one directory of the corpus source, as paths
 * relative to the context directory. The same two arms as the verdict loader:
 * the commit when the context resolves one, else the working tree. An absent
 * directory is an empty list.
 */
export function listSourceFiles(
  contextDirectory: string,
  source: VerdictCorpusSource,
  directory: string,
): { ok: true; paths: string[] } | { ok: false; reason: string } {
  if (source.kind === "commit") {
    return listCommittedTree(contextDirectory, source.refSha, directory, true);
  }
  const absolute = join(contextDirectory, directory);
  const entry = classifyEntry(absolute);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { ok: true, paths: [] };
  }
  try {
    return {
      ok: true,
      paths: readdirSync(absolute, { recursive: true })
        .map((name) => join(directory, String(name)))
        .filter((path) => classifyEntry(join(contextDirectory, path)).kind === "regular")
        .sort(),
    };
  } catch (error) {
    return { ok: false, reason: `${absolute} could not be listed: ${String(error)}` };
  }
}

/** M6-P5: one file's exact bytes at the corpus source, with absent kept apart from unreadable. */
export function readSourceBytes(
  contextDirectory: string,
  source: VerdictCorpusSource,
  relativePath: string,
): { kind: "read"; bytes: Buffer } | { kind: "absent" } | { kind: "error"; reason: string } {
  if (source.kind === "commit") {
    const typed = gitIn(["cat-file", "-t", `${source.refSha}:./${relativePath}`], contextDirectory);
    if (!typed.ok) {
      return { kind: "absent" };
    }
    if (typed.stdout.trim() !== "blob") {
      return { kind: "error", reason: `${source.refSha}:./${relativePath} is a ${typed.stdout.trim()}, not a file` };
    }
    const shown = spawnSync("git", ["show", `${source.refSha}:./${relativePath}`], {
      cwd: contextDirectory,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (shown.error !== undefined || shown.status !== 0) {
      return {
        kind: "error",
        reason: `${source.refSha}:./${relativePath} could not be read: ${String(shown.error ?? shown.stderr ?? "")}`,
      };
    }
    return { kind: "read", bytes: shown.stdout };
  }
  const path = join(contextDirectory, relativePath);
  const entry = classifyEntry(path);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { kind: "absent" };
  }
  if (entry.kind !== "regular") {
    return { kind: "error", reason: entry.reason };
  }
  try {
    return { kind: "read", bytes: readFileSync(path) };
  } catch (error) {
    return { kind: "error", reason: `${path} could not be read: ${String(error)}` };
  }
}

/**
 * List one committed directory, as paths relative to the CONTEXT DIRECTORY.
 *
 * ONE LISTING IDIOM FOR BOTH CORPORA (FIX ROUND 2, DV-002), AND THE PATHSPEC
 * FORM IS THE LOAD-BEARING HALF. Fix round 1 replaced one `readdirSync` with
 * TWO different git idioms: the falsifiers' corpus listed
 * `<sha> -- ./<dir>/` and the pair corpus listed the tree-ish `<sha>:./<dir>`.
 * Those are not two spellings of one question. `git ls-tree` applies the
 * CURRENT DIRECTORY as an implicit pathspec, so a tree-ish listing run from a
 * context directory that is a SUBDIRECTORY of its repository is filtered
 * against a prefix the named tree's own entries do not carry, and it returns
 * NOTHING with exit 0. Measured, one commit, cwd = a context directory nested
 * one level inside its repository, `delivery/review/` holding two committed
 * verdicts:
 *
 *   git cat-file -t $S:./delivery/review              -> tree, exit 0
 *   git ls-tree -z --name-only $S:./delivery/review   -> EMPTY, exit 0
 *   git ls-tree -z --name-only $S -- ./delivery/review/
 *                                                     -> both names, exit 0
 *
 * An empty listing is then indistinguishable from an absent directory, so
 * "could not enumerate" became "there are none", the pair corpus came back
 * empty, and a committed pair sharing one reviewer-written family reported
 * NOT-APPLICABLE on a conditional gate instead of red. The kernel's own
 * repository could not see it, because the registry command ran the script
 * with `.` at the repository root; every consumer whose tiphys context is not
 * its repository root does see it.
 *
 * The pathspec form's output is relative to the current directory, which is
 * the context directory, which is what `readCommittedVerdicts` then hands to
 * `git show ${refSha}:./${path}`. The listing and the read therefore resolve
 * against the SAME base, which is the property that broke.
 *
 * ABSENT, REGULAR AND UNLISTABLE ARE THREE ANSWERS, exactly as `classifyEntry`
 * gives three on the worktree arm. `git cat-file -t` is what separates them:
 * a missing path is an empty corpus, a `blob` where a directory was expected
 * is the same fact the worktree arm reports as "is a regular file, not a
 * directory", and a listing that fails for any other reason has not reached a
 * verdict and must not report one (M2-C-3).
 */
function listCommittedTree(
  contextDirectory: string,
  refSha: string,
  directory: string,
  recursive: boolean,
): { ok: true; paths: string[] } | { ok: false; reason: string } {
  const typed = gitIn(["cat-file", "-t", `${refSha}:./${directory}`], contextDirectory);
  if (!typed.ok) {
    /* ABSENT, OR COULD NOT LOOK, AND THEY ARE NOT THE SAME ANSWER. Until this
       round a `cat-file -t` that failed for ANY reason returned an empty
       corpus, so an object database that could not be read reported the same
       thing as a project that keeps no `delivery/` at all, which is the
       "could not look" reported as "looked and found nothing" shape the
       sibling loader's comment already named. Absence is established by a
       SECOND probe that does not mention the path: if the commit object
       itself is readable, the only thing the first probe can have been
       reporting is that the path is not in it. This is the same fail-closed
       rule `readCommittedVerdicts` twenty lines down already applies to a
       blob it was told about and cannot read. */
    const commitReadable = gitIn(["cat-file", "-t", refSha], contextDirectory);
    if (!commitReadable.ok) {
      return {
        ok: false,
        reason:
          `${refSha} could not be read in ${contextDirectory}, so whether ${directory}/ is committed there ` +
          `was not established and an empty corpus must not be reported: ${commitReadable.reason}`,
      };
    }
    return { ok: true, paths: [] };
  }
  const type = typed.stdout.trim();
  if (type !== "tree") {
    return {
      ok: false,
      reason:
        `${refSha}:./${directory} is a ${type}, not a directory, so the committed verdicts cannot be enumerated`,
    };
  }
  const listed = gitIn(
    [
      "ls-tree",
      ...(recursive ? ["-r"] : []),
      "-z",
      "--name-only",
      refSha,
      "--",
      `./${directory}/`,
    ],
    contextDirectory,
  );
  if (!listed.ok) {
    return {
      ok: false,
      reason: `${refSha}:./${directory} could not be listed: ${listed.reason}`,
    };
  }
  return { ok: true, paths: listed.stdout.split("\0").filter((name) => name !== "") };
}

/**
 * Read a list of committed paths and keep the ones that are verdicts.
 *
 * `-z` ON EVERY LISTING THAT FEEDS THIS IS LOAD-BEARING. Without it git QUOTES
 * a path carrying a quote, a backslash or a non-ASCII byte, and the quoted
 * spelling is not the path `git show` wants, so exactly the documents whose
 * names are unusual would drop out of the corpus. Dropping a document from the
 * corpus is the fail-open direction.
 *
 * `${refSha}:./${path}` AND NOT `${refSha}:${path}`, for the reason
 * `readReviewFamilies` already gives further down: without the leading `./`
 * git resolves the path against the REPOSITORY ROOT, so a context directory
 * nested inside a larger repository would silently read the outer
 * repository's documents. With `./` the listing and the read are both relative
 * to the directory the caller named, so they cannot disagree about which tree
 * they are describing.
 */
function readCommittedVerdicts(
  contextDirectory: string,
  refSha: string,
  paths: readonly string[],
  source: VerdictCorpusSource,
): ({ ok: true } & LoadedVerdictCorpus) | { ok: false; reason: string } {
  const documents: CorpusDocument[] = [];
  for (const path of [...paths].sort()) {
    if (!VERDICT_FILE_PATTERN.test(path)) {
      continue;
    }
    const shown = gitIn(["show", `${refSha}:./${path}`], contextDirectory);
    if (!shown.ok) {
      /* A path the same commit's own listing named and the same commit cannot
         produce is not a document to skip, it is a corpus that could not be
         read. M2-C-3: this has not reached a verdict, so it must not report
         one. */
      return {
        ok: false,
        reason:
          `${refSha}:./${path} is listed in ${refSha} and could not be read, so the committed verdict corpus is ` +
          `incomplete and no merge precondition can be decided over it: ${shown.reason}`,
      };
    }
    documents.push({ path: join(contextDirectory, path), body: shown.stdout });
  }
  const selected = selectVerdicts(documents);
  return { ok: true, verdicts: selected.verdicts, unexaminable: selected.unexaminable, source };
}

/**
 * Read a context document AT THE SOURCE THE DECISION IS BEING MADE FROM.
 *
 * FIX ROUND 1, AND IT IS THE FOURTH SITE OF THE MECHANISM the reviewers found
 * at the first. Their finding was that the CORPUS was read from disk while the
 * declaration was read from a commit. The derivation for it (D2 and D3 in the
 * work history) turned up the same split one document further out and WORSE:
 * `establishDelegatedRegime` decides whether a delegated merge grant is in
 * force at all, and it read `charter.yaml` and `assurance-modes.yaml` off
 * DISK, while `readReviewFamilies` read THE SAME `charter.yaml` out of the
 * object database.
 *
 * Measured, one commit, one working-tree edit of one word:
 *
 *   committed `delivery-mode: full` (merge-authority delegated-under-conditions)
 *   with a pair sharing one family          -> red, exit 1
 *   the SAME commit, `delivery-mode: direct-pr` written into the working tree
 *   and never committed                     -> GREEN, exit 0, and the record
 *                                              prints "mode direct-pr declares
 *                                              merge-authority owner, which is
 *                                              not a delegated grant"
 *
 * That is not the exception being bought, it is the ENTIRE decorrelation
 * requirement being switched off, by an edit no commit records and no diff
 * shows. It is the same mechanism as CR-M4P11-001 and it is why this round
 * fixes the mechanism rather than the corpus.
 *
 * The worktree arm is the pre-existing behaviour and is unchanged: with no
 * resolvable ref there is one source of truth and nothing to disagree.
 */
function readContextDocumentAt(
  contextDirectory: string,
  relativePath: string,
  source: VerdictCorpusSource,
): { ok: true; value: unknown; path: string } | { ok: false; reason: string } {
  if (source.kind !== "commit") {
    return readContextDocument(contextDirectory, relativePath);
  }
  const path = join(contextDirectory, relativePath);
  const shown = gitIn(["show", `${source.refSha}:./${relativePath}`], contextDirectory);
  if (!shown.ok) {
    return {
      ok: false,
      reason: `${source.refSha}:./${relativePath} could not be read: ${shown.reason}`,
    };
  }
  const decoded = decodeDocument(shown.stdout, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  return { ok: true, value: decoded.value, path };
}

/**
 * Is a context document present AT THE SOURCE the decision is read from?
 *
 * SEPARATE FROM READING IT, because "absent" and "present and unreadable" are
 * different facts with different verdicts one screen down, exactly as
 * `classifyEntry` keeps them apart on the worktree arm.
 */
function contextDocumentPresentAt(
  contextDirectory: string,
  relativePath: string,
  source: VerdictCorpusSource,
): boolean {
  if (source.kind !== "commit") {
    return classifyEntry(join(contextDirectory, relativePath)).kind !== "absent";
  }
  const typed = gitIn(
    ["cat-file", "-t", `${source.refSha}:./${relativePath}`],
    contextDirectory,
  );
  return typed.ok && typed.stdout.trim() === "blob";
}

/**
 * Resolve, ONCE, the source every document of one decision is read from.
 *
 * EXPORTED because the two merge-precondition checks each resolve it at the
 * top of their own run and hand the SAME value to the regime reader, the
 * declaration reader and both corpus loaders. One resolution is what makes
 * "the halves disagree" unrepresentable rather than merely unlikely.
 */
export function resolveCorpusSource(
  contextDirectory: string,
  ref = "HEAD",
): VerdictCorpusSource {
  const resolved = gitIn(["rev-parse", `${ref}^{commit}`], contextDirectory);
  return resolved.ok
    ? { kind: "commit", ref, refSha: resolved.stdout.trim(), scope: REVIEW_DIRECTORY }
    : { kind: "worktree", reason: resolved.reason, scope: REVIEW_DIRECTORY };
}

/**
 * One document read out of a corpus, however it was obtained.
 *
 * THE TWO ARMS CONVERGE HERE AND NOT LATER. Reading is what differs between a
 * commit and a working tree; SELECTING what counts as a verdict is one rule,
 * and two copies of a selection rule is how the halves of one decision drift
 * apart, which is the mechanism this whole section exists to remove. A third
 * copy lived in `scripts/check-dual-review.mjs` and has been deleted in favour
 * of calling `loadCommittedVerdicts` itself.
 */
interface CorpusDocument {
  path: string;
  body: string;
}

/**
 * The one selection rule, applied to every document an arm produced.
 *
 * MATERIALISED RATHER THAN STREAMED, and the bound is stated rather than left
 * to be discovered: the widest corpus is the candidate `.yaml`, `.yml` and
 * `.json` blobs under `delivery/`, measured at 103 files and 8953667 bytes in
 * this repository at `79ce63b`, and it is read only when a single-family
 * declaration has already been established.
 */
function selectVerdicts(
  documents: readonly CorpusDocument[],
): { verdicts: LoadedVerdict[]; unexaminable: Diagnostic[] } {
  const verdicts: LoadedVerdict[] = [];
  const unexaminable: Diagnostic[] = [];
  for (const { path, body } of documents) {
    const decoded = decodeDocument(body, path);
    if (!decoded.ok) {
      unexaminable.push({
        pointer: "#/kind",
        message: `${path} sits under ${REVIEW_DIRECTORY} and did not decode, so whether it is a verdict refusing this head could not be established, and a merge check that could not look at one document must not report the rest of them clean: ${decoded.reason}`,
      });
      continue;
    }
    /* CANONICAL HERE TOO, AND THE REASON IS THE SAME ONE ONE LAYER OUT. This
       `===` decides MEMBERSHIP OF THE GROUP the pair decision is made over,
       so a lookalike character in `kind` does not produce a wrong comparison,
       it silently removes a document from the comparison. With three
       verdicts, one of them refusing, dropping the refusing one leaves an
       approving pair and a green run. That is the
       same fail-open outcome as the reported finding, reached by making the
       check look at less rather than by making it compare wrongly.

       Canonicalising ADMITS more documents, which is the fail-closed direction
       here: more verdicts in the group means more chances to find a refusal,
       never fewer. A file that is not a verdict at all still fails this
       test, because no canonical form turns a prose review into `verdict`. */
    /* THE ONE READER, AND FIX ROUND 2 IS THAT IT IS ONE READER WITH THREE
       OUTCOMES RATHER THAN A BOOLEAN. `readVerdictKind` is documented at its
       own definition; what matters here is that `unreadable` is a DIAGNOSTIC
       and `other` is a skip, because a document whose `kind` key is present and
       whose reading FAILED has not said it is not a verdict, it has said
       nothing that could be read. The skip below is now reached only by a
       document that answered. */
    const kindReading = readVerdictKind(decoded.value);
    if (kindReading.kind === "unreadable") {
      unexaminable.push({
        pointer: "#/kind",
        message: `${path} sits under ${REVIEW_DIRECTORY} and declares a kind field that could not be read as a word (it is ${kindReading.found}), so whether it is a verdict refusing this head could not be established, and a merge check that could not read one document's own type must not report the rest of them clean`,
      });
      continue;
    }
    if (kindReading.kind !== "verdict") {
      continue;
    }
    verdicts.push({ path, record: kindReading.record });
  }
  return { verdicts, unexaminable };
}

/** The pre-existing arm, for a context that is not a git repository. */
function loadVerdictsFromWorktree(
  contextDirectory: string,
  why: string,
): ({ ok: true } & LoadedVerdictCorpus) | { ok: false; reason: string } {
  const source: VerdictCorpusSource = {
    kind: "worktree",
    reason: why,
    scope: REVIEW_DIRECTORY,
  };
  const directory = join(contextDirectory, REVIEW_DIRECTORY);
  /* `classifyEntry` HAS NO `directory` KIND: a directory lands in `irregular`,
     which is the kind that means "present and not safe to OPEN AS A FILE". So
     the shape here is the one `listWitnessSpecFiles` already uses: classify to
     rule out absent and unexaminable, then LIST, and read the classification
     again only to explain a listing failure. Testing for a kind that does not
     exist would have been dead code that always took the error arm. */
  const entry = classifyEntry(directory);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { ok: true, verdicts: [], unexaminable: [], source };
  }
  if (entry.kind === "unexaminable") {
    return { ok: false, reason: entry.reason };
  }
  let names: string[];
  try {
    /* `recursive` SO THE TWO ARMS READ THE SAME DEPTH (CR-VS-002). The commit
       arm lists the whole subtree, and an arm that read one level would make
       WHICH ARM RAN decide whether a refusing verdict one directory down is
       part of the corpus. That is the same one-rule-two-readings shape this
       section already removed for the selection rule. `recursive` yields paths
       relative to `directory`, which is what `join` below already expects, and
       a nested name still has to pass `VERDICT_FILE_PATTERN`. */
    names = readdirSync(directory, { recursive: true }).map((name) => String(name));
  } catch (error) {
    if (entry.kind === "regular") {
      return {
        ok: false,
        reason: `${directory} is a regular file, not a directory, so the committed verdicts cannot be enumerated`,
      };
    }
    return { ok: false, reason: `${directory} could not be listed: ${String(error)}` };
  }
  const documents: CorpusDocument[] = [];
  const unreadable: Diagnostic[] = [];
  for (const name of names.sort()) {
    if (!VERDICT_FILE_PATTERN.test(name) || name.startsWith(`${REVIEW_RECORDS_SUBDIRECTORY}/`)) {
      continue;
    }
    const path = join(directory, name);
    const read = readOperatorPath(path);
    if (!read.ok) {
      /* M4-P10 FIX ROUND 2, REAPPLIED ON THIS ARM. The commit arm one screen up
         refuses the whole corpus when a path its own listing named cannot be
         produced, which is stricter than a diagnostic and is right there: the
         same commit named it. Here the directory was listed from a working tree
         that can change under the read, so the fail-closed form is the one
         M4-P10 wrote, a named candidate carried out to every caller's violation
         list rather than a silent `continue`. */
      unreadable.push({
        pointer: "#/kind",
        message: `${path} sits under ${REVIEW_DIRECTORY} and could not be read, so whether it is a verdict refusing this head could not be established, and a merge check that could not look at one document must not report the rest of them clean: ${read.reason}`,
      });
      continue;
    }
    documents.push({ path, body: read.body });
  }
  const selected = selectVerdicts(documents);
  return {
    ok: true,
    verdicts: selected.verdicts,
    unexaminable: [...unreadable, ...selected.unexaminable],
    source,
  };
}

/**
 * A field read WITH ITS PRESENCE ESTABLISHED. This is the whole of CR-001's
 * repair, and it is stated as a mechanism rather than as three field names.
 *
 * THE MECHANISM CR-001 NAMES: a value read with a DEFAULT and then compared
 * makes ABSENT and PRESENT-AND-DIFFERENT into the same fact. `?? ""` turned a
 * missing family field into the empty string, the empty string differs from
 * every real family name, and "differs" is what this check reads as
 * decorrelated. So a pair that could NOT be shown decorrelated was reported as
 * one that was, and that is the direction which authorises a merge.
 *
 * The repair is not a fourth comparison. It is that a value is not COMPARABLE
 * until it has been established, and the three outcomes are kept apart:
 * ESTABLISHED (a non-empty string), ABSENT (the key is not there at all), and
 * UNUSABLE (the key is there carrying null, whitespace, a number, a list or a
 * map). Only the first is ever handed to a comparison. The other two get their
 * own verdict in their own words, because "could not look" must never print as
 * "looked and fine" (SC-011), which is the rule this function already applied
 * to the charter one screen above and did not apply here.
 *
 * `field in record` is why this is not merely a `typeof` test, and the
 * distinction is not academic: `key:` with nothing after it decodes to
 * `null`, which is present-and-unusable rather than missing, and the reader who
 * fixes one is not fixing the other.
 *
 * WHY THE SCHEMA DOES NOT DISCHARGE THIS. `schemas/verdict.schema.json` really
 * does put all three dimensions in `required`, and the previous version of this
 * code relied on that. Nothing on the shipped path ever runs that validation
 * over the SIBLING documents: `loadCommittedVerdicts` skips a file only when it
 * fails to decode or is not `kind: verdict`, so a verdict missing a required
 * field is loaded and compared. The composition was asserted in a comment and
 * implemented nowhere. A check does not get to assume its inputs were validated
 * by a step that does not exist.
 */
type EstablishedField =
  | { kind: "established"; value: string }
  | { kind: "absent" }
  | { kind: "unusable"; found: string }
  | { kind: "uncanonical"; found: string };

/**
 * THE CANONICAL FORM OF A GOVERNANCE SCALAR, DECLARED HERE BECAUSE A
 * COMPARISON WITHOUT A DECLARED CANONICAL FORM IS THE FIX-ROUND-2 MECHANISM.
 *
 * THE MECHANISM: two strings are compared for EQUALITY or DISTINCTNESS without
 * a declared canonical form, so two REPRESENTATIONS of one value read as two
 * different values. Round 1 closed "absent versus present-and-differing". This
 * closes "differently represented versus different", which is the same check
 * one layer down.
 *
 * WHY IT IS SAFE TO COLLAPSE HARD HERE, which is the argument that decides
 * every choice below. This check REFUSES when two reviews are NOT distinct, so
 * any rule that makes MORE strings compare as equal produces MORE refusals.
 * Aggressive canonicalisation is the FAIL-CLOSED direction; timid
 * canonicalisation is what leaves the hole. The one call site where collapsing
 * is instead mildly permissive was named at `decorrelationTriple`, which M6-P5
 * deleted with the family comparison it served.
 *
 * THE FORM, in order, and the order is load-bearing:
 *
 *   1. NFKC. Folds compatibility variants onto their ordinary forms, so
 *      FULLWIDTH LATIN SMALL LETTER A (U+FF41) becomes `a` and NO-BREAK SPACE
 *      (U+00A0) becomes a space. Measured: of the five lookalike substitutions
 *      that defeated the previous code, NFKC folds exactly ONE. That
 *      measurement is why step 2 exists and is not decoration.
 *   2. PRINTABLE ASCII ONLY (U+0020 to U+007E). Anything else is REFUSED, not
 *      repaired. This is what actually closes the class: NFKC leaves CYRILLIC
 *      SMALL LETTER A (U+0430), EN DASH (U+2013), ZERO WIDTH SPACE (U+200B)
 *      and SOFT HYPHEN (U+00AD) exactly as they were, all four measured, and
 *      no Unicode normalisation form folds a cross-script homoglyph onto its
 *      lookalike. Closing those by normalisation would need a confusables
 *      table this package does not carry and which goes stale; refusing the
 *      character set needs no table and cannot go stale.
 *   3. Whitespace runs collapse to one space, then trim. Whitespace carries no
 *      information in a scalar identifier (round 1's argument, kept).
 *   4. ASCII case fold. See the CR-003 note at `establishField`.
 *
 * WHY REFUSE AN INVISIBLE CHARACTER RATHER THAN STRIP IT. Stripping is also
 * fail-closed and was the other real option. Refusing is chosen because a
 * document carrying a zero-width space in a model-family id is a document that
 * reads one way to a human and another way to the program, and silently
 * repairing it would hand back a green having never said so. That is SC-011's
 * rule, which this file already applies one screen up: "could not look" must
 * never print as "looked and fine", and "looked, and what I found was built to
 * deceive the reader" is the same fact. A refusal names the codepoint and its
 * position, so the person holding the file can see what they cannot see.
 */
const CANONICAL_MAX_CODE = 0x7e;
const CANONICAL_MIN_CODE = 0x20;

function canonicalScalar(raw: string): { ok: true; value: string } | { ok: false; found: string } {
  const folded = raw.normalize("NFKC");
  for (const character of folded) {
    const code = character.codePointAt(0) as number;
    if (code < CANONICAL_MIN_CODE || code > CANONICAL_MAX_CODE) {
      /* The POSITION is in the NFKC-folded string, and it is reported because
         the whole point of this arm is characters a reader cannot see. A
         codepoint alone does not tell them WHERE to look. */
      const at = [...folded].indexOf(character);
      const point = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
      return { ok: false, found: `${point} at position ${String(at + 1)}` };
    }
  }
  const collapsed = folded.replace(/\s+/g, " ").trim();
  if (collapsed === "") {
    return { ok: false, found: "no printable characters" };
  }
  return { ok: true, value: collapsed.toLowerCase() };
}

function establishField(
  record: Record<string, unknown> | undefined,
  field: string,
): EstablishedField {
  if (record === undefined || !(field in record)) {
    return { kind: "absent" };
  }
  const raw = record[field];
  if (typeof raw !== "string") {
    /* The vocabulary is the DOCUMENT's, not JavaScript's: a reader looking at
       their own YAML is helped by "a list" and "a map" and not by "an object". */
    const found =
      raw === null
        ? "null"
        : Array.isArray(raw)
          ? "a list"
          : typeof raw === "object"
            ? "a map"
            : `a ${typeof raw}`;
    return { kind: "unusable", found };
  }
  if (raw.trim() === "") {
    return { kind: "unusable", found: raw === "" ? "an empty string" : "only whitespace" };
  }
  /* CANONICALISED, AND THAT IS THE WHOLE OF FIX ROUND 2. An established value is
     what the document MEANS, and neither surrounding whitespace nor the choice
     of codepoint used to draw a letter is part of a model family's name. The
     form itself, and the argument for its aggressiveness, is at
     `canonicalScalar` one screen up.

     CASE IS NOW FOLDED, REVERSING ROUND 1, AND THE CITATION ROUND 1 INHERITED
     WAS CHECKED RATHER THAN CARRIED FORWARD. Round 1 declined to fold case on
     the grounds that "the review that found CR-001 names case-insensitive
     comparison as an example of a WEAKENING of this check". CR-003 is a LOW
     finding about WITNESS SPEC CONSTRUCTION, not about this comparison. Its
     words, at delivery/review/clean-room-m3-p9-criteria.md:527, are that "a
     stronger second member would be a different way to break the comparison,
     for example comparing the dimension case-insensitively or grouping on the
     wrong key". That is a suggestion for a MUTATION to put in a witness spec's
     `dangerousStates`, which is a deliberate defect a test must redden against.
     It is not a ruling that the shipped comparison should be case-sensitive.

     And the direction settles it independently of what the reviewer meant: this
     check refuses when values are NOT distinct, so folding case makes more
     values compare as equal, which produces MORE refusals. A case-insensitive
     comparison here cannot be a weakening, because there is no input it lets
     through that a case-sensitive one refuses. Measured before this line
     existed: a family written `Family-A` against one written `family-a` on a pair
     sharing one model family exited 0 GREEN, and `merge-authority:
     Delegated-Under-Conditions` disabled the check entirely. Both now redden. */
  const canonical = canonicalScalar(raw);
  if (!canonical.ok) {
    return { kind: "uncanonical", found: canonical.found };
  }
  return { kind: "established", value: canonical.value };
}

/**
 * The sentence for a reading that is NOT established, so absence and
 * unusability never share a message with each other or with a comparison.
 * Returns `undefined` for an established reading, which no caller asks about.
 */
function unestablishedReason(reading: EstablishedField, field: string): string | undefined {
  if (reading.kind === "established") {
    return undefined;
  }
  if (reading.kind === "absent") {
    return `declares no ${field}`;
  }
  if (reading.kind === "uncanonical") {
    /* ITS OWN SENTENCE, because it is its own fact. "Names no value" is false
       here: the field names a value perfectly well, and the value is drawn in
       characters that no reader can tell from another value's. Printing that as
       "names no value" would send the reader looking for a missing field. */
    return (
      `declares ${field} using the character ${reading.found}, which is outside the printable ASCII ` +
      `a governance identifier is compared as, so it cannot be told apart from a value drawn in ordinary characters`
    );
  }
  return `declares ${field} as ${reading.found}, which names no value`;
}

/* ------------------------------------------------------------------ */
/* The head, and what it is allowed to be (M4-P10)                      */
/* ------------------------------------------------------------------ */

/**
 * A commit sha as `schemas/verdict.schema.json` spells it.
 *
 * RESTATED HERE RATHER THAN BORROWED FROM THE SCHEMA, and that is not
 * duplication by accident. Nothing on the shipped path validates the SIBLING
 * documents this check loads (the verdict loader skips only a file that does
 * not decode or is not a verdict), so a sibling carrying an abbreviated `head` reaches the grouping code
 * whatever the schema says. A check that trusted the schema for this would put
 * a short sha in its own group of one and never compare it to anything, which
 * is the fail-open direction.
 */
const FULL_SHA = /^[0-9a-f]{40}$/;

/** One verdict's group key, or the reason it does not have one. */
type HeadKey = { ok: true; value: string } | { ok: false; message: string };

/**
 * Establish the head a verdict claims to review.
 *
 * TWO REFUSALS, AND THEY ARE DIFFERENT FACTS. An UNESTABLISHED `head` is the
 * ordinary absent-or-unusable-or-uncanonical reading every other dimension in
 * this file gets, with its own sentence from `unestablishedReason`. A head that
 * IS established and is not forty hex digits is a SECOND SPELLING of a fact
 * some other document may state in full, and it is refused on its own terms,
 * because no canonical form reconciles an abbreviation with the forty-character
 * sha it abbreviates without resolving both against a repository this check is
 * never given.
 *
 * Case never reaches the pattern as a problem: `establishField` folds it, so an
 * upper-case sha and a lower-case one are already ONE key by the time the test
 * runs. That is the direction the hazard row asks for, two spellings of one
 * head becoming one group rather than two.
 */
function headKeyOf(record: Record<string, unknown> | undefined, where: string): HeadKey {
  const reading = establishField(record, "head");
  if (reading.kind !== "established") {
    return {
      ok: false,
      message: `${where} ${unestablishedReason(reading, "head") as string}, so the reviews cannot be grouped by the head they reviewed, and a delegated grant is not satisfied by a review that does not say what it reviewed`,
    };
  }
  if (!FULL_SHA.test(reading.value)) {
    return {
      ok: false,
      message: `${where} declares head ${reading.value}, which is not forty lowercase hexadecimal digits; an abbreviated sha is a second spelling of one head and would form its own group of one, which is never compared to anything`,
    };
  }
  return { ok: true, value: reading.value };
}

/** The committed verdicts for one (phase, head), plus every sibling refused a key. */
interface HeadGroup {
  members: LoadedVerdict[];
  unkeyed: Diagnostic[];
  /**
   * KERNEL 0.2.1 (DR-0054): same-phase siblings that declare NO head at all
   * and were excluded as history, each with the ground it was excluded on.
   * Never a member; the caller prints each one so the exclusion is never
   * silent. A head-less sibling the change under audit adds or edits is NOT
   * here: it is in `unkeyed`, refused (fix round 2).
   */
  headless: HeadlessSibling[];
}

/** A head-less sibling excluded as history, and on what ground. */
interface HeadlessSibling {
  path: string;
  record: Record<string, unknown>;
  /**
   * `at-base`: the same bytes exist at the merge base, so the change under
   * audit did not write it. `unchecked`: the caller gave no base, so the
   * exclusion rests on the document's shape alone, and the line says so.
   */
  ground: { kind: "at-base"; mergeBase: string } | { kind: "unchecked" };
}

/**
 * How a head-less sibling's provenance is judged for one run (fix round 2).
 *
 * `unchecked` when the caller gave no base. `error` when a base was given
 * and the merge base could not be established: every head-less sibling is
 * then refused, because "could not tell whether this is history" must not
 * shrink the group (the fail-closed direction).
 */
type HistoryProvenance =
  | { kind: "unchecked" }
  | { kind: "checked"; mergeBase: string; refSha: string }
  | { kind: "error"; reason: string };

function establishHistoryProvenance(
  contextDirectory: string,
  source: VerdictCorpusSource,
  base: string | undefined,
): HistoryProvenance {
  if (base === undefined) {
    return { kind: "unchecked" };
  }
  if (source.kind !== "commit") {
    return {
      kind: "error",
      reason: `a base (${base}) was given but the verdicts were read from the working tree (${source.reason}), so whether it predates the change under audit could not be established`,
    };
  }
  const merged = gitIn(["merge-base", base, source.refSha], contextDirectory);
  if (!merged.ok) {
    return {
      kind: "error",
      reason: `the merge base of ${base} and ${source.refSha} could not be established (${merged.reason}), so whether it predates the change under audit is unknown`,
    };
  }
  return { kind: "checked", mergeBase: merged.stdout.trim(), refSha: source.refSha };
}

/**
 * The blob id of a loaded verdict's `path` at `rev`, or undefined when absent.
 *
 * `path` is as the corpus loader returns it, `join(contextDirectory, <path in
 * the commit>)`, so it is ABSOLUTE when the caller's context directory is (the
 * merge-preconditions gate) and relative when it is not (a relative --context). It
 * is taken back to the context directory first, because `rev:./<path>` names
 * a path relative to the current directory and an absolute one is never found:
 * measured on the first run of this code, every sibling read as ADDED at
 * merge-preconditions while check-dual-review read the same one correctly.
 */
function blobAt(contextDirectory: string, rev: string, path: string): string | undefined {
  const inContext = relative(contextDirectory, path);
  const shown = gitIn(["rev-parse", "--verify", "--quiet", `${rev}:./${inContext}`], contextDirectory);
  return shown.ok ? shown.stdout.trim() : undefined;
}

/**
 * A head-less document's verdict value and every finding at a blocking
 * severity, for the line that excludes or refuses it. Never a judgement: the
 * words are printed so a reader sees what was excluded (CR-KH-003).
 */
function describeVerdictAndBlocking(record: Record<string, unknown>): string {
  const verdict = typeof record["verdict"] === "string" ? `verdict ${record["verdict"]}` : "no readable verdict";
  const raw = record["findings"];
  if (raw === undefined) {
    return `${verdict} and no findings list`;
  }
  if (!Array.isArray(raw)) {
    return `${verdict} and a findings value that is not a list, so its blocking findings could not be read`;
  }
  const blocking: string[] = [];
  let unreadable = 0;
  for (const entry of raw) {
    const finding = asRecord(entry);
    const severity = finding?.["severity"];
    if (typeof severity !== "string" || !SEVERITY_VOCABULARY.includes(severity)) {
      unreadable += 1;
      continue;
    }
    if (BLOCKING_SEVERITIES.includes(severity)) {
      const id = typeof finding?.["id"] === "string" ? (finding["id"] as string) : "(no id)";
      blocking.push(`${id} (${severity})`);
    }
  }
  const named =
    blocking.length === 0
      ? `no finding at ${BLOCKING_SEVERITIES.join(", ")}`
      : `blocking finding(s) ${blocking.join(", ")}`;
  return `${verdict}, ${named}${unreadable > 0 ? `, and ${String(unreadable)} finding(s) whose severity could not be read` : ""}`;
}

/** The line a derived check prints for each head-less sibling it excluded. */
function headlessSiblingReport(checkId: string, sibling: HeadlessSibling, phase: string, headKey: string): string {
  const ground =
    sibling.ground.kind === "at-base"
      ? `is unchanged since the merge base ${sibling.ground.mergeBase}, so it is history (DR-0054)`
      : "is excluded as history (DR-0054) on its SHAPE ALONE: provenance was NOT checked, because no base was given (the merge gates' --base), so whether the change under audit wrote it is unknown";
  return `REPORT ${checkId} ${sibling.path} declares no head and ${ground}: excluded by name from the group for phase ${phase} at head ${headKey}, never counted toward it and never refusing it; it reads ${describeVerdictAndBlocking(sibling.record)}`;
}

/**
 * Select the verdicts for one `(phase, head)` out of a directory's committed set.
 *
 * WHY A SIBLING WITH NO USABLE HEAD BECOMES A VIOLATION RATHER THAN BEING
 * SKIPPED, which is the whole reason this is a function and not a `filter`.
 * Dropping such a sibling silently SHRINKS the group, and a shrinking group is
 * exactly the fail-open shape this file has already been bitten by twice, at
 * `loadCommittedVerdicts` and at the `phase` canonicalisation. With three
 * verdicts, two of them sharing a model family, giving the third an unreadable
 * head would leave a compared pair of two and a green run. So every same-phase
 * sibling that cannot be keyed is REPORTED as a violation and the remaining
 * members are still compared: a reader is owed both facts.
 *
 * KERNEL 0.2.1 (DR-0054), AND THE SPLIT IS THE ONE `partitionByAuditedHead`
 * MAKES. A sibling that declares NO head key is history, written before
 * M4-P10 asked for one, and it is not evidence about any head in either
 * direction: it cannot be counted toward the group and it cannot refuse it.
 * Refusing it made a phase whose old reviews predate the field unreviewable
 * for ever without editing history, which is measured against pulse's paused
 * M3-P3. So it is EXCLUDED BY NAME (`headless`, printed by every caller) and
 * the fail-open worry above is answered by PROVENANCE, not by shape (fix
 * round 2, CR-KH-003 and CR-007). Shape alone cannot tell history from a
 * current review that omitted the field: a document written today with no
 * `head` would get history's exemption, and two clean reviews plus a fresh
 * head-less refusal carrying a high finding read green. So with a base, a
 * head-less sibling is history ONLY when the same bytes exist at the merge
 * base; one the change under audit ADDS or CHANGES is refused, naming its
 * verdict and blocking findings. With no base the exclusion stays, on shape
 * alone, and every excluded line says provenance was not checked and names
 * the verdict and blocking findings. RESIDUAL, stated rather than hidden: a
 * head-less blocker already on the base is still history. A sibling whose head
 * is PRESENT and unusable tried to name a head and named it wrongly, so it
 * keeps the refusal. Both readers use `declaresNoHead` for the shape test.
 */
function headGroupFor(
  verdicts: readonly LoadedVerdict[],
  phaseKey: string,
  headKey: string,
  contextDirectory: string,
  provenance: HistoryProvenance,
): HeadGroup {
  const members: LoadedVerdict[] = [];
  const unkeyed: Diagnostic[] = [];
  const headless: HeadlessSibling[] = [];
  for (const candidate of verdicts) {
    /* BOTH SIDES CANONICAL. `phaseKey` is already canonical; the sibling's is
       read through the same function so the two are compared in one form
       rather than one canonical value against one raw one.

       AND THE TWO ARMS ARE SPLIT, WHICH THE FIRST ROUND LEFT JOINED. `phase` is
       half of the join key, so a sibling whose phase cannot be ESTABLISHED is
       unkeyable for exactly the reason a sibling with no usable head is, and
       the paragraph above says what that costs. It was folded into one `||`
       with the determinate case, so a verdict declaring no phase fell out
       silently while one declaring a DIFFERENT phase fell out correctly.
       Measured at the reviewed head through the shipped CLI: a refusing third
       review with its `phase:` line deleted left both merge checks printing
       their affirmative REPORT lines over the remaining two. */
    const phaseReading = establishField(candidate.record, "phase");
    if (phaseReading.kind !== "established") {
      unkeyed.push({
        pointer: "#/phase",
        message: `${candidate.path} ${unestablishedReason(phaseReading, "phase") as string}, so it cannot be placed in or out of the group for phase ${phaseKey}, and a sibling that cannot be keyed must not shrink the set the delegated grant is read off`,
      });
      continue;
    }
    if (phaseReading.value !== phaseKey) {
      continue;
    }
    if (declaresNoHead(candidate.record)) {
      if (provenance.kind === "unchecked") {
        headless.push({ path: candidate.path, record: candidate.record, ground: { kind: "unchecked" } });
        continue;
      }
      if (provenance.kind === "error") {
        unkeyed.push({
          pointer: "#/head",
          message: `${candidate.path} declares no head and ${provenance.reason}, so it can neither be excluded as history nor be allowed to shrink the group for phase ${phaseKey}; it reads ${describeVerdictAndBlocking(candidate.record)}`,
        });
        continue;
      }
      const atHead = blobAt(contextDirectory, provenance.refSha, candidate.path);
      const atBase = blobAt(contextDirectory, provenance.mergeBase, candidate.path);
      if (atHead !== undefined && atBase === atHead) {
        headless.push({
          path: candidate.path,
          record: candidate.record,
          ground: { kind: "at-base", mergeBase: provenance.mergeBase },
        });
        continue;
      }
      unkeyed.push({
        pointer: "#/head",
        message: `${candidate.path} declares no head, and the change under audit ${atBase === undefined ? "ADDS" : "CHANGES"} it (merge base ${provenance.mergeBase}), so it is current work and not history: DR-0054 exempts only a document that predates the change. It reads ${describeVerdictAndBlocking(candidate.record)}. Add the full forty-character head it reviewed, or remove it from ${REVIEW_DIRECTORY}`,
      });
      continue;
    }
    const key = headKeyOf(candidate.record, candidate.path);
    if (!key.ok) {
      unkeyed.push({ pointer: "#/head", message: key.message });
      continue;
    }
    if (key.value === headKey) {
      members.push(candidate);
    }
  }
  return { members, unkeyed, headless };
}

/* ------------------------------------------------------------------ */
/* ANCHORING THE CORPUS TO THE COMMIT UNDER AUDIT (CR-VS-001)           */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM THIS SECTION CLOSES, STATED ONE LEVEL UP FROM THE FINDING:
 * a gate whose verdict is about EVIDENCE THE CALLER SUPPLIED, with no check
 * that the evidence is about the thing being audited.
 *
 * `headGroupFor` above groups by the head THE VERDICT DOCUMENTS THEMSELVES
 * DECLARE. Before this section nothing compared that value to the commit the
 * gate was running against, and nothing established that it named a commit at
 * all. Both arms were reproduced end to end through the shipped script:
 *
 *   ARM A  two decorrelated APPROVE verdicts naming
 *          deadbeefdeadbeefdeadbeefdeadbeefdeadbeef, which
 *          `git cat-file -t` reports as not an object, in a repository whose
 *          HEAD is a real commit          -> GREEN, 2 units, exit 0
 *   ARM B  the same verdicts plus a further commit of work no verdict
 *          mentions                       -> GREEN, exit 0
 *
 * So ONE committed approving pair turned this gate green for that phase at
 * every later head, indefinitely, on evidence about one old commit. That is
 * T-009's own rule ("a gate result is evidence only for the configuration it
 * ran under") failing inside the gate that carries DR-0012's merge grant.
 *
 * THE ASYMMETRY THAT MAKES THE FIX SOUND, and it is the whole of the design.
 * The AUDITED head comes from the CALLER: the gate runner passes `--head` from
 * the pull-request event (the registry entry now declares `parameters: [head]`,
 * the same mechanism `scope` has always used), and with no `--head` it is the
 * commit the context's own `HEAD` resolves to, which is what the checkout put
 * there. The DECLARED head comes from a document an agent under review wrote.
 * One of those two is a fact about the run and the other is a claim in the
 * evidence, and the claim must be measured against the fact rather than
 * replacing it.
 */

/** Resolve one ref to a full commit sha inside a context directory. */
export function resolveCommitIn(
  contextDirectory: string,
  ref: string,
): { ok: true; sha: string } | { ok: false; reason: string } {
  /* `^{commit}` AND NOT A BARE `rev-parse`. A bare `rev-parse` of a forty-hex
     string that is in no object database ECHOES IT BACK and exits 0, so it
     cannot tell a commit from a sha somebody typed. The peel is what makes
     this a question about the object database rather than about the syntax of
     the argument, and it also refuses a tag or a tree that is not a commit.
     `--end-of-options` keeps a ref that begins with `-` from being read as a
     flag. */
  const resolved = gitIn(
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
    contextDirectory,
  );
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  const sha = resolved.stdout.trim();
  if (!FULL_SHA.test(sha)) {
    return {
      ok: false,
      reason: `git rev-parse ${ref}^{commit} in ${contextDirectory} produced ${sha}, which is not a full commit sha`,
    };
  }
  return { ok: true, sha };
}

/* ------------------------------------------------------------------ */
/* ANCESTRY, BECAUSE A VERDICT CANNOT NAME THE COMMIT THAT CARRIES IT   */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM THIS SECTION CLOSES, and it is the anchor above written one
 * relation too narrow: AN ANCHOR EXPRESSED AS EQUALITY WHERE THE RELATION THAT
 * CAN ACTUALLY HOLD IS ANCESTRY PLUS A CONSTRAINT ON WHAT CHANGED IN BETWEEN.
 *
 * `partitionByAuditedHead` compared the declared head to the audited one with
 * `===`, and no real flow can satisfy that. A reviewer reads commit X and
 * writes a verdict naming X; COMMITTING that verdict produces X+1; CI audits
 * X+1, or a merge commit above it. The declared head is therefore ALWAYS a
 * strict ancestor of the audited one, so under equality every real run reported
 * not-applicable. Measured on the branch that introduced the anchor, at
 * 5867a918cda809f7c5d4bc366fc7940458c140c0: the verdicts declared that commit,
 * the gate audited its DIRECT CHILD 0ddd06a73d49c1910449d01303bc9c2579f5f492,
 * and the record read not-applicable, exit 21, "is a review of other work and
 * is not evidence about this head".
 *
 * That is the same cannot-do-its-job shape one status along from the defect the
 * anchor fixed: "green forever once fed" became "never green", and a gate that
 * cannot go green is as uninformative as one that cannot go red (T-008's own
 * rule, applied to the other pole).
 *
 * WHAT MAKES THE RELAXATION SAFE, AND IT IS THE WHOLE DESIGN. Ancestry ALONE
 * would restore the original defect wearing a different hat: an approving pair
 * lands, and every later descendant carries it, including descendants full of
 * unreviewed source. So ancestry is admitted only when the TREES agree
 * everywhere except the project's own paperwork root. A verdict is evidence
 * about the SHIPPED CONTENT it read, and if that content is byte-identical in
 * the audited commit then the audited commit is the thing the reviewer
 * approved, whatever paperwork was committed on top of it.
 *
 * IT IS A CLAIM ABOUT THE TWO TREES, NOT ABOUT EACH INTERVENING COMMIT, and
 * the difference is stated rather than left to be discovered. `git diff
 * --name-only <declared>..<audited>` compares the endpoints, so a commit that
 * adds `src/x.ts` and a later one that removes it leave no entry and are
 * admitted, where a per-commit enumeration would refuse them. That case is
 * admitted DELIBERATELY: the audited tree's shipped content is then exactly
 * what the reviewers read, which is the property the gate is protecting. A
 * per-commit walk would refuse an ordinary revert-before-merge and buy nothing,
 * because there is no shipped byte in the audited tree that no verdict covers.
 *
 * `--no-renames` IS LOAD-BEARING. With rename detection on (git's default for
 * `git diff` since 2.9) a rename from `src/a.ts` to `delivery/b.md` prints the
 * DESTINATION ONLY, so the deletion of a source file would be invisible and the
 * gap would read as paperwork. Disabling it prints both sides.
 */

/** How a verdict's declared head stands to the commit under audit. */
export type HeadRelation =
  /** The verdict names the audited commit itself. */
  | { kind: "same" }
  /** A strict ancestor whose gap to the audited commit is paperwork only. */
  | { kind: "evidence-only-ancestor"; changed: string[] }
  /** A strict ancestor, but shipped content changed in between. */
  | { kind: "shipped-change"; shipped: string[] }
  /** A real commit here that the audited commit is an ancestor OF. */
  | { kind: "descendant" }
  /** A real commit here on neither side of the audited one. */
  | { kind: "unrelated" }
  /** Forty hex digits naming no commit in this repository. */
  | { kind: "unresolvable"; reason: string }
  /** git could not answer, so the relation is not known. Never admitted. */
  | { kind: "undetermined"; reason: string }
  /**
   * An admitting relation, refused because the merge base of the review
   * budget already CONTAINS the declared head (it is that commit or an
   * ancestor of it), so the review covered content that is on the base, not
   * the change under audit. M6-P2 fix round 1, CR-M6P2A-01 and CR-M6P2B-01.
   */
  | { kind: "on-the-base"; mergeBase: string }
  /**
   * The verdict carries no `head` key at all. KERNEL 0.2.1 (DR-0053): the
   * schema no longer requires the field, because it judged every verdict a
   * consumer wrote before the field existed, so absence is now a well-formed
   * document and the ADMISSION rule lives here. Never admitted.
   */
  | { kind: "no-head" };

/**
 * Does this verdict declare no head AT ALL?
 *
 * KERNEL 0.2.1 (DR-0053, DR-0054). ABSENCE ONLY, and the narrowness is the
 * point. A document with no `head` key is the shape every verdict written
 * before M4-P10 has, so it is HISTORY: it is excluded from every merge corpus
 * by name and is never admitted. SHAPE IS NOT PROVENANCE (fix round 2): this
 * function says only that the key is absent; whether an absent-head sibling is
 * HISTORY is decided in `headGroupFor` from the merge base, because a current
 * review can omit the field too. A document whose `head` is PRESENT and unusable (null, empty, an
 * abbreviation, a list) is a document that tried to state its head and stated
 * it wrongly, which the schema still refuses for a current document, so it
 * keeps the M4-P10 treatment in `partitionByAuditedHead` and `headGroupFor`:
 * kept, refused, red. Both readers call this function for the absent case.
 */
export function declaresNoHead(record: Record<string, unknown> | undefined): boolean {
  return record === undefined || !("head" in record);
}

/**
 * Ask git whether `candidate` is an ancestor of `descendant`.
 *
 * `merge-base --is-ancestor` ANSWERS WITH AN EXIT CODE, and 1 is an ANSWER
 * while anything else is a FAILURE. `gitIn` folds every nonzero status into
 * `ok: false`, which would make "no" indistinguishable from "git could not
 * run", and that collapse is the fail-open direction here: an unanswerable
 * question read as "not an ancestor" is merely noisy, but read as "ancestor"
 * it would admit anything. Three outcomes, never two.
 */
function isAncestorIn(
  contextDirectory: string,
  candidate: string,
  descendant: string,
): { kind: "yes" } | { kind: "no" } | { kind: "undetermined"; reason: string } {
  const run = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", "--end-of-options", candidate, descendant],
    { cwd: contextDirectory, encoding: "utf8" },
  );
  if (run.error !== undefined) {
    return {
      kind: "undetermined",
      reason: `git merge-base --is-ancestor ${candidate} ${descendant} could not be run: ${String(run.error)}`,
    };
  }
  if (run.status === 0) {
    return { kind: "yes" };
  }
  if (run.status === 1) {
    return { kind: "no" };
  }
  return {
    kind: "undetermined",
    reason:
      `git merge-base --is-ancestor ${candidate} ${descendant} exited ${String(run.status)}: ` +
      `${(run.stderr ?? "").replace(/\s+/g, " ").trim()}`,
  };
}

/**
 * The paperwork prefix a changed path must carry to count as evidence, spelled
 * for THIS context directory rather than for the repository root.
 *
 * `git diff --name-only` prints paths relative to the REPOSITORY ROOT, and the
 * context directory need not be that root. Reading `delivery/` out of a nested
 * context would then classify the repository root's `delivery/` as this
 * project's paperwork and a nested `sub/delivery/` as shipped content, which is
 * backwards. `rev-parse --show-prefix` gives the offset, so the comparison is
 * made in the repository's own spelling. The diff is deliberately NOT narrowed
 * to the context directory: a change outside it is still unreviewed content in
 * the audited commit, and narrowing would hide it.
 */
function evidencePrefixIn(
  contextDirectory: string,
): { ok: true; prefix: string } | { ok: false; reason: string } {
  const shown = gitIn(["rev-parse", "--show-prefix"], contextDirectory);
  if (!shown.ok) {
    return { ok: false, reason: shown.reason };
  }
  return { ok: true, prefix: `${shown.stdout.trim()}${PAPERWORK_ROOT}/` };
}

/**
 * Place one declared head against the commit under audit.
 *
 * EQUAL PASSES, unchanged, and it is checked first so a context git cannot be
 * questioned about still answers the one relation that needs no git at all.
 *
 * A DESCENDANT IS REFUSED, and it has its own sentence rather than being folded
 * into "not an ancestor". A verdict naming a commit BELOW the audited one is a
 * review of work the audited commit does not contain, which is the fail-open
 * direction stated backwards: the reviewers saw more than is being merged, and
 * nothing here establishes that what they approved about the extra work says
 * anything about the tree without it.
 */
export function relateDeclaredHead(
  contextDirectory: string,
  declared: string,
  auditedHead: string,
): HeadRelation {
  if (declared === auditedHead) {
    return { kind: "same" };
  }
  const resolved = resolveCommitIn(contextDirectory, declared);
  if (!resolved.ok) {
    return { kind: "unresolvable", reason: resolved.reason };
  }
  const ancestor = isAncestorIn(contextDirectory, declared, auditedHead);
  if (ancestor.kind === "undetermined") {
    return { kind: "undetermined", reason: ancestor.reason };
  }
  if (ancestor.kind === "no") {
    const other = isAncestorIn(contextDirectory, auditedHead, declared);
    if (other.kind === "undetermined") {
      return { kind: "undetermined", reason: other.reason };
    }
    return other.kind === "yes" ? { kind: "descendant" } : { kind: "unrelated" };
  }
  const prefix = evidencePrefixIn(contextDirectory);
  if (!prefix.ok) {
    return { kind: "undetermined", reason: prefix.reason };
  }
  /* `-z` IS LOAD-BEARING FOR THE SAME REASON `--no-renames` IS, and it was
     measured rather than reasoned. Without it git QUOTES any path outside the
     printable ASCII set, so a paperwork file whose name carries one non-ASCII
     character arrives wrapped in double quotes with octal escapes, which does
     not start with `delivery/` and is classified as shipped content. Measured
     on git 2.43.0, one repository, one commit, one flag changed: the default
     form printed the quoted spelling and the `-z` form printed the real path.

     The failure that would cause is fail-CLOSED, so it admits nothing it should
     not; it is fixed anyway because refusing a green a project is entitled to is
     the cannot-go-green shape this whole section exists to end, one filename
     narrower. `-z` also makes the separator NUL rather than newline, which is
     why the split changed with it: a newline split over `-z` output would read
     the whole list as one path. */
  const diff = gitIn(
    ["diff", "-z", "--no-renames", "--name-only", `${declared}..${auditedHead}`, "--"],
    contextDirectory,
  );
  if (!diff.ok) {
    return { kind: "undetermined", reason: diff.reason };
  }
  const changed = diff.stdout.split("\0").map((line) => line.trim()).filter((line) => line !== "");
  const shipped = changed.filter((path) => !path.startsWith(prefix.prefix));
  return shipped.length === 0
    ? { kind: "evidence-only-ancestor", changed }
    : { kind: "shipped-change", shipped };
}

/**
 * Bound an ADMITTING relation at the merge base of the review budget (M6-P2
 * fix round 1, CR-M6P2A-01 and CR-M6P2B-01).
 *
 * THE MECHANISM IT CLOSES: admission is by ancestry, and ancestry alone has no
 * lower bound. A previous phase's approving verdicts sit on the base, their
 * declared head is an ancestor of every later commit, and a later change whose
 * whole diff is paperwork is then "reviewed" by them: the gap from their head
 * to the commit under audit is paperwork only, so `relateDeclaredHead` admits
 * them. A review whose declared head the merge base already contains reviewed
 * content that is on the base, so it says nothing about the change being
 * merged, whatever tier that change is.
 *
 * A relation that does not admit is returned unchanged. An `undefined` merge
 * base (no `--base`, so no budget) returns the relation unchanged too, which is
 * the pre-M6-P2 reading and is stated, not hidden. An ancestry question git
 * does not answer is `undetermined`, and that is not an admitting relation.
 *
 * NO PHASE MATCH IS MADE HERE, deliberately: a verdict of another phase whose
 * head is NOT on the base is still admitted by ancestry. M6-P5 moves review
 * identity to kernel records that carry the phase.
 */
export function boundAtMergeBase(
  contextDirectory: string,
  declared: string,
  mergeBase: string | undefined,
  relation: HeadRelation,
): HeadRelation {
  if (mergeBase === undefined) {
    return relation;
  }
  if (relation.kind !== "same" && relation.kind !== "evidence-only-ancestor") {
    return relation;
  }
  if (declared === mergeBase) {
    return { kind: "on-the-base", mergeBase };
  }
  const contained = isAncestorIn(contextDirectory, declared, mergeBase);
  if (contained.kind === "undetermined") {
    return { kind: "undetermined", reason: contained.reason };
  }
  return contained.kind === "yes" ? { kind: "on-the-base", mergeBase } : relation;
}

/** One verdict that is not about the audited commit, and why it is not. */
export interface OffHeadVerdict {
  path: string;
  declared: string;
  /** Which route refused it. Printed, never summarised to a boolean. */
  relation: HeadRelation;
}

/** How many shipped paths to name before the sentence stops being readable. */
const NAMED_SHIPPED_PATHS = 5;

/** One operator-facing line per verdict the audit excluded, naming its route. */
export function describeOffHeadVerdicts(
  offHead: readonly OffHeadVerdict[],
  auditedHead: string,
): string[] {
  return [...offHead]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((entry) => {
      const tail = `it is not evidence about the commit under audit ${auditedHead}`;
      if (entry.relation.kind === "no-head") {
        return (
          `${entry.path} declares no head, so it does not say which commit it reviewed and is never admitted ` +
          `toward a merge, and ${tail}; whether it is history (DR-0054) or current work is decided by the ` +
          `merge checks from its provenance, and one the change under audit adds or edits is refused there`
        );
      }
      const head = `${entry.path} declares head ${entry.declared}, which`;
      if (entry.relation.kind === "unresolvable") {
        return `${head} does not resolve to a commit in this repository at all, so it is evidence about an object nobody can produce and ${tail}`;
      }
      if (entry.relation.kind === "shipped-change") {
        const shipped = entry.relation.shipped;
        const named = shipped.slice(0, NAMED_SHIPPED_PATHS).join(", ");
        const more =
          shipped.length > NAMED_SHIPPED_PATHS
            ? ` and ${String(shipped.length - NAMED_SHIPPED_PATHS)} more`
            : "";
        return (
          `${head} is an ancestor of the commit under audit ${auditedHead}, but ${String(shipped.length)} path(s) ` +
          `outside ${PAPERWORK_ROOT}/ differ between them (${named}${more}), so shipped work no verdict reviewed ` +
          `is riding in on a review of something else and ${tail}`
        );
      }
      if (entry.relation.kind === "on-the-base") {
        return (
          `${head} the merge base ${entry.relation.mergeBase} of the review budget already contains, so the ` +
          `review covered content that is on the base rather than the change being merged and ${tail}`
        );
      }
      if (entry.relation.kind === "descendant") {
        return `${head} is a DESCENDANT of the commit under audit ${auditedHead}, so the reviewers read a tree this commit does not contain and ${tail}`;
      }
      if (entry.relation.kind === "undetermined") {
        return `${head} could not be placed relative to the commit under audit ${auditedHead}, so whether it reviews this work is unknown and ${tail}: ${entry.relation.reason}`;
      }
      return `${head} is a commit in this repository and is neither the commit under audit ${auditedHead} nor an ancestor of it, so it is a review of other work and ${tail}`;
    });
}

/* ------------------------------------------------------------------ */
/* The merge regime, read once and shared by both merge-precondition checks */
/* ------------------------------------------------------------------ */

/**
 * What reading the declared merge regime produced.
 *
 * THREE OUTCOMES, NOT TWO, AND THAT IS THE WHOLE REASON THIS EXISTS AS A TYPE.
 * "The regime is not a delegated grant" and "the regime could not be
 * established" are different facts with different consequences: the first is a
 * REPORT, because there is genuinely no precondition to satisfy, and the second
 * is a VIOLATION, because a merge check that cannot determine the regime must
 * never report that nothing was required (SC-011).
 */
type RegimeOutcome =
  | { kind: "delegated" }
  | { kind: "report"; lines: string[] }
  | { kind: "violation"; pointer: string; message: string };

/**
 * Read the declared delivery mode's merge authority out of a context directory.
 *
 * LIFTED OUT OF `dual-review-decorrelation` BY M4-P10, AND THE LIFT IS THE
 * POINT RATHER THAN A TIDY-UP. M4-P10 adds a SECOND check that applies exactly
 * where DR-0012's delegated grant applies (`verdict-pair-approves`, condition
 * 2). Copying the regime reading into it would have produced two readers of one
 * fact, which is the shape this repository's fix-round contract calls fixing the
 * INSTANCE rather than the MECHANISM: a later correction to one reader would
 * leave the other fail-open, and the three sites already repaired inside this
 * block (recorded in the comments below) are the evidence that such corrections
 * happen.
 *
 * Every message below is the one `dual-review-decorrelation` shipped, except
 * that the two REPORT lines now name the CALLING check and M6-P5, deleting that
 * check, reworded "decorrelation" to the pair rule that is left. That is
 * deliberate: a reader who sees `REPORT verdict-pair-approves ... declares no
 * delivery mode` must be able to tell which guard declined to run.
 */
function establishDelegatedRegime(
  checkId: string,
  contextDirectory: string,
  phase: string,
  source: VerdictCorpusSource,
): RegimeOutcome {
  const charterPresent = contextDocumentPresentAt(contextDirectory, CHARTER_DOCUMENT, source);
  if (!charterPresent) {
    /* THE SENTENCE NAMES THE SOURCE, AND THE CLAIM ABOUT THE MERGE GATE NAMES
       THE READER BOTH SIDES SHARE (FIX ROUND 2, DV-001). Fix round 1 moved
       this PRESENCE probe to the commit and left the merge gate's refusal on
       disk, so a `charter.yaml` written into a working tree and committed
       nowhere passed the gate's refusal, reached this arm, and was reported as
       "no charter.yaml" while the file sat in the directory the same line
       names. The gate now refuses through `missingRegimeDocument` below,
       which is this same probe, so the second half of this sentence is a
       property of one shared function rather than a claim about another
       program that has to be maintained by hand. */
    return {
      kind: "report",
      lines: [
        `REPORT ${checkId} ${contextDirectory} declares no delivery mode ` +
          `(no ${CHARTER_DOCUMENT} ${describeContextDocumentSource(source)}), so the verdicts for phase ` +
          `${phase} were NOT evaluated against a merge-authority regime; the merge gate ` +
          `merge-preconditions refuses such a directory outright, through the same presence ` +
          `reader and therefore against the same source`,
      ],
    };
  }
  const charter = readContextDocumentAt(contextDirectory, CHARTER_DOCUMENT, source);
  if (!charter.ok) {
    return {
      kind: "violation",
      pointer: "#/verdict",
      message: `the charter is present and could not be read, so the declared mode's merge-authority is unknown and the pair rule could not be evaluated: ${charter.reason}`,
    };
  }
  /* SITE TWO OF THE SAME MECHANISM. `asRecord(charter.value)?.["delivery-mode"]`
     used to flow into `String(modeId)` and into an `===` against every mode's
     id, so a charter declaring NO delivery mode reddened with the sentence
     "declares delivery mode undefined, which ... does not define". The verdict
     was right by luck and the sentence was false: the charter declares no mode
     rather than one called "undefined". Establishing it first gives absence its
     own sentence, and gives the `===` below a non-empty string, which is also
     what stops an id-less mode row (`eachMode` defaults a missing id to "")
     from matching a charter whose delivery-mode is the empty string. */
  const modeReading = establishField(asRecord(charter.value), "delivery-mode");
  if (modeReading.kind !== "established") {
    return {
      kind: "violation",
      pointer: "#/verdict",
      message: `${charter.path} ${unestablishedReason(modeReading, "delivery-mode") as string}, so no mode's merge-authority can be looked up and whether the delegated grant applies to phase ${phase} could not be established`,
    };
  }
  const modeId = modeReading.value;
  const modesDocument = readContextDocumentAt(contextDirectory, MODES_DOCUMENT, source);
  if (!modesDocument.ok) {
    return {
      kind: "violation",
      pointer: "#/verdict",
      message: `${charter.path} declares delivery mode ${String(modeId)} and ${MODES_DOCUMENT} could not be read, so that mode's merge-authority is unknown and the pair rule could not be evaluated: ${modesDocument.reason}`,
    };
  }
  /* BOTH SIDES CANONICAL, and the direction here is worth stating because it
     is the one place in this function where collapsing makes a lookup SUCCEED
     more often rather than fail. `eachMode` builds `row.id` with its own
     `String(... ?? "")` and is shared with six other consumers, so it is left
     alone and its output is canonicalised at THIS use site. Finding the mode
     a charter actually names is the correct reading; the security-relevant
     comparison is the `merge-authority` one below, and THAT one is fail-closed
     under collapsing, because more values matching the delegated constant
     means the pair requirement applies more often, never less. */
  const mode = eachMode(modesDocument.value).find((row) => {
    const reading = canonicalScalar(row.id);
    return reading.ok && reading.value === modeId;
  });
  if (mode === undefined) {
    return {
      kind: "violation",
      pointer: "#/verdict",
      message: `${charter.path} declares delivery mode ${String(modeId)}, which ${modesDocument.path} does not define, so its merge-authority is unknown`,
    };
  }
  /* SITE THREE, AND IT IS THE WORST OF THE FOUR BECAUSE IT DISABLES THE WHOLE
     CHECK RATHER THAN ONE DIMENSION. `String(mode.mode["merge-authority"] ?? "")`
     made a mode that declares NO merge-authority indistinguishable from one
     declaring some other authority, and the not-a-delegated-grant arm below is
     a REPORT rather than a violation. Measured on the shipped script before
     this repair (probe P1 in delivery/work-history/m3-p9.md): a pair sharing
     one model family, under a mode with its `merge-authority` line deleted,
     exited 0 GREEN printing "mode full declares merge-authority , which is not
     a delegated grant". That sentence is false and the exit code authorises
     the merge the check exists to refuse. The reviewer did not find this one;
     the derivation did. */
  const authorityReading = establishField(mode.mode, "merge-authority");
  if (authorityReading.kind !== "established") {
    return {
      kind: "violation",
      pointer: "#/verdict",
      message: `${modesDocument.path} ${unestablishedReason(authorityReading, "merge-authority") as string} for mode ${modeId}, so whether the delegated grant applies to phase ${phase} could not be established, and a merge check that cannot determine the regime must not report that no approving pair is required`,
    };
  }
  const authority = authorityReading.value;
  if (authority !== DELEGATED_MERGE_AUTHORITY) {
    return {
      kind: "report",
      lines: [
        `REPORT ${checkId} mode ${String(modeId)} declares merge-authority ${authority}, ` +
          `which is not a delegated grant, so no approving pair is required of the reviews of phase ${phase}`,
      ],
    };
  }

  return { kind: "delegated" };
}

/* ------------------------------------------------------------------ */
/* review-families: DR-0038's declared single-family exception (M4-P11) */
/* ------------------------------------------------------------------ */

/** The charter field DR-0038's declaration lives in (M4-D-28). */
export const REVIEW_FAMILIES_FIELD = "review-families";

/** The document that carries it. */
export const CHARTER_DOCUMENT = "charter.yaml";

/**
 * The documents that say WHICH merge-authority regime is in force.
 *
 * MOVED HERE FROM `scripts/check-dual-review.mjs` (FIX ROUND 2, DV-001). The
 * script held its own copy of this list AND its own presence probe, and the
 * probe read the WORKING TREE while `establishDelegatedRegime` read the
 * COMMIT. Two probes of one fact against two sources is the mechanism this
 * phase has now paid for twice: each answered correctly about its own source,
 * so nothing ever reported a disagreement, and an uncommitted `charter.yaml`
 * took the gate from error to GREEN on a correlated committed pair.
 */
export const REGIME_DOCUMENTS = [CHARTER_DOCUMENT, MODES_DOCUMENT];

/**
 * The first regime document that is NOT present at the source a decision over
 * this context would be made from, or `undefined` when both are.
 *
 * WHY THE REFUSAL LIVES AT THE MERGE GATE AND THE REPORT LIVES IN THE CHECK,
 * unchanged from M3-P9 and restated because this round moved the probe: the
 * derived check runs on ANY verdict with ANY context, and M3-P7's verdict
 * contexts carry a plan and a work history and no charter, so a check that
 * reddened on an absent charter reddened eight of that phase's tests. The
 * check therefore REPORTS, and the merge gate, which is the command DR-0012's
 * grant runs through, refuses. What changed is that the
 * refusal and the report are now ONE probe with two callers, so they cannot
 * answer about different sources.
 *
 * THE SOURCE IS A PARAMETER, not resolved here, so a caller that has already
 * resolved one (the merge gate resolves it when it loads the corpus) refuses
 * against the SAME commit it read the verdicts from rather than a second
 * `rev-parse` that could land elsewhere.
 */
export function missingRegimeDocument(
  contextDirectory: string,
  source: VerdictCorpusSource = resolveCorpusSource(contextDirectory),
): { document: string; source: VerdictCorpusSource; reason: string } | undefined {
  for (const document of REGIME_DOCUMENTS) {
    if (!contextDocumentPresentAt(contextDirectory, document, source)) {
      return {
        document,
        source,
        reason:
          `${join(contextDirectory, document)} does not exist ${describeContextDocumentSource(source)}, so ` +
          `the declared mode's merge-authority is unknown and no merge verdict can be reached; a ` +
          `merge check that cannot determine the regime reports error, never green`,
      };
    }
  }
  return undefined;
}

/**
 * Where a declaration was read from, so a claim nobody can refute is at least
 * ATTRIBUTABLE AND DATED.
 *
 * This is the honest half of DR-0038's third constraint. Two falsifiers below
 * catch a project whose own record contradicts the declaration. NEITHER of
 * them catches a project that HAS a second family available and has simply
 * never used it, and nothing inside the record can: the record holds what was
 * used, not what was reachable. So the countermeasure for that residue is
 * provenance rather than detection, on the src/gates/release.ts:1028 pattern,
 * and the gap is stated here rather than left to be found.
 */
export interface ReviewFamiliesProvenance {
  /** The path inside the commit, as `git show` was asked for it. */
  path: string;
  /** The ref the declaration was read from, as the caller spelled it. */
  ref: string;
  /** That ref resolved to a commit sha. */
  refSha: string;
  /** sha256 of the exact blob bytes the declaration was decoded from. */
  sha256: string;
}

/**
 * What reading `review-families` produced.
 *
 * THREE OUTCOMES AND NOT TWO, for the reason `RegimeOutcome` gives one screen
 * up: "no declaration" and "a declaration that could not be established" are
 * different facts. The first leaves DR-0012 condition 1 applying unchanged,
 * which is a REPORT-nothing. The second is an ERROR, because a check that
 * cannot establish whether an exception applies must never decide that it does
 * not apply and carry on (M2-C-3).
 */
export type ReviewFamiliesReading =
  | { kind: "absent" }
  | { kind: "error"; reason: string }
  | {
      kind: "declared";
      /** Canonicalised, deduplicated by construction, sorted. Compared. */
      families: string[];
      /** The operator's own spelling, in document order. Printed. */
      declaredAs: string[];
      reason: string;
      provenance: ReviewFamiliesProvenance;
    };

function gitIn(
  args: string[],
  cwd: string,
): { ok: true; stdout: string } | { ok: false; reason: string } {
  /* The buffer is raised because a charter is an operator document with no
     declared size bound, and a truncated read would decode as a DIFFERENT
     document rather than as a failure. */
  const run = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.error !== undefined) {
    return { ok: false, reason: `git ${args.join(" ")} could not be run: ${String(run.error)}` };
  }
  if (run.status !== 0) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} exited ${String(run.status)}: ${(run.stderr ?? "").replace(/\s+/g, " ").trim()}`,
    };
  }
  return { ok: true, stdout: run.stdout ?? "" };
}

/**
 * Is a `review-families` key present in the WORKING TREE's charter?
 *
 * Asked for exactly one purpose: to tell "this project makes no declaration"
 * apart from "this project makes a declaration that is not committed". The
 * first is absence and changes nothing. The second is an ERROR, because the
 * whole value of the exception over a silent one is that a reader can check
 * it, and an uncommitted claim is one nothing can be checked against.
 */
function treeDeclaresReviewFamilies(contextDirectory: string): boolean {
  const tree = readContextDocument(contextDirectory, CHARTER_DOCUMENT);
  if (!tree.ok) {
    return false;
  }
  const record = asRecord(tree.value);
  return record !== undefined && REVIEW_FAMILIES_FIELD in record;
}

/**
 * Read DR-0038's declaration OUT OF THE GIT OBJECT DATABASE, never out of the
 * working tree.
 *
 * WHY THE COMMITTED BLOB IS THE ONLY ONE THAT COUNTS. This is the anti-widening
 * rule the scope auditor and `loadDeclaration` (src/gates/release.ts:817) both
 * already apply, one condition along: a phase must not be able to switch off,
 * inside its own working tree, the condition that would otherwise have refused
 * its merge. A declaration read from disk is one an implementer can add,
 * merge under, and delete, leaving a merged head whose record says the
 * cross-family requirement was met.
 *
 * `HEAD:./charter.yaml` AND NOT `HEAD:charter.yaml`, and the difference is not
 * cosmetic. A path without the leading `./` is resolved against the repository
 * ROOT, so a context directory that happens to sit inside a larger repository
 * (which every fixture staged under a checkout does) would silently read that
 * repository's charter instead of its own. With `./` git resolves relative to
 * the directory it was run in, which is the one the caller named.
 */
export function readReviewFamilies(
  contextDirectory: string,
  ref = "HEAD",
): ReviewFamiliesReading {
  const resolved = gitIn(["rev-parse", `${ref}^{commit}`], contextDirectory);
  const relativePath = `./${CHARTER_DOCUMENT}`;
  if (!resolved.ok) {
    if (treeDeclaresReviewFamilies(contextDirectory)) {
      return {
        kind: "error",
        reason:
          `${join(contextDirectory, CHARTER_DOCUMENT)} declares ${REVIEW_FAMILIES_FIELD} in the working tree and ` +
          `${contextDirectory} has no resolvable git ref ${ref}, so the declaration cannot be attributed to a ` +
          `commit; an exception read from an uncommitted file is error, never permission (${resolved.reason})`,
      };
    }
    return { kind: "absent" };
  }
  const refSha = resolved.stdout.trim();
  const shown = gitIn(["show", `${refSha}:${relativePath}`], contextDirectory);
  if (!shown.ok) {
    if (treeDeclaresReviewFamilies(contextDirectory)) {
      return {
        kind: "error",
        reason:
          `${join(contextDirectory, CHARTER_DOCUMENT)} declares ${REVIEW_FAMILIES_FIELD} in the working tree and ` +
          `${refSha}:${relativePath} could not be read, so the declaration is not committed and cannot be ` +
          `attributed; an exception read from an uncommitted file is error, never permission (${shown.reason})`,
      };
    }
    return { kind: "absent" };
  }
  const body = shown.stdout;
  const sha256 = createHash("sha256").update(body).digest("hex");
  const provenance: ReviewFamiliesProvenance = {
    path: CHARTER_DOCUMENT,
    ref,
    refSha,
    sha256,
  };
  const decoded = decodeDocument(body, join(contextDirectory, CHARTER_DOCUMENT));
  if (!decoded.ok) {
    return {
      kind: "error",
      reason: `${refSha}:${relativePath} does not decode, so whether it declares ${REVIEW_FAMILIES_FIELD} could not be established: ${decoded.reason}`,
    };
  }
  const charter = asRecord(decoded.value);
  if (charter === undefined || !(REVIEW_FAMILIES_FIELD in charter)) {
    return { kind: "absent" };
  }
  const declaration = asRecord(charter[REVIEW_FAMILIES_FIELD]);
  if (declaration === undefined) {
    return {
      kind: "error",
      reason: `${refSha}:${relativePath} carries ${REVIEW_FAMILIES_FIELD} and it is not a map, so no declared family set can be read from it`,
    };
  }
  const reasonReading = establishField(declaration, "reason");
  if (reasonReading.kind !== "established") {
    return {
      kind: "error",
      reason:
        `${refSha}:${relativePath} ${unestablishedReason(reasonReading, `${REVIEW_FAMILIES_FIELD}.reason`) as string}; ` +
        `narrowing an owner-reserved merge condition costs a stated reason, so a declaration without one is error`,
    };
  }
  const available = declaration["available"];
  if (!Array.isArray(available) || available.length === 0) {
    return {
      kind: "error",
      reason: `${refSha}:${relativePath} declares ${REVIEW_FAMILIES_FIELD}.available as ${Array.isArray(available) ? "an empty list" : "not a list"}, so no family set can be read from it`,
    };
  }
  const families: string[] = [];
  const declaredAs: string[] = [];
  for (let index = 0; index < available.length; index += 1) {
    const entry = available[index];
    /* Each entry goes through the SAME canonical form every governance
       scalar goes through, so a declared family is compared with the kernel's
       recorded family (src/review.ts) in one form. A declaration
       canonicalised one way and an observation canonicalised another is the
       fix-round-2 mechanism with two documents instead of one. */
    const reading = establishField({ entry }, "entry");
    if (reading.kind !== "established") {
      return {
        kind: "error",
        reason: `${refSha}:${relativePath} ${unestablishedReason(reading, `${REVIEW_FAMILIES_FIELD}.available[${String(index)}]`) as string}, so the declared family set cannot be compared with what the verdicts carry`,
      };
    }
    if (families.includes(reading.value)) {
      /* REFUSED RATHER THAN DEDUPLICATED, and the direction is why. The
         exception applies when exactly ONE family is declared, so collapsing
         `[Anthropic, anthropic]` to one entry would turn a document that reads
         as two families into a single-family declaration. That is the only
         canonicalisation in this file that would be fail-OPEN, so it is a
         refusal instead. */
      return {
        kind: "error",
        reason: `${refSha}:${relativePath} lists ${String(entry)} in ${REVIEW_FAMILIES_FIELD}.available more than once once canonicalised, so how many families it declares cannot be established`,
      };
    }
    families.push(reading.value);
    declaredAs.push(String(entry));
  }
  return {
    kind: "declared",
    families: [...families].sort(),
    declaredAs,
    reason: declaration["reason"] as string,
    provenance,
  };
}

/** One line naming where a declaration came from, for a detail or a report. */
export function reviewFamiliesProvenanceLine(provenance: ReviewFamiliesProvenance): string {
  return (
    `declaration ${provenance.path} read from ${provenance.ref} ` +
    `(${provenance.refSha}), blob sha256 ${provenance.sha256}`
  );
}

/* ------------------------------------------------------------------ */
/* verdict-pair-approves (M4-P10 step 5, DR-0012 condition 2)           */
/* ------------------------------------------------------------------ */

/**
 * The severities DR-0012 condition 2 bars an APPROVE from sitting beside.
 *
 * `low` is absent DELIBERATELY and the record says why:
 * delivery/decisions/DR-0012-delegated-merge-authority.md:23 permits merging
 * with a low finding provided it is fixed or tracked with a reason. The same
 * three words are the escalation enum in `schemas/verdict.schema.json`, and the
 * two must agree; M4-P10 widened both together, because the shipped pair had
 * the schema stopping at `high` while the decision said `medium`.
 */
export const BLOCKING_SEVERITIES: readonly string[] = ["medium", "high", "critical"];

/**
 * The whole severity vocabulary, canonicalised, and the reason it exists BESIDE
 * the blocking list rather than being inferred from it.
 *
 * WITHOUT IT, AN UNRECOGNISED SEVERITY IS SILENTLY NON-BLOCKING. `includes` over
 * the blocking three answers "is this one of the three", and a review ranking a
 * defect `blocker`, `sev1` or `showstopper` gets `false` from that question and
 * sails through. The verdict schema forbids those words, and nothing on this
 * gate's path validates the committed siblings, so the schema is not the guard
 * here. Under a delegated grant an unrecognised severity has not been shown
 * non-blocking, and unshown must be refused; the four words are the ones
 * `schemas/verdict.schema.json` and `schemas/finding.schema.json` share.
 */
const SEVERITY_VOCABULARY: readonly string[] = ["low", "medium", "high", "critical"];

/**
 * The closed verdict vocabulary, exactly as `schemas/verdict.schema.json` spells
 * it, and the one word in it that authorises a merge.
 *
 * WHY THE RAW SPELLING IS CHECKED HERE AND CANONICALISATION IS NOT ENOUGH, which
 * is the opposite of the rule the canonical form above follows and is
 * opposite for a reason that is worth stating rather than looking like an
 * inconsistency. A comparison that REFUSES when two values are the same, so collapsing
 * more spellings onto one value produces MORE refusals and is fail-CLOSED. THIS
 * check APPROVES when a value equals one particular word, so collapsing produces
 * more APPROVALS and is fail-OPEN: a sibling reading `Approve`, which
 * `schemas/verdict.schema.json` forbids and which nothing on this path
 * validates, would canonicalise to `approve` and be read as an authorisation.
 * The direction of the comparison decides the direction of the collapse.
 *
 * So the canonical reading is still used to ESTABLISH that a value is there and
 * is comparable, and the RAW string then has to be one of the two words.
 */
const VERDICT_VOCABULARY: readonly string[] = ["APPROVE", "FIX-ROUND-NEEDED"];
const APPROVING_VERDICT = "APPROVE";

/**
 * DR-0012 CONDITION 2, MADE INTO A PREDICATE
 * (delivery/decisions/DR-0012-delegated-merge-authority.md:23).
 *
 * WHAT WAS MISSING, stated as the gap rather than as a feature. Before this
 * check, `scripts/check-dual-review.mjs` could not see a verdict's VALUE at
 * all: measured against the whole of that script, `grep -c` returned 0 for
 * `APPROVE`, 0 for `severity` and 0 for `findings`. So two properly
 * decorrelated reviews that both REFUSED the merge passed the gate green, and
 * so did an APPROVE sitting beside a finding the review itself ranked medium.
 * Condition 1 looked checked and condition 2 was asserted by a human, which is
 * the worse of the two states because it reads as progress.
 *
 * WHY IT WAS A SEPARATE CHECK FROM `dual-review-decorrelation`, which M6-P5
 * deleted (DR-0062): they were different predicates over the same set, and
 * section 2.3 rule 3's Kind B falsification is per-check, so DEREGISTERING
 * this one must make a refusing pair pass.
 *
 * WHY IT EVALUATES THE COMMITTED GROUP AND NEVER THE INSTANCE'S OWN FIELDS,
 * which is the one place its shape differs from its sibling's. DR-0012
 * condition 2 is a property of the two reviews WRITTEN TO `delivery/review/`
 * AND COMMITTED. A document handed to this check that is not among them is not
 * a review the grant can be satisfied by, and it also cannot break the
 * predicate: what is asserted is about the committed set, which the stray
 * document is not a member of. So there is no membership test here, and the
 * empty case is not a hole: a `(phase, head)` selecting fewer than two
 * committed verdicts is refused by the pair-size rule below.
 *
 * WHAT IT DOES NOT REACH, named rather than left to be found. "Unresolved" is
 * a state of the review THREAD, and this check reads documents: a finding that
 * was raised, fixed in a later round and left in the file still reddens here.
 * That is the fail-closed direction and it is a real cost, paid deliberately,
 * because the alternative is a resolution field an author sets on their own
 * finding. Nothing here decides whether a `severity` was ranked honestly
 * either; a review that calls a critical defect `low` passes, and no keyword
 * reaches that.
 */
export const verdictPairApproves: DerivedCheck = {
  id: "verdict-pair-approves",
  type: "verdict",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined, options?: CheckRunOptions): CheckOutcome {
    if (contextDirectory === undefined) {
      /* Unreachable through `runChecks`, which SKIPS first. Fail closed rather
         than trusting a caller that reaches the check directly. */
      return {
        violations: [{ pointer: "#/verdict", message: "no context directory was supplied" }],
        reports: [],
      };
    }
    const verdict = asRecord(instance);
    const phaseReading = establishField(verdict, "phase");
    if (phaseReading.kind !== "established") {
      return {
        violations: [
          {
            pointer: "#/phase",
            message: `the verdict ${unestablishedReason(phaseReading, "phase") as string}, so the other reviews of the same work cannot be selected`,
          },
        ],
        reports: [],
      };
    }
    const phaseKey = phaseReading.value;
    const phase = verdict?.["phase"] as string;

    const source = resolveCorpusSource(contextDirectory);
    const regime = establishDelegatedRegime(
      "verdict-pair-approves",
      contextDirectory,
      phase,
      source,
    );
    if (regime.kind === "report") {
      return { violations: [], reports: regime.lines };
    }
    if (regime.kind === "violation") {
      return {
        violations: [{ pointer: regime.pointer, message: regime.message }],
        reports: [],
      };
    }

    const ownHead = headKeyOf(verdict, "this verdict");
    if (!ownHead.ok) {
      return {
        violations: [{ pointer: "#/head", message: ownHead.message }],
        reports: [],
      };
    }
    const headKey = ownHead.value;

    const committed = loadCommittedVerdicts(contextDirectory, source);
    if (!committed.ok) {
      return {
        violations: [{ pointer: "#/verdict", message: committed.reason }],
        reports: [],
      };
    }
    const grouped = headGroupFor(
      committed.verdicts,
      phaseKey,
      headKey,
      contextDirectory,
      establishHistoryProvenance(contextDirectory, committed.source, options?.base),
    );
    const group = grouped.members;

    /* SAME TWO SOURCES AS THE SIBLING CHECK, AND THE REASON IS SHARPER HERE.
       This predicate says the pair APPROVES, so every document that could not
       be examined is a document that could have been the refusal. */
    const violations: Diagnostic[] = [...committed.unexaminable, ...grouped.unkeyed];
    if (group.length < 2) {
      violations.push({
        pointer: "#/verdict",
        message: `only ${String(group.length)} verdict document(s) exist under ${REVIEW_DIRECTORY} for phase ${phase} at head ${headKey}, and DR-0012 condition 2 is a property of the PAIR, so it cannot be satisfied by fewer than two ${describeVerdictCorpusSource(committed.source)}`,
      });
    }

    for (const candidate of group) {
      violations.push(...verdictApprovalFaults(candidate, phase, headKey));
    }

    const headlessReports = grouped.headless.map((sibling) =>
      headlessSiblingReport("verdict-pair-approves", sibling, phase, headKey),
    );
    return {
      violations,
      reports:
        violations.length > 0
          ? headlessReports
          : [
              ...headlessReports,
              `REPORT verdict-pair-approves ${String(group.length)} verdict(s) for phase ${phase} at head ${headKey} read APPROVE and carry no finding at ${BLOCKING_SEVERITIES.join(", ")}`,
            ],
    };
  },
};

/**
 * Why one verdict does not approve the merge: its verdict word is not the raw
 * APPROVE, or it carries a finding at a blocking severity. Empty when it
 * approves. Shared by `verdict-pair-approves` and the merge gate, which since
 * M6-P5 runs it over the verdicts the kernel's review records count.
 */
export function verdictApprovalFaults(candidate: LoadedVerdict, phase: string, headKey: string): Diagnostic[] {
  const faults: Diagnostic[] = [];
  const reading = establishField(candidate.record, "verdict");
  if (reading.kind !== "established") {
    faults.push({
      pointer: "#/verdict",
      message: `${candidate.path} ${unestablishedReason(reading, "verdict") as string}, so whether this review approves the merge could not be established, and a merge check that cannot read a verdict must not report the pair clean`,
    });
  } else {
    const raw = candidate.record["verdict"] as string;
    if (!VERDICT_VOCABULARY.includes(raw)) {
      faults.push({
        pointer: "#/verdict",
        message: `${candidate.path} declares verdict ${raw}, which is not one of the two words the closed vocabulary admits (${VERDICT_VOCABULARY.join(", ")}), so it cannot be read as an authorisation however it is spelled`,
      });
    } else if (raw !== APPROVING_VERDICT) {
      faults.push({
        pointer: "#/verdict",
        message: `${candidate.path} reads ${raw} for phase ${phase} at head ${headKey}, so the pair does not approve this head and the delegated grant's condition 2 is not met`,
      });
    }
  }
  faults.push(...blockingFindings(candidate, phase, headKey));
  return faults;
}

/**
 * Every finding in one verdict that DR-0012 condition 2 bars a merge over.
 *
 * SEPARATE FROM THE CHECK BODY because the shapes it has to refuse are the
 * interesting part and they are easy to lose in a loop. `findings` that is not
 * a list, an entry that is not a map, and a `severity` that cannot be
 * established are all REFUSALS rather than skips, for the reason the whole of
 * this section follows: a value that has not been established is not a value
 * that has been shown safe, and under a grant unshown must be refused.
 */
function blockingFindings(
  candidate: LoadedVerdict,
  phase: string,
  headKey: string,
): Diagnostic[] {
  const raw = candidate.record["findings"];
  if (raw === undefined) {
    return [
      {
        pointer: "#/findings",
        message: `${candidate.path} declares no findings, so whether it carries a blocking one could not be established for phase ${phase} at head ${headKey}`,
      },
    ];
  }
  if (!Array.isArray(raw)) {
    return [
      {
        pointer: "#/findings",
        message: `${candidate.path} declares findings as ${raw === null ? "null" : typeof raw === "object" ? "a map" : `a ${typeof raw}`}, which is not a list of findings, so whether it carries a blocking one could not be established`,
      },
    ];
  }
  const out: Diagnostic[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const finding = asRecord(raw[index]);
    if (finding === undefined) {
      out.push({
        pointer: `#/findings/${String(index)}`,
        message: `${candidate.path} finding ${String(index)} is not a map, so its severity could not be established`,
      });
      continue;
    }
    const severity = establishField(finding, "severity");
    if (severity.kind !== "established") {
      out.push({
        pointer: `#/findings/${String(index)}/severity`,
        message: `${candidate.path} finding ${String(index)} ${unestablishedReason(severity, "severity") as string}, so whether it blocks the merge could not be established`,
      });
      continue;
    }
    const id = establishField(finding, "id");
    const named = id.kind === "established" ? (finding["id"] as string) : `at index ${String(index)}`;
    if (!SEVERITY_VOCABULARY.includes(severity.value)) {
      out.push({
        pointer: `#/findings/${String(index)}/severity`,
        message: `${candidate.path} ranks finding ${named} ${severity.value}, which is not one of the four severities the kernel's vocabulary admits (${SEVERITY_VOCABULARY.join(", ")}), so whether it blocks the merge could not be established`,
      });
      continue;
    }
    if (BLOCKING_SEVERITIES.includes(severity.value)) {
      out.push({
        pointer: `#/findings/${String(index)}/severity`,
        message: `${candidate.path} carries finding ${named} at severity ${severity.value} for phase ${phase} at head ${headKey}, and a delegated grant is not satisfied while a review carries an unresolved finding at ${BLOCKING_SEVERITIES.join(", ")}`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* model-resolution-subject-echo (M4-P7 criteria 1, 2 and 7)            */
/* ------------------------------------------------------------------ */

/**
 * THE SUBJECT ECHO AGREES WITH THE RESOLUTION IT SITS BESIDE, THE RECORD WAS
 * WRITTEN AFTER THE TURN ENDED, AND AN OVERRIDE WAS PERMITTED BEFORE IT WAS
 * APPLIED.
 *
 * All three compare SIBLING FIELDS of one document, so all three are Kind B
 * and none of them is reachable from a keyword (schemas/README.md's Kind A and
 * Kind B section, DR-0013 clause 8). The schema next door can require that
 * `subject`, `turnEnd` and `resolution` are all PRESENT, which is what makes a
 * launch-time record unrepresentable, and it stops exactly there: it cannot
 * say that two present values agree.
 *
 * WHY THE ECHO MATTERS AT ALL, since a record that echoes itself sounds
 * circular. It is not the record checking itself against itself. `subject` is
 * a VERBATIM copy of the launch request the adapter was handed and
 * `resolution` is what the adapter's resolver actually consumed, and the
 * hazard is that those two diverge silently: a resolver that read the wrong
 * role's row produces a perfectly well-formed record whose family token is
 * then attributed to a task it was never about. That is the misattribution
 * guard src/gates/schemas/release-record.schema.json:26 exists for, one seam
 * along, and the kernel-side half of it is in src/model-resolution.ts where
 * the request is compared against a copy the kernel itself holds.
 *
 * THE OVERRIDE DIRECTION IS THE ONE MOST LIKELY TO BE GOT WRONG. M4-P7
 * criterion 7 wants BOTH directions: a role whose `charter-override` is
 * `allowed` takes the charter's tier, and a role whose permission is anything
 * else does not. The second direction is the one a resolver written from the
 * happy path silently drops, because nothing about it looks like a failure.
 */
export const modelResolutionSubjectEcho: DerivedCheck = {
  id: "model-resolution-subject-echo",
  type: "model-resolution",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const document = asRecord(instance);
    if (document === undefined) {
      return EMPTY;
    }
    const subject = asRecord(document["subject"]);
    const resolution = asRecord(document["resolution"]);
    if (subject === undefined || resolution === undefined) {
      /* The schema requires both and runs first in `cmdValidate`, so this arm
         is not reached through the command. It is kept fail-open rather than
         inventing a second diagnostic for a missing field the schema already
         names, which would print the same defect twice under two wordings. */
      return EMPTY;
    }
    const violations: Diagnostic[] = [];

    const echoedRole = subject["role"];
    const resolvedRole = resolution["role"];
    if (echoedRole !== resolvedRole) {
      violations.push({
        pointer: "#/resolution/role",
        message: `the resolution is for role ${String(resolvedRole)} and the subject echo says the launch request named role ${String(echoedRole)}, so this record resolves a different subject than it claims`,
      });
    }

    const overrideApplied = resolution["overrideApplied"];
    const resolvedTier = resolution["tier"];
    if (overrideApplied === false && resolvedTier !== subject["requestedTier"]) {
      violations.push({
        pointer: "#/resolution/tier",
        message: `no charter override was applied and the resolved tier ${String(resolvedTier)} is not the requested tier ${String(subject["requestedTier"])}, so the tier changed with nothing recorded as having changed it`,
      });
    }
    if (overrideApplied === true) {
      if (resolvedTier !== resolution["charterTier"]) {
        violations.push({
          pointer: "#/resolution/tier",
          message: `a charter override was applied and the resolved tier ${String(resolvedTier)} is not the charter tier ${String(resolution["charterTier"])}, so the record cites a charter it did not follow`,
        });
      }
      const permission = asRecord(resolution["observation"])?.["configPermission"];
      if (permission !== "allowed") {
        violations.push({
          pointer: "#/resolution/observation/configPermission",
          message: `a charter override was applied while the role's charter-override permission was observed to be ${String(permission)}, so the override was taken where the role forbids it`,
        });
      }
    }

    const writtenAt = document["writtenAt"];
    const endedAt = asRecord(document["turnEnd"])?.["endedAt"];
    if (typeof writtenAt === "string" && typeof endedAt === "string") {
      const written = Date.parse(writtenAt);
      const ended = Date.parse(endedAt);
      if (Number.isFinite(written) && Number.isFinite(ended) && written < ended) {
        violations.push({
          pointer: "#/writtenAt",
          message: `the record says it was written at ${writtenAt}, before the turn ended at ${endedAt}, so it cannot carry what the turn resolved and is a restatement of the request`,
        });
      }
    }

    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* The registry                                                         */
/* ------------------------------------------------------------------ */

const registry: DerivedCheck[] = [
  verdictPairApproves,
  modelResolutionSubjectEcho,
];

/** Register a check. Later phases append their own (section 2.3's table). */
export function registerCheck(check: DerivedCheck): void {
  registry.push(check);
}

/** Remove a check by id. Returns whether one was removed. */
export function deregisterCheck(id: string): boolean {
  const index = registry.findIndex((check) => check.id === id);
  if (index === -1) {
    return false;
  }
  registry.splice(index, 1);
  return true;
}

/** Every check registered for an artifact type, in stable id order. */
export function checksFor(type: string): DerivedCheck[] {
  return registry
    .filter((check) => typesOf(check).includes(type))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every registered check, in registration order. Read by the enumeration. */
export function registeredChecks(): readonly DerivedCheck[] {
  return [...registry];
}

/** The outcome of running every check registered for a type. */
export interface ChecksRun {
  /** Lines to print, in the order they should appear. */
  lines: string[];
  /** True when at least one check violated or was skipped for want of context. */
  failed: boolean;
  /**
   * True when at least one check VIOLATED. A skip alone leaves it false. This
   * is what `tiphys validate` exits on (kernel 0.2.1).
   */
  violated: boolean;
}

/**
 * Run every registered check for `type`.
 *
 * A check whose `requiresContext` is true and which was given none is
 * SKIPPED and `failed` is set (since kernel 0.2.1 `tiphys validate` exits on
 * `violated`, so a skip alone exits 0; DR-0053). It is deliberately not an
 * ordinary violation:
 * "this rule did not run" and "this rule found a problem" are different
 * facts and a reader must be able to tell them apart, but both are reasons
 * not to trust a green.
 */
export function runChecks(
  type: string,
  instance: unknown,
  contextDirectory: string | undefined,
  /**
   * KERNEL 0.2.1 (DR-0055): checks not in force for this document's stamp,
   * decided by src/stamp.ts's RULES_SINCE. They are not run and not counted
   * as skipped; the caller prints why.
   */
  notInForce: ReadonlySet<string> = new Set<string>(),
): ChecksRun {
  const violationLines: string[] = [];
  const reportLines: string[] = [];
  const skippedLines: string[] = [];
  for (const check of checksFor(type)) {
    if (notInForce.has(check.id)) {
      continue;
    }
    if (check.requiresContext && contextDirectory === undefined) {
      skippedLines.push(`SKIPPED ${check.id} no context`);
      continue;
    }
    const outcome = check.run(instance, contextDirectory);
    for (const violation of outcome.violations) {
      violationLines.push(
        `INVALID ${violation.pointer} ${violation.message} (check: ${check.id})`,
      );
    }
    reportLines.push(...outcome.reports);
  }
  violationLines.sort();
  return {
    lines: [...skippedLines, ...violationLines, ...reportLines],
    failed: violationLines.length > 0 || skippedLines.length > 0,
    violated: violationLines.length > 0,
  };
}
