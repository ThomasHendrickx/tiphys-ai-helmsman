import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { refuseOpenForWrite, singleLine } from "../task.ts";
import { loadManifest } from "./manifest.ts";
import { exitCodeForStatus, makeGateResult, renderGateResult } from "./result.ts";
import type { GateResult, GateStatus } from "./result.ts";
import {
  listWitnessSpecFiles,
  loadWitnessSpec,
  memberTouchedFiles,
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
 * Registered in gates.manifest.json as `red-witness`, applicability
 * `required`, precondition `diff-touches` on `src/` and `bin/`, unitLabel
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
 *   - Every STORED witness any of whose dangerous-state members touches a
 *     changed file is re-evaluated; one now green against any of its own
 *     members is red with reason "witness no longer guards its behavior"
 *     naming the witness and the measured rate (M2R-002, the N-401 shape).
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
  "--base <ref> [--head <ref>] [--baseline <ref>] [--phase <id>]";

interface GateOptions {
  result?: string;
  evidence?: string;
  base?: string;
  head?: string;
  baseline?: string;
  phase?: string;
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
}

export interface RedWitnessRun {
  repoRoot: string;
  base: string;
  head?: string;
  baseline?: string;
  evidenceDir?: string;
  hooks?: WitnessHooks;
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
  };
}

/** True when the repo-relative path is a phase-audited source path. */
function isAuditedSource(path: string): boolean {
  return path.startsWith("src/") || path.startsWith("bin/");
}

/**
 * Run the red-witness gate against a repository. Exported so tests can
 * drive it without a subprocess; the CLI below is a thin shell over it.
 */
export function runRedWitnessGate(run: RedWitnessRun): RedWitnessOutcome {
  const startedAt = now();

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
    return errorOutcome(startedAt, diffOutcome.reason);
  }
  const diff: PhaseDiff = diffOutcome.diff;

  const manifestPath = join(repoRoot, "gates.manifest.json");
  const manifest = loadManifest(manifestPath);
  if (!manifest.ok) {
    return errorOutcome(
      startedAt,
      `the destructiveCommands list could not be read (rule (e) needs it): ` +
        `${manifest.reason}${manifest.diagnostics.length > 0 ? `: ${manifest.diagnostics.join("; ")}` : ""}`,
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
  // member either).
  const spawningChangedFiles: string[] = [];
  for (const [path, file] of diff.files) {
    if (file.status === "D") {
      continue;
    }
    const shown = gitIn(repoRoot, ["show", `${diff.headSha}:${path}`]);
    if (shown.ok && SPAWN_GREP.test(shown.stdout)) {
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
  const triggeredStored = stored.filter((entry) =>
    entry.spec.dangerousStates.some((member) =>
      memberTouchedFiles(member, readPatchAtHead).some((file) =>
        diff.files.has(file),
      ),
    ),
  );

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
      destructiveCommands: manifest.manifest.destructiveCommands,
      behaviors,
      testFiles: testFilesOutcome.files,
      spawningChangedFiles,
      scratchRoot,
    };
    for (const entry of own) {
      const inputs: EvaluationInputs = { ...baseInputs, phaseOwn: true };
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
      const inputs: EvaluationInputs = { ...baseInputs, phaseOwn: false };
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

  const detail =
    `${String(evaluations.length)} witness(es) evaluated ` +
    `(${String(own.length)} own, ${String(triggeredStored.length)} stored ` +
    `re-evaluated in ${String(reEvaluationMs)}ms); ` +
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
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
