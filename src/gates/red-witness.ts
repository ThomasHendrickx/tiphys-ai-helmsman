import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathsIdentifySameObject } from "../path-identity.ts";
import { refuseOpenForWrite, singleLine } from "../task.ts";
import { readRegistryDocument } from "./run.ts";
import { exitCodeForStatus, makeGateResult, renderGateResult } from "./result.ts";
import type { GateResult, GateStatus } from "./result.ts";
import {
  listWitnessSpecFiles,
  loadWitnessSpec,
  memberTouchedFiles,
  parseWitnessSpec,
  phaseOwnedMemberIndices,
} from "../witness/spec.ts";
import type { WitnessSpec } from "../witness/spec.ts";
import {
  SPAWN_GREP,
  computePhaseDiff,
  evaluateWitness,
  gitIn,
  makeScratchRoot,
  readTestFilesAtHead,
  removeScratchRoot,
  resolveRepoRoot,
  shellSpawnsAndParses,
} from "../witness/run.ts";
import type {
  EvaluationInputs,
  PhaseDiff,
  WitnessEvaluation,
  WitnessHooks,
} from "../witness/run.ts";

/**
 * THE RED-WITNESS GATE (kernel plan M2, M2-P2 steps 6 and 7).
 *
 * Registered in gate-registry.yaml as `red-witness`, precondition
 * `diff-touches` on `src/`, `bin/` and `plugin/`, unitLabel
 * `witnesses evaluated`. Invoked by the runner as
 *
 *   node src/gates/red-witness.ts --result <path> --evidence <dir>
 *     --base <ref> --head <ref>
 *
 * plus `--baseline <ref>` when invoked directly: merge-time re-verification
 * is a PARAMETER, not an enforcement (M2-D-08); it defaults to `--base`.
 *
 * WHAT THE GATE DECIDES.
 *   - Every witness spec changed in the phase diff (the phase's OWN
 *     witnesses) is evaluated by the harness.
 *   - Which STORED witnesses are re-evaluated depends on the CI event
 *     (`--event`, M6-P8, DR-0066; see `storedWitnessEvaluated`). On
 *     `pull_request`, a stored witness is re-evaluated only when the diff
 *     changes a file one of its members mutates or a test file it runs; every
 *     other stored witness is SKIPPED AND COUNTED in the detail line. On
 *     `push`, and on a run naming no event, every stored witness is
 *     re-evaluated. One now green against any of its own members is red with
 *     reason "witness no longer guards its behavior" naming the witness and
 *     the measured rate (M2R-002, the N-401 shape).
 *   - A changed source file under src/ or bin/ with no witness spec
 *     covering it is RED, never not-applicable (step 7).
 *   - `--base` absent is `error` (M2-C-3).
 *
 * DEPTH REQUIREMENT, documented rather than assumed (STATE.md CR-902
 * carry-forward): the gate needs `--base` and `--head` resolvable with
 * history (the diff is base...head, a merge-base diff) and an UNSHALLOW
 * repository, because the harness scratch-clones it and git refuses to
 * clone from a shallow source. Both are satisfied by `fetch-depth: 0` on
 * the CI checkout, which is owned by the workflow's owner, not this phase.
 * A shallow repository is `error` naming the requirement. On pull_request
 * events the checkout HEAD is a synthetic merge commit, so the audited
 * head is always taken from `--head`, never from the checkout.
 */

const USAGE =
  "usage: node src/gates/red-witness.ts --result <path> --evidence <dir> " +
  "--base <ref> [--head <ref>] [--baseline <ref>] [--phase <id>] " +
  "[--event <pull_request|push>]";

interface GateOptions {
  result?: string;
  evidence?: string;
  base?: string;
  head?: string;
  baseline?: string;
  phase?: string;
  event?: string;
}

