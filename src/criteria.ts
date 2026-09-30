import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { readRegularFileIfPresent, singleLine } from "./task.ts";
import { decodeDocument, validateToLines } from "./validate.ts";
import type { SchemaDocument } from "./validate.ts";

/**
 * ACCEPTANCE CRITERIA ARE TESTS (DR-0064, kernel plan M6-P4).
 *
 * A plan criterion carries exactly one of `check` (what proves it) and
 * `not-testable` (why nothing can); `schemas/plan.schema.json` refuses
 * neither and both. This module reads a phase's criteria out of a plan and
 * judges each `check` against RESULTS, never against anything an agent wrote:
 *
 *   - every `check.tests` title must be REPORTED by the suite run and every
 *     reported test point carrying that exact title must PASS. Skipped, todo,
 *     failing, did-not-run and unreported are each red, naming the criterion
 *     and the title. Titles are compared with `===`, so a prefix or a
 *     substring of a real title is unreported, not proven.
 *   - every `check.command` is spawned with an argv and NO shell, from the
 *     project root, with a timeout. A nonzero exit, a signal, a timeout or a
 *     spawn failure is red with the exit and the tail of the output. An argv
 *     whose program is a shell given `-c` is refused unrun: an inline shell
 *     script exits with its last command's status, so `a | b` or `a || true`
 *     proves nothing about `a`.
 *
 * The suite gate (src/gates/suite.ts) is the caller for proofs, with the
 * suite's own reported points as the test input, so the suite runs once.
 * `tiphys plan count` and `tiphys brief compose` read the not-testable side.
 */

export interface CriterionCheck {
  tests?: string[];
  command?: string[];
}

export interface Criterion {
  id: string;
  criterion: string;
  check?: CriterionCheck;
  notTestable?: string;
}

/** How one reported test point ended, in the suite gate's own buckets. */
/**
 * What one reported test point shows. `pass` is the ONLY outcome that proves
 * a criterion. `expected-failure` and `replayed` are points node reports as
 * passed whose pass is not this run's evidence that the assertion holds
 * (fix round 1, CR-M6P4B-01): under `expectFailure` a pass means the body
 * FAILED, and a point replayed by `--test-rerun-failures` did not run at all.
 */
export type TestOutcome =
  | "pass"
  | "fail"
  | "skipped"
  | "todo"
  | "did-not-run"
  | "expected-failure"
  | "replayed";

/** One reported test point, as the criteria judge needs it. */
export interface ReportedTest {
  name: string;
  /** Repository-relative file, for the finding text only. */
  file: string;
  outcome: TestOutcome;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;
}

/** The criteria of one plan phase, as the schema shapes them. */
export function phaseCriteria(phase: Record<string, unknown>): Criterion[] {
  const acceptance = Array.isArray(phase["acceptance"]) ? phase["acceptance"] : [];
  const criteria: Criterion[] = [];
  for (const entry of acceptance) {
    const item = asRecord(entry);
    if (item === undefined) {
      continue;
    }
    const criterion: Criterion = {
      id: String(item["id"]),
      criterion: String(item["criterion"]),
    };
    const check = asRecord(item["check"]);
    if (check !== undefined) {
      criterion.check = {};
      const tests = stringArray(check["tests"]);
      if (tests !== undefined) {
        criterion.check.tests = tests;
      }
      const command = stringArray(check["command"]);
      if (command !== undefined) {
        criterion.check.command = command;
      }
    }
    if (typeof item["not-testable"] === "string") {
      criterion.notTestable = item["not-testable"];
    }
    criteria.push(criterion);
  }
  return criteria;
}

/** The phases of a plan, in plan order. */
function planPhases(plan: unknown): Record<string, unknown>[] {
  const phases = asRecord(plan)?.["phases"];
  return Array.isArray(phases)
    ? phases.map(asRecord).filter((phase): phase is Record<string, unknown> => phase !== undefined)
    : [];
}

export type PhaseLookup =
  | { kind: "found"; phase: Record<string, unknown>; id: string }
  | { kind: "absent" }
  | { kind: "ambiguous"; count: number };

/**
 * Find a phase by id, IGNORING CASE. CI derives `--phase` from the branch
 * name in lower case (`m6-p4`) while a plan spells phase ids in upper case
 * (`M6-P4`); an exact match would read every CI run as "the plan has no such
 * phase", which is the not-applicable arm, so the check would silently never
 * run. Two phases answering to one id are ambiguous, never "the first one".
 */
export function findPlanPhase(plan: unknown, phaseId: string): PhaseLookup {
  const wanted = phaseId.toLowerCase();
  const matches = planPhases(plan).filter(
    (phase) => typeof phase["id"] === "string" && phase["id"].toLowerCase() === wanted,
  );
  if (matches.length === 0) {
    return { kind: "absent" };
  }
  if (matches.length > 1) {
    return { kind: "ambiguous", count: matches.length };
  }
  const phase = matches[0] as Record<string, unknown>;
  return { kind: "found", phase, id: String(phase["id"]) };
}