function parseArgs(argv: string[]): { options?: GateOptions; usageError?: string } {
  const options: GateOptions = {};
  const known = new Map<string, keyof GateOptions>([
    ["--result", "result"],
    ["--evidence", "evidence"],
    ["--base", "base"],
    ["--head", "head"],
    ["--baseline", "baseline"],
    ["--phase", "phase"],
    ["--event", "event"],
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] as string;
    const field = known.get(flag);
    if (field === undefined) {
      return { usageError: `unknown option ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${flag} requires a value` };
    }
    options[field] = value;
  }
  return { options };
}

export interface RedWitnessOutcome {
  result: GateResult;
  exitCode: number;
  evaluations: WitnessEvaluation[];
  /** Wall-clock cost of the stored-witness re-evaluation, milliseconds. */
  reEvaluationMs: number;
  /** Ids of the stored witnesses this run did not evaluate (M6-P8). */
  skippedStored: string[];
}

export interface RedWitnessRun {
  repoRoot: string;
  base: string;
  head?: string;
  baseline?: string;
  evidenceDir?: string;
  /**
   * The CI event the run names (`--event`). Absent is a run over every gate
   * (a local run), and it takes the strictest arm: every stored witness.
   */
  event?: string;
  hooks?: WitnessHooks;
}

/** The events `--event` may name; anything else is `error`. */
const WITNESS_EVENTS: readonly string[] = ["pull_request", "push"];

/**
 * What a pull request's selection needs to know about one STORED witness.
 * Every path set here is repo-relative, in the phase diff's own spelling.
 */
export interface StoredSelectionFacts {
  /** The CI event the run names, or undefined for a run naming none. */
  event: string | undefined;
  /** Every path the phase diff (merge base...head, `--no-renames`) changed. */
  changed: ReadonlySet<string>;
  /** Files the witness's members mutate, and each patch member's own patch file. */
  mutated: readonly string[];
  /**
   * Test files the diff changed that carry one of the witness's named tests,
   * in their head source or in their merge-base source.
   */
  changedTestFiles: readonly string[];
}

/**
 * DOES THIS RUN RE-EVALUATE THIS STORED WITNESS? (M6-P8, DR-0066)
 *
 * Only `pull_request` may skip. `push` is the full sweep on `main` just after
 * the merge, and a run naming no event is a local run over every gate, so
 * both evaluate every stored witness: the push event taking the pull-request
 * arm would make the full sweep never run, which is the hazard the plan names.
 *
 * On `pull_request` a stored witness is evaluated when the diff changes a file
 * one of its members mutates, or a test file it runs. A RENAMED OR MOVED test
 * file counts as changed: the diff is `--no-renames`, so a move is a deletion
 * of the old path plus an addition of the new one, and the witness's named
 * test is found in the added file's head source (or the deleted file's
 * merge-base source). A test RENAMED inside a file is found in that file's
 * merge-base source, so it counts too.
 *
 * A diff that cannot be computed never reaches this function: the gate reports
 * `error` first (`runRedWitnessGate`), so no witness is skipped on a failed
 * diff.
 */
export function storedWitnessEvaluated(facts: StoredSelectionFacts): boolean {
  if (facts.event !== "pull_request") {
    return true;
  }
  return (
    facts.mutated.some((file) => facts.changed.has(file)) ||
    facts.changedTestFiles.length > 0
  );
}

function now(): string {
  return new Date().toISOString();
}

function errorOutcome(startedAt: string, detail: string): RedWitnessOutcome {
  const result = makeGateResult({
    gate: "red-witness",
    status: "error",
    units: 0,
    unitLabel: "witnesses evaluated",
    startedAt,
    endedAt: now(),
    detail,
  });
  return {
    result,
    exitCode: exitCodeForStatus(result.status),
    evaluations: [],
    reEvaluationMs: 0,
    skippedStored: [],
  };
}

/**
 * True when the repo-relative path is a phase-audited source path.
 *
 * WHY `plugin/src/` AND NOT `plugin/`. This list is the COVERAGE OBLIGATION:
 * a changed path here must be touched by some witness's dangerous state or the
 * gate reports it uncovered. `src/` and `bin/` are source trees, and the plugin
 * package's source tree is `plugin/src/`. Adding bare `plugin/` would pull in
 * `plugin/package.json` and `plugin/tsconfig.json`, which no witness mutates
 * and which would therefore redden every plugin phase for its own packaging.
 *
 * WHY IT IS NOT THE SAME LIST AS THE GATE'S PRECONDITION, which reads
 * `src/`, `bin/`, `plugin/`. The precondition decides whether the gate RUNS.
 * This decides what it REQUIRES. T-038 widened the first and left the second,
 * so from that fix until this one a diff touching only `plugin/` ran the gate
 * and took no obligation from it: a plugin phase shipping ZERO witnesses was
 * green. Found by M4-P29 while reading this file for a different reason.
 */
function isAuditedSource(path: string): boolean {
  return (
    path.startsWith("src/") ||
    path.startsWith("bin/") ||
    path.startsWith("plugin/src/")
  );
}

/**
 * Run the red-witness gate against a repository. Exported so tests can
 * drive it without a subprocess; the CLI below is a thin shell over it.
 */