export type PlanRead =
  | { ok: true; plan: unknown }
  | { ok: false; reason: string };

/**
 * Read, decode and SCHEMA-VALIDATE a plan. A plan that does not validate is a
 * refusal naming every INVALID line: a criterion with neither `check` nor
 * `not-testable` must never be read as "nothing to prove". The schema is
 * passed in so this module stays free of the command layer.
 */
export function readPlan(path: string, schema: SchemaDocument): PlanRead {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { ok: false, reason: `plan ${path} does not exist` };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: `plan ${path}: ${read.reason}` };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  const refusal = planSchemaRefusal(decoded.value, path, schema);
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }
  return { ok: true, plan: decoded.value };
}

/**
 * The refusal for a decoded plan that does not validate against the plan
 * schema, naming every INVALID line, or undefined when it validates. Shared by
 * the suite gate (through `readPlan`) and `tiphys brief compose`, so a plan
 * whose criteria carry neither shape is refused in both places rather than
 * read as a phase with nothing to prove (fix round 1, CR-M6P4B-02).
 */
export function planSchemaRefusal(
  value: unknown,
  path: string,
  schema: SchemaDocument,
): string | undefined {
  const invalid = validateToLines(schema, value).filter((line) => line.startsWith("INVALID"));
  if (invalid.length > 0) {
    return `plan ${path} does not validate against the plan schema: ${invalid.join("; ")}`;
  }
  return undefined;
}

export interface PhaseCount {
  phase: string;
  criteria: number;
  /** The ids of the phase's not-testable criteria; the count is the length. */
  notTestable: string[];
}

/** Per phase, how many criteria the plan declares and which are not-testable. */
export function countCriteria(plan: unknown): PhaseCount[] {
  return planPhases(plan).map((phase) => {
    const criteria = phaseCriteria(phase);
    return {
      phase: String(phase["id"]),
      criteria: criteria.length,
      notTestable: criteria
        .filter((criterion) => criterion.notTestable !== undefined)
        .map((criterion) => criterion.id),
    };
  });
}

function describeOutcome(outcome: TestOutcome): string {
  switch (outcome) {
    case "fail":
      return "failed";
    case "skipped":
      return "was skipped";
    case "todo":
      return "is a todo";
    case "did-not-run":
      return "did not run";
    case "expected-failure":
      return "passed only because it is marked expectFailure, so its assertions failed";
    case "replayed":
      return "passed only as a replay of an earlier run (--test-rerun-failures), so this run did not execute it";
    default:
      return "passed";
  }
}

/**
 * Judge every `check.tests` title against the suite's reported tests. Returns
 * one finding per unproven title; an empty list means every title was
 * reported and every point carrying it passed.
 */
export function judgeTestChecks(criteria: Criterion[], reported: ReportedTest[]): string[] {
  const findings: string[] = [];
  for (const criterion of criteria) {
    for (const title of criterion.check?.tests ?? []) {
      const points = reported.filter((point) => point.name === title);
      if (points.length === 0) {
        findings.push(
          `criterion ${criterion.id}: test "${title}" was not reported by the suite, so nothing proves it`,
        );
        continue;
      }
      for (const point of points) {
        if (point.outcome !== "pass") {
          findings.push(
            `criterion ${criterion.id}: test "${title}" ${describeOutcome(point.outcome)} (${point.file})`,
          );
        }
      }
    }
  }
  return findings;
}

/** Shells whose `-c` runs an inline script. */
const SHELL_PROGRAMS = new Set(["sh", "bash", "dash", "zsh", "ksh", "mksh", "ash", "fish", "csh", "tcsh"]);

/**
 * The words `env` takes before the program it runs that this check reads
 * past: a NAME=value assignment, `-i`, `-` and `--ignore-environment`. Any
 * other `env` option (`-u NAME`, `-C DIR`, `-S`) stops the skip, so the argv
 * is then judged from that word and a shell behind it is not found.
 */
const ENV_PREFIX_WORD = /^(?:[A-Za-z_][A-Za-z0-9_]*=[\s\S]*|-i|-|--ignore-environment)$/;

/**
 * True when the argv hands an inline script to a shell (`sh -c`, `bash -lc`),
 * directly or behind a leading `env` and its assignments (fix round 1,
 * CR-M6P4A-03): `env A=1 sh -c ...` runs the same shell as `sh -c ...`.
 */
export function runsInlineShell(argv: string[]): boolean {
  return inlineShellOf(argv) !== undefined;
}