export function runRedWitnessGate(run: RedWitnessRun): RedWitnessOutcome {
  const startedAt = now();

  if (run.event !== undefined && !WITNESS_EVENTS.includes(run.event)) {
    return errorOutcome(
      startedAt,
      `--event ${run.event} is not one of ${WITNESS_EVENTS.join(", ")}`,
    );
  }

  const rootProbe = resolveRepoRoot(run.repoRoot);
  if (rootProbe.root === undefined) {
    return errorOutcome(startedAt, rootProbe.reason as string);
  }
  const repoRoot = rootProbe.root;

  const shallow = gitIn(repoRoot, ["rev-parse", "--is-shallow-repository"]);
  if (!shallow.ok) {
    return errorOutcome(startedAt, shallow.reason);
  }
  if (shallow.stdout.trim() === "true") {
    return errorOutcome(
      startedAt,
      "this repository is a shallow clone; the red-witness gate requires " +
        "full history (fetch-depth: 0) because the phase diff is a " +
        "merge-base diff and the harness scratch-clones the repository, " +
        "which git refuses from a shallow source",
    );
  }

  const diffOutcome = computePhaseDiff(repoRoot, run.base, run.head ?? "HEAD");
  if (!diffOutcome.ok) {
    // NEVER A SELECTION OVER NO CHANGED FILES (M6-P8): an empty change set
    // would skip every stored witness on a pull request and read green.
    return errorOutcome(
      startedAt,
      `the phase diff could not be computed, so no stored witness is skipped: ${diffOutcome.reason}`,
    );
  }
  const diff: PhaseDiff = diffOutcome.diff;

  const registryPath = join(repoRoot, "gate-registry.yaml");
  const registry = readRegistryDocument(registryPath);
  if (!registry.ok) {
    return errorOutcome(
      startedAt,
      `the destructiveCommands list could not be read (rule (e) needs it): ` +
        `${registry.reason}${registry.diagnostics.length > 0 ? `: ${registry.diagnostics.join("; ")}` : ""}`,
    );
  }

  const behaviorsShown = gitIn(repoRoot, [
    "show",
    `${diff.headSha}:test/behaviors.json`,
  ]);
  if (!behaviorsShown.ok) {
    return errorOutcome(
      startedAt,
      `test/behaviors.json could not be read at the audited head: ${behaviorsShown.reason}`,
    );
  }
  let behaviors: Set<string>;
  try {
    behaviors = new Set(
      Object.keys(JSON.parse(behaviorsShown.stdout) as Record<string, unknown>),
    );
  } catch (error) {
    return errorOutcome(
      startedAt,
      `test/behaviors.json does not parse at the audited head: ${singleLine(String(error))}`,
    );
  }

  const testFilesOutcome = readTestFilesAtHead(repoRoot, diff.headSha);
  if (!testFilesOutcome.ok) {
    return errorOutcome(startedAt, testFilesOutcome.reason);
  }

  // Rule (f)'s derivation: the spawn grep over the changed files' head
  // contents (deleted files have no head content and cannot be touched by a
  // member either). Shell scripts (*.sh) are screened by the shell
  // spawn-and-parse derivation instead of the JS token grep (CR-H2), so a
  // bin/ shell script that classifies another program's output (the V-2
  // shape) is not invisible to the capture obligation.
  const spawningChangedFiles: string[] = [];
  for (const [path, file] of diff.files) {
    if (file.status === "D") {
      continue;
    }
    const shown = gitIn(repoRoot, ["show", `${diff.headSha}:${path}`]);
    if (!shown.ok) {
      continue;
    }
    const spawns = path.endsWith(".sh")
      ? shellSpawnsAndParses(shown.stdout)
      : SPAWN_GREP.test(shown.stdout);
    if (spawns) {
      spawningChangedFiles.push(path);
    }
  }
  spawningChangedFiles.sort();

  const witnessDir = join(repoRoot, "witness");
  const listing = listWitnessSpecFiles(witnessDir);
  if (!listing.ok) {
    return errorOutcome(startedAt, listing.reason);
  }

  const reasons: string[] = [];
  const specs: Array<{ spec: WitnessSpec; path: string; repoRelative: string }> = [];
  const seenIds = new Map<string, string>();
  for (const path of listing.paths) {
    const loaded = loadWitnessSpec(path);
    const repoRelative = relative(repoRoot, path).split("\\").join("/");
    if (!loaded.ok) {
      reasons.push(
        `${loaded.reason}${loaded.diagnostics.length > 0 ? `: ${loaded.diagnostics.join("; ")}` : ""}`,
      );
      continue;
    }
    const previous = seenIds.get(loaded.spec.id);
    if (previous !== undefined) {
      reasons.push(
        `witness id ${loaded.spec.id} is declared by both ${previous} and ${repoRelative}`,
      );
      continue;
    }
    seenIds.set(loaded.spec.id, repoRelative);
    specs.push({ spec: loaded.spec, path, repoRelative });
  }

  const readPatchAtHead = (patchPath: string): string | undefined => {
    const shown = gitIn(repoRoot, ["show", `${diff.headSha}:${patchPath}`]);
    return shown.ok ? shown.stdout : undefined;
  };

  const own = specs.filter((entry) => diff.files.has(entry.repoRelative));
  const stored = specs.filter((entry) => !diff.files.has(entry.repoRelative));

  /**
   * A patch member's body at the MERGE BASE, the old side of the ownership
   * comparison. `readPatchAtHead` above is the new side. Two readers rather
   * than one because the whole point of reading the body is that the same path
   * can hold different content on the two revisions.
   */
  const readPatchAtMergeBase = (patchPath: string): string | undefined => {
    const shown = gitIn(repoRoot, ["show", `${diff.mergeBaseSha}:${patchPath}`]);
    return shown.ok ? shown.stdout : undefined;
  };

  /**
   * The members of an own spec that THIS PHASE AUTHORED, which is rule (d)'s
   * scope. Membership in `own` is file-granular ("some byte of this spec
   * changed") and rule (d)'s obligation is member-granular ("this declared
   * dangerous state must intersect the diff"), so the two are reconciled here
   * rather than by handing the harness a boolean for the whole file.
   *
   * The old side is read at the MERGE BASE, which is the revision the diff
   * itself is taken against. A baseline that is absent, unreadable or invalid
   * yields `undefined`, and `phaseOwnedMemberIndices` then owns every member:
   * an added spec is wholly the phase's, and so is one whose previous version
   * cannot be established.
   *
   * The WHOLE spec goes in, not just its members, because the spec's claim
   * (`behavior` and `tests`) is part of what rule (d) is an obligation on. See
   * `claimRePointed` for which fields are in that set, why the other four are
   * not, and why the comparison is DIRECTIONAL: re-pointing a claim takes the
   * obligation, extending its named tests does not.
   */
  const ownedMembersOf = (entry: {
    spec: WitnessSpec;
    repoRelative: string;
  }): Set<number> => {
    const readers = { head: readPatchAtHead, baseline: readPatchAtMergeBase };
    const shown = gitIn(repoRoot, [
      "show",
      `${diff.mergeBaseSha}:${entry.repoRelative}`,
    ]);
    if (!shown.ok) {
      return phaseOwnedMemberIndices(entry.spec, undefined, readers);
    }
    const baseline = parseWitnessSpec(
      shown.stdout,
      `${diff.mergeBaseSha}:${entry.repoRelative}`,
    );
    return phaseOwnedMemberIndices(
      entry.spec,
      baseline.ok ? baseline.spec : undefined,
      readers,
    );
  };
  /**
   * The test files the diff changed, each with its head source and its
   * merge-base source (either absent when the file is absent there). Only
   * `*.test.ts` under `test/`, the set `readTestFilesAtHead` resolves named
   * tests in, so "a test file it runs" means what the harness runs.
   */
  const changedTestSources: Array<{ path: string; sources: string[] }> = [];
  for (const [path, file] of diff.files) {
    if (!path.startsWith("test/") || !path.endsWith(".test.ts")) {
      continue;
    }
    const sources: string[] = [];
    const atHead = testFilesOutcome.files.get(path);
    if (atHead !== undefined) {
      sources.push(atHead);
    }
    if (file.status !== "A") {
      const atMergeBase = gitIn(repoRoot, ["show", `${diff.mergeBaseSha}:${path}`]);
      if (!atMergeBase.ok) {
        return errorOutcome(
          startedAt,
          `the merge-base source of changed test file ${path} could not be read, ` +
            `so no stored witness is skipped: ${atMergeBase.reason}`,
        );
      }
      sources.push(atMergeBase.stdout);
    }
    changedTestSources.push({ path, sources });
  }
  const changedPaths: ReadonlySet<string> = new Set(diff.files.keys());
  const selectionFacts = (entry: { spec: WitnessSpec }): StoredSelectionFacts => {
    const mutated = new Set<string>();
    for (const member of entry.spec.dangerousStates) {
      if (member.kind === "patch") {
        mutated.add(member.patch);
      }
      for (const file of memberTouchedFiles(member, readPatchAtHead)) {
        mutated.add(file);
      }
    }
    return {
      event: run.event,
      changed: changedPaths,
      mutated: [...mutated],
      changedTestFiles: changedTestSources
        .filter((changed) =>
          entry.spec.tests.some((name) =>
            changed.sources.some((source) => source.includes(name)),
          ),
        )
        .map((changed) => changed.path),
    };
  };
  const triggeredStored = stored.filter((entry) =>
    storedWitnessEvaluated(selectionFacts(entry)),
  );
  const skippedStored = stored.filter((entry) => !triggeredStored.includes(entry));

  // Coverage (step 7): source changed with no witness spec covering it is
  // red, never not-applicable. Coverage semantics are decision D-P2-2 in
  // the work history.
  const covered = new Set<string>();
  for (const entry of specs) {
    for (const member of entry.spec.dangerousStates) {
      for (const file of memberTouchedFiles(member, readPatchAtHead)) {
        covered.add(file);
      }
    }
  }
  const uncovered: string[] = [];
  for (const [path, file] of diff.files) {
    if (file.status === "D" || !isAuditedSource(path)) {
      continue;
    }
    if (!covered.has(path)) {
      uncovered.push(path);
    }
  }
  uncovered.sort();
  if (uncovered.length > 0) {
    reasons.push(
      `source changed with no witness spec covering it: ${uncovered.join(", ")}`,
    );
  }

  const evaluations: WitnessEvaluation[] = [];
  let reEvaluationMs = 0;
  const scratchRoot = makeScratchRoot();
  try {
    const baseInputs = {
      repoRoot,
      headSha: diff.headSha,
      baselineRef: run.baseline ?? run.base,
      diff,
      destructiveCommands: registry.document.destructiveCommands,
      behaviors,
      testFiles: testFilesOutcome.files,
      spawningChangedFiles,
      scratchRoot,
    };
    for (const entry of own) {
      const inputs: EvaluationInputs = {
        ...baseInputs,
        phaseOwnedMembers: ownedMembersOf(entry),
      };
      if (run.hooks !== undefined) {
        inputs.hooks = run.hooks;
      }
      const evaluation = evaluateWitness(entry.spec, entry.repoRelative, inputs);
      evaluations.push(evaluation);
      if (evaluation.status !== "green") {
        reasons.push(
          `witness ${evaluation.witness}: ${evaluation.status}: ${evaluation.reasons.join("; ")}`,
        );
      }
    }
    const reEvaluationStart = Date.now();
    for (const entry of triggeredStored) {
      // A stored witness is one the phase diff does not touch at all, so no
      // member of it is the phase's and rule (d) has nothing to apply to.
      const inputs: EvaluationInputs = {
        ...baseInputs,
        phaseOwnedMembers: new Set<number>(),
      };
      if (run.hooks !== undefined) {
        inputs.hooks = run.hooks;
      }
      const evaluation = evaluateWitness(entry.spec, entry.repoRelative, inputs);
      evaluations.push(evaluation);
      if (evaluation.status === "red") {
        const rates = evaluation.members
          .filter((member) => member.rate !== undefined)
          .map(
            (member) =>
              `member ${String(member.index)} red ` +
              `${String(member.rate?.red)}/${String(member.rate?.total)}`,
          )
          .join(", ");
        reasons.push(
          `witness ${evaluation.witness} no longer guards its behavior ` +
            `(${rates === "" ? evaluation.reasons.join("; ") : rates})`,
        );
      } else if (evaluation.status === "error") {
        reasons.push(
          `witness ${evaluation.witness}: error: ${evaluation.reasons.join("; ")}`,
        );
      }
    }
    reEvaluationMs = Date.now() - reEvaluationStart;
  } finally {
    removeScratchRoot(scratchRoot);
  }

  let status: GateStatus = "green";
  if (evaluations.some((evaluation) => evaluation.status === "error")) {
    status = "error";
  } else if (reasons.length > 0) {
    status = "red";
  }

  const evidence: string[] = [];
  if (run.evidenceDir !== undefined) {
    const recordsPath = join(run.evidenceDir, "witness-records.json");
    const refusal = refuseOpenForWrite(recordsPath);
    if (refusal === undefined) {
      try {
        mkdirSync(run.evidenceDir, { recursive: true });
        writeFileSync(
          recordsPath,
          `${JSON.stringify(
            {
              base: diff.baseSha,
              head: diff.headSha,
              event: run.event ?? null,
              skippedStored: skippedStored.map((entry) => entry.spec.id),
              spawningChangedFiles,
              uncoveredSources: uncovered,
              reEvaluationMs,
              evaluations,
            },
            null,
            2,
          )}\n`,
        );
        evidence.push("witness-records.json");
      } catch {
        // The record still carries the verdict; evidence is best-effort.
      }
    }
  }

  // THE SKIP IS VISIBLE, NEVER SILENT (M6-P8): the detail line counts the
  // stored witnesses this run did not evaluate and says why.
  const skipClause =
    run.event === "pull_request"
      ? `${String(skippedStored.length)} stored skipped (no file they mutate or run changed)`
      : `${String(skippedStored.length)} stored skipped (event ${run.event ?? "none"} evaluates every stored witness)`;
  const detail =
    `${String(specs.length)} witness(es): ${String(own.length)} own, ` +
    `${String(triggeredStored.length)} stored evaluated in ${String(reEvaluationMs)}ms, ` +
    `${skipClause}; ` +
    (reasons.length === 0
      ? "every witness red against every declared dangerous state and green at head"
      : reasons.join("; "));

  const result = makeGateResult({
    gate: "red-witness",
    status,
    units: evaluations.length,
    unitLabel: "witnesses evaluated",
    startedAt,
    endedAt: now(),
    detail,
    evidence,
  });
  return {
    result,
    exitCode: exitCodeForStatus(result.status),
    evaluations,
    reEvaluationMs,
    skippedStored: skippedStored.map((entry) => entry.spec.id),
  };
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.options === undefined) {
    process.stderr.write(`tiphys red-witness: ${parsed.usageError as string}\n${USAGE}\n`);
    return 64;
  }
  const options = parsed.options;
  if (options.result === undefined) {
    process.stderr.write(`tiphys red-witness: --result is required\n${USAGE}\n`);
    return 64;
  }

  let outcome: RedWitnessOutcome;
  if (options.base === undefined) {
    // M2-C-3 (M2R-003): a required invocation parameter absent is error,
    // never not-applicable and never a guess.
    outcome = errorOutcome(
      now(),
      "--base was not supplied; the phase diff cannot be computed (M2-C-3)",
    );
  } else {
    const run: RedWitnessRun = { repoRoot: process.cwd(), base: options.base };
    if (options.head !== undefined) {
      run.head = options.head;
    }
    if (options.event !== undefined) {
      run.event = options.event;
    }
    if (options.baseline !== undefined) {
      run.baseline = options.baseline;
    }
    if (options.evidence !== undefined) {
      run.evidenceDir = options.evidence;
    }
    try {
      outcome = runRedWitnessGate(run);
    } catch (error) {
      // No throw may escape as exit 1: that is the RED code (the runner's
      // own crash-discipline rule, applied to this gate).
      outcome = errorOutcome(
        now(),
        `the red-witness gate failed: ${singleLine((error as Error).message ?? String(error))}`,
      );
    }
  }

  const refusal = refuseOpenForWrite(options.result);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys red-witness: ${refusal}\n`);
    return 21;
  }
  try {
    writeFileSync(options.result, renderGateResult(outcome.result));
  } catch (error) {
    process.stderr.write(
      `tiphys red-witness: the result record could not be written: ${singleLine(String(error))}\n`,
    );
    return 21;
  }
  process.stdout.write(
    `red-witness: ${outcome.result.status} (${outcome.result.detail})\n`,
  );
  return outcome.exitCode;
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  // IDENTITY, NOT STRING EQUALITY (M4-P2 fix round, 2026-09-16). Going
  // through a URL does not change what is compared: `resolve` leaves the
  // caller's spelling intact while `import.meta.url` is canonical, so an
  // invocation through a symlink leaves this gate silently not running.
  return pathsIdentifySameObject(fileURLToPath(import.meta.url), entry);
})();

if (invokedDirectly) {
  // `process.exitCode`, NEVER `process.exit(main(...))` (M4-P29). This gate
  // runs as a SUBPROCESS, so fd 1 is a buffered stream the parent owns and a
  // write to one is QUEUED rather than completed. `process.exit` ends the
  // process without draining that queue, so everything past the buffer is
  // DISCARDED, while the exit code survives and the loss is silent.
  //
  // BE EXACT ABOUT WHICH STREAM, because the ceiling differs by a factor of
  // two and the obvious word is the wrong one. `spawnSync`, which is how the
  // registry runner invokes gates (src/gates/run.ts:1528), hands a child
  // SOCKETPAIRS, not pipes; a shell pipeline, a `tee` or a CI log collector
  // hands it a real pipe. Measured at the pre-fix parent commit on this
  // container, same invocation, only the reader changed:
  //
  //   reader            wrote     delivered
  //   regular file      176,530   176,530
  //   shell pipe        176,530    65,536   (one pipe buffer)
  //   spawnSync         434,530   146,176   (the socket send buffer)
  //
  // A regular file never truncates, which is why this survives casual
  // testing. This gate is the measured instance rather than a hypothetical
  // one: its single stdout line carries the whole `detail`, and `detail`
  // grows with the number of uncovered sources and of red witnesses.
  // Assigning `process.exitCode` lets the process end normally, which drains
  // the queue first, and the full capture is
  // witness/captures/m4-p29-gate-cli-stdio.txt.
  process.exitCode = main(process.argv.slice(2));
}