/** The shell an argv hands an inline script to, or undefined when it hands none. */
export function inlineShellOf(argv: string[]): string | undefined {
  let start = 0;
  while (argv[start] !== undefined && basename(argv[start] as string) === "env") {
    start += 1;
    while (argv[start] !== undefined && ENV_PREFIX_WORD.test(argv[start] as string)) {
      start += 1;
    }
  }
  const program = argv[start];
  if (program === undefined || !SHELL_PROGRAMS.has(basename(program))) {
    return undefined;
  }
  return argv.slice(start + 1).some((argument) => /^-[A-Za-z]*c[A-Za-z]*$/.test(argument))
    ? basename(program)
    : undefined;
}

/** The default bound on one check command, seconds. */
export const DEFAULT_CHECK_TIMEOUT_SECONDS = 600;

/** How much of a failing command's output a finding quotes. */
const OUTPUT_TAIL_CHARACTERS = 400;

export interface CommandOutcome {
  argv: string[];
  /** The exit status, or null when the command ended without one. */
  exit: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Set when the command could not be run at all, or was refused unrun. */
  error?: string;
  /** The last characters of stdout then stderr, on one line. */
  tail: string;
}

/**
 * Run one check command: argv, NO shell, from `cwd`, bounded by a timeout.
 * `spawnSync` with an argv array never involves a shell, so shell
 * metacharacters in an argument (`||`, `;`, `|`) are passed to the program
 * as literal text.
 */
export function runCheckCommand(
  argv: string[],
  cwd: string,
  timeoutSeconds: number,
  env: Record<string, string>,
): CommandOutcome {
  if (runsInlineShell(argv)) {
    return {
      argv,
      exit: null,
      signal: null,
      timedOut: false,
      error: `it hands an inline script to ${inlineShellOf(argv) as string}, whose exit is its last command's; name the program instead`,
      tail: "",
    };
  }
  const child = spawnSync(argv[0] as string, argv.slice(1), {
    cwd,
    env,
    encoding: "utf8",
    shell: false,
    timeout: timeoutSeconds * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  const tail = singleLine(output.slice(-OUTPUT_TAIL_CHARACTERS));
  const code = (child.error as NodeJS.ErrnoException | undefined)?.code;
  const outcome: CommandOutcome = {
    argv,
    exit: child.status,
    signal: child.signal,
    timedOut: code === "ETIMEDOUT",
    tail,
  };
  if (child.error !== undefined && code !== "ETIMEDOUT") {
    outcome.error = singleLine(String(child.error));
  }
  return outcome;
}

/** The finding for a command that did not prove its criterion, or undefined when it did. */
export function commandFinding(
  criterionId: string,
  outcome: CommandOutcome,
  timeoutSeconds: number,
): string | undefined {
  const shown = JSON.stringify(outcome.argv);
  const tail = outcome.tail === "" ? "no output" : `output tail: ${outcome.tail}`;
  if (outcome.timedOut) {
    return `criterion ${criterionId}: check.command ${shown} timed out after ${String(timeoutSeconds)}s; ${tail}`;
  }
  if (outcome.error !== undefined) {
    return `criterion ${criterionId}: check.command ${shown} was not proven: ${outcome.error}`;
  }
  if (outcome.signal !== null) {
    return `criterion ${criterionId}: check.command ${shown} was terminated by ${outcome.signal}; ${tail}`;
  }
  if (outcome.exit !== 0) {
    return `criterion ${criterionId}: check.command ${shown} exited ${String(outcome.exit)}; ${tail}`;
  }
  return undefined;
}

/** Collapse a block scalar onto one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The composed hazard-review brief's questions (DR-0064): every criterion the
 * phase marks not-testable, which no test or command proves, so the reviewer
 * answers it. The section is emitted even when it is empty, so a zero is seen
 * as a zero rather than as a missing section.
 */
export function renderNotTestableQuestions(phase: Record<string, unknown>): string[] {
  const open = phaseCriteria(phase).filter((criterion) => criterion.notTestable !== undefined);
  const lines: string[] = ["# Not-testable criteria: questions this review answers", ""];
  if (open.length === 0) {
    lines.push("(none: every acceptance criterion of this phase names a check the kernel runs)");
    lines.push("");
    return lines;
  }
  lines.push(
    "The plan marks these criteria not-testable, so no test or command proves them (DR-0064).",
    "Answer each one in `hazard-classes-addressed`, with the criterion id as `class-id`:",
    "`cleared-because` when it holds, `finding` when it does not.",
    "",
  );
  for (const criterion of open) {
    lines.push(`- ${criterion.id}: ${oneLine(criterion.criterion)}`);
    lines.push(`  not-testable: ${oneLine(criterion.notTestable as string)}`);
  }
  lines.push("");
  return lines;
}
