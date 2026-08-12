import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathsIdentifySameObject } from "../path-identity.ts";
import {
  classifyEntry,
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import { comparePins, describePinDifference, takePin } from "./pin.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type { Pin } from "./pin.ts";
import type { GateResult, GateStatus } from "./result.ts";

/**
 * THE SUITE GATE (kernel plan M2, M2-P3).
 *
 * Replaces "the suite is green" with a machine-countable claim: the suite
 * ran as configured, every discovered test file was reported, every
 * registered behavior resolves to a reported test, no behavior registered
 * at the merge base has been deleted, every skip carries a reason, the
 * tree did not change under the run (M2-C-5 pin), and the counts come from
 * a pinned structured stream plus the child's exit code and from nowhere
 * else (C-1).
 *
 * HOW THE SUITE IS RUN. The repository's own `package.json` scripts.test
 * is executed VERBATIM through `/bin/sh -c`, exactly as npm runs it. The
 * gate never parses or reconstructs the script: deciding what another
 * program will do by pattern-matching the text of a file it consumes is
 * the mechanism MECHANISMS.md records four fix rounds for. What npm adds
 * beyond sh -c (node_modules/.bin on PATH, lifecycle hooks) is not
 * reproduced; a test script that depends on either fails LOUDLY here
 * (the reporter stream never appears, which is `error`), never silently.
 *
 * THE REPORTER IS A PINNED, REQUESTED INPUT (M2-P3 step 2, MECHANISMS.md
 * "Parsing another program's reporter output"). Measured on both installed
 * toolchains (v22.22.2 and v26.6.0, work history m2-p3 step 1):
 *
 *   - tap carries NO file attribution for passing tests, so it cannot
 *     support discovery parity or name the missing file;
 *   - junit loses file attribution on nested tests and DROPS raw test
 *     output, so a counterfeit line cannot be captured verbatim from it;
 *   - the documented custom-reporter event stream carries file, name,
 *     nesting, skip (with reason), todo, entity type and failureType for
 *     every test on both toolchains, and delivers raw test output as
 *     test:stdout/test:stderr events whose payload is a JSON string.
 *
 * So the gate pins `tiphys-suite-events-v1`: an NDJSON stream emitted by
 * the reporter module below, embedded as a data: URL so the reporter
 * cannot drift apart from the parser that consumes it. It is REQUESTED
 * explicitly for the child via child-scoped NODE_OPTIONS; the inherited
 * NODE_OPTIONS is deliberately dropped, because an inherited reporter
 * option is precisely the ambient default the pin exists to exclude. The
 * received stream is validated to be this format BEFORE any count is
 * parsed: header first, every line a known event, explicit stream-end
 * trailer last. A stream in any other format, or truncated, is `error`
 * naming the expected and observed formats. Widening the parse to accept
 * whichever format arrived is forbidden.
 *
 * WHY A COUNTERFEIT LINE CANNOT COUNT (C-1, criterion 6). A test body
 * printing "pass 999", or even a byte-exact tiphys event line, arrives as
 * a test:stdout EVENT whose text sits INSIDE a JSON string field, escaped
 * by the reporter's own JSON.stringify. It cannot form an event line, so
 * it cannot reach the arithmetic; it is captured verbatim in the evidence
 * instead. The measured tap contrast is in the work history: there the
 * same bytes land as `# pass 999`, byte-identical in grammar to the real
 * `# pass 3` summary line below it.
 *
 * DISCOVERY PARITY (step 3, PR-106): candidates are enumerated by WALKING
 * the declared test roots for the declared suffix, never by expanding the
 * runner's own selection pattern, because the pattern is the thing that
 * can be wrong and an enumeration sharing it cannot see that. Both
 * directions are enforced: a walked file absent from the reporter and a
 * reported file outside the walk are each parity failures naming the file.
 *
 * M2-C-6: every path this gate reads that it did not create goes through
 * the delivered classifyEntry / readRegularFileIfPresent /
 * refuseOpenForWrite from src/task.ts. The walk probes types before
 * reading names' targets and throws on anything irregular, so a named
 * pipe inside a declared root is `error` naming the path and type, never
 * a hang.
 *
 * CHILD ENVIRONMENT, deterministic by construction: NODE_OPTIONS is
 * replaced (see above) and NODE_TEST_CONTEXT/NODE_TEST_* are removed,
 * because a nested `node --test` that inherits them switches to its
 * child-of-a-runner protocol and reports nothing usable (measured by
 * M1-P6; see test/exit-test-local.test.ts identityLessEnv).
 */

export const SUITE_GATE_ID = "suite";
export const SUITE_UNIT_LABEL = "tests reported";
export const REPORTER_NAME = "tiphys-suite-events-v1";

export const STREAM_FILE = "suite-events.ndjson";
export const STDOUT_FILE = "suite-stdout.txt";
export const STDERR_FILE = "suite-stderr.txt";
export const RAW_OUTPUT_FILE = "suite-raw-output.txt";
export const COUNTS_FILE = "counts.json";

/**
 * The reporter module, verbatim. Pure ESM with no imports, so it can be
 * carried as a data: URL. It emits one JSON object per line: a header
 * naming the format version and the node that ran the suite, one event
 * per test:pass / test:fail / test:stdout / test:stderr, and a stream-end
 * trailer whose absence is how a truncated stream is recognized. Every
 * other event type (test:diagnostic carries the human summary lines this
 * gate is forbidden to read, C-1) is deliberately not emitted.
 *
 * No apostrophes, backticks or spaces-in-tokens beyond what
 * encodeURIComponent escapes: the encoded URL must survive NODE_OPTIONS
 * space-splitting.
 */
const REPORTER_SOURCE =
  "export default async function* tiphysSuiteEventsV1(source) {\n" +
  '  yield JSON.stringify({ tiphysSuiteEvents: 1, node: process.version }) + "\\n";\n' +
  "  for await (const event of source) {\n" +
  "    const type = event.type;\n" +
  '    if (type === "test:pass" || type === "test:fail") {\n' +
  "      const data = event.data === undefined ? {} : event.data;\n" +
  "      const details = data.details === undefined ? {} : data.details;\n" +
  "      const error = details.error;\n" +
  "      yield JSON.stringify({\n" +
  "        event: type,\n" +
  "        name: data.name,\n" +
  "        file: data.file,\n" +
  "        nesting: data.nesting,\n" +
  "        skip: data.skip,\n" +
  "        todo: data.todo,\n" +
  "        entityType: details.type,\n" +
  "        failureType: error === undefined || error === null ? undefined : error.failureType,\n" +
  '      }) + "\\n";\n' +
  '    } else if (type === "test:stdout" || type === "test:stderr") {\n' +
  "      const data = event.data === undefined ? {} : event.data;\n" +
  '      yield JSON.stringify({ event: type, file: data.file, message: data.message }) + "\\n";\n' +
  "    }\n" +
  "  }\n" +
  '  yield JSON.stringify({ event: "stream-end" }) + "\\n";\n' +
  "}\n";

export function reporterDataUrl(): string {
  return `data:text/javascript,${encodeURIComponent(REPORTER_SOURCE)}`;
}

/** One reported test point, decoded from the pinned stream. */
export interface SuitePoint {
  event: "test:pass" | "test:fail";
  name: string;
  file: string;
  nesting: number;
  skip?: boolean | string;
  todo?: boolean | string;
  entityType: "test" | "suite";
  failureType?: string;
}

export interface SuiteStream {
  /** process.version of the node that actually ran the suite. */
  childNode: string;
  points: SuitePoint[];
  /** Raw test output, concatenated in stream order. Evidence, never data. */
  rawOutput: string;
}

export type StreamParse =
  | { ok: true; stream: SuiteStream }
  | { ok: false; reason: string };

const KNOWN_EVENTS = new Set([
  "test:pass",
  "test:fail",
  "test:stdout",
  "test:stderr",
  "stream-end",
]);

function describeObserved(line: string): string {
  const shown = singleLine(line).slice(0, 120);
  return shown === "" ? "an empty line" : `"${shown}"`;
}

/**
 * Validate that `body` is a tiphys-suite-events-v1 stream and decode it.
 * The format is checked BEFORE any count is derived; a stream in another
 * format, however valid in its own grammar, is a refusal naming both
 * formats, never a widened parse.
 */
export function parseSuiteStream(body: string): StreamParse {
  const failure = (reason: string): StreamParse => ({ ok: false, reason });
  if (body === "") {
    return failure(
      `expected the pinned reporter format ${REPORTER_NAME}; observed an empty stream`,
    );
  }
  const lines = body.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  const first = lines[0] ?? "";
  let header: unknown;
  try {
    header = JSON.parse(first);
  } catch {
    return failure(
      `expected the pinned reporter format ${REPORTER_NAME} (header line); observed ${describeObserved(first)}`,
    );
  }
  const headerObject = header as { tiphysSuiteEvents?: unknown; node?: unknown };
  if (
    typeof header !== "object" ||
    header === null ||
    Array.isArray(header) ||
    headerObject.tiphysSuiteEvents !== 1 ||
    typeof headerObject.node !== "string"
  ) {
    return failure(
      `expected the pinned reporter format ${REPORTER_NAME} (header line); observed ${describeObserved(first)}`,
    );
  }
  const points: SuitePoint[] = [];
  let rawOutput = "";
  let ended = false;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (ended) {
      return failure(
        `stream line ${String(index + 1)} follows the stream-end trailer: ${describeObserved(line)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return failure(
        `stream line ${String(index + 1)} is not a ${REPORTER_NAME} event: ${describeObserved(line)}`,
      );
    }
    const event = parsed as {
      event?: unknown;
      name?: unknown;
      file?: unknown;
      nesting?: unknown;
      skip?: unknown;
      todo?: unknown;
      entityType?: unknown;
      failureType?: unknown;
      message?: unknown;
    };
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof event.event !== "string" ||
      !KNOWN_EVENTS.has(event.event)
    ) {
      return failure(
        `stream line ${String(index + 1)} is not a ${REPORTER_NAME} event: ${describeObserved(line)}`,
      );
    }
    if (event.event === "stream-end") {
      ended = true;
      continue;
    }
    if (event.event === "test:stdout" || event.event === "test:stderr") {
      if (typeof event.message !== "string") {
        return failure(
          `stream line ${String(index + 1)} is a ${event.event} event without a string message`,
        );
      }
      rawOutput += event.message;
      continue;
    }
    const pointEvent = event.event === "test:pass" ? "test:pass" : "test:fail";
    if (
      typeof event.name !== "string" ||
      typeof event.file !== "string" ||
      typeof event.nesting !== "number" ||
      (event.entityType !== "test" && event.entityType !== "suite")
    ) {
      return failure(
        `stream line ${String(index + 1)} is a ${event.event} event missing name, file, nesting or entityType`,
      );
    }
    const point: SuitePoint = {
      event: pointEvent,
      name: event.name,
      file: event.file,
      nesting: event.nesting,
      entityType: event.entityType,
    };
    if (typeof event.skip === "boolean" || typeof event.skip === "string") {
      point.skip = event.skip;
    }
    if (typeof event.todo === "boolean" || typeof event.todo === "string") {
      point.todo = event.todo;
    }
    if (typeof event.failureType === "string") {
      point.failureType = event.failureType;
    }
    points.push(point);
  }
  if (!ended) {
    return failure(
      `the ${REPORTER_NAME} stream is truncated: the stream-end trailer is absent, so the run cannot be` +
        " known to have reported every test",
    );
  }
  return {
    ok: true,
    stream: { childNode: headerObject.node, points, rawOutput },
  };
}

/**
 * THE MAPPING, recorded here once and restated in every counts.json
 * (M2-P3 step 6, M2R-022). Buckets are mutually exclusive and each
 * reported test lands in exactly one:
 *
 *   skipped     the point carries a skip marker (reason or bare)
 *   todo        not skipped, carries a todo marker
 *   didNotRun   test:fail with failureType cancelledByParent; this is the
 *               one shape node itself counted under "# cancelled" in the
 *               same measured run (work history step 1 finding 7). Every
 *               other failureType, including testTimeoutFailure, ran and
 *               failed, which is `fail`.
 *   fail        any other test:fail
 *   pass        any other test:pass
 *
 * `reported` counts points whose entityType is `test`, which reproduces
 * node's own "# tests" semantics for every REAL test (measured: suites
 * are not tests). This does NOT hold for a file that defines zero tests:
 * node still emits one nesting-0 test:pass for it, entityType `test`,
 * named after the file's own invocation path (CR-1306, fixed below by
 * `isFileWrapperPhantom`; a prior version of this comment asserted the
 * false generalization "file wrappers emit no pass/fail"). The identity
 * pass + fail + skipped + todo + didNotRun == reported is asserted, and
 * `discovered` is the independent walk's file set, tied to `reported` by
 * the file-set equality check rather than by unit-mixing arithmetic.
 */
export const MAPPING_STATEMENT =
  "pass, fail and skipped map directly; cancelledByParent carries did-not-run; " +
  "todo is recorded and counted as its own bucket; discovered is the independent " +
  "walk of the declared roots for the declared suffix, never the reporter's total; " +
  "identity: pass + fail + skipped + todo + did-not-run == reported";

/**
 * CR-1306: a `.test.ts` file that defines ZERO tests is not silent. Node
 * itself (measured on v22.22.2 and v26.6.0, both directions of the glob
 * the repo's own test script uses) still emits exactly one nesting-0
 * test:pass point for such a file, entityType `test`, whose `name` is the
 * file's own path exactly AS IT WAS INVOKED. Counting that point as
 * `entityType === "test"` like every other reported point (the mechanism
 * `bucketPoints` and the discovery/registry filters below all shared)
 * inflates `units` by one per emptied file, and because `units > 0` the
 * M2-C-2 "never green by omission" rewrite in result.ts never triggers:
 * a suite that ran zero real tests would report green.
 *
 * A real top-level test is ALSO nesting 0 and entityType `test` (measured:
 * `describe()` wrappers are entityType `suite` and never collide), so
 * nesting and entityType alone cannot distinguish the phantom from a real
 * test. The one further fact that does, and the only one node offers, is
 * the point's own name coinciding exactly with its file's identity; a real
 * test can only produce that collision by deliberately naming itself after
 * its own file, which this function accepts as the residual, documented
 * non-coverage (see delivery/work-history/m2-p3.md fix round one
 * derivation).
 *
 * CR-1410-1 (fix round two): the string this coincidence is compared
 * against MUST be spelling-invariant, not one particular spelling. Round
 * one compared `point.name === relative(cwd, point.file)`, which is a
 * comparison between two DIFFERENT strings whenever the invocation spells
 * the path other than relative-to-cwd; node names the phantom by the
 * file's path exactly as invoked (measured, both toolchains, fix round two
 * derivation in delivery/work-history/m2-p3.md step "fix round two"):
 * relative glob, bare auto-discovery and a `./`-prefixed path all name it
 * relatively, but an ABSOLUTE-path invocation names it absolutely, and
 * `relative(cwd, point.file)` is always relative, so the comparison misses
 * that spelling and the phantom is counted as a real test again -- the
 * exact CR-1306 defect through a different spelling, and the gate cannot
 * control the spelling because it reads the target repo's `scripts.test`
 * verbatim (see the file header). The fix compares two REPRESENTATIONS OF
 * THE SAME FILE instead of two spellings of a path: `resolve(cwd,
 * point.name)` normalizes whatever spelling `name` carries (relative,
 * `./`-prefixed, or already absolute -- `resolve` returns an absolute
 * argument unchanged, measured) into the same absolute string `point.file`
 * already is, so the equality is invariant across every spelling node
 * produces it in, by construction rather than by enumeration.
 *
 * The fix filters the phantom out before ANY of the three counting sites
 * that read `entityType === "test"` (bucketPoints, the discovery-parity
 * reportedFiles set, and the registry-resolution reportedTestNames set) so
 * an emptied file is not silently miscounted as a passing test; it instead
 * falls out of `reportedFiles`, which the existing discovery-parity check
 * (step 3, unchanged) already reports as "test file discovered by the walk
 * but absent from the reporter" -- a red finding, never a counted green.
 */
export function isFileWrapperPhantom(point: SuitePoint, cwd: string): boolean {
  return (
    point.entityType === "test" &&
    point.nesting === 0 &&
    resolve(cwd, point.name) === point.file
  );
}

export interface SuiteCounts {
  reported: number;
  pass: number;
  fail: number;
  skipped: number;
  todo: number;
  didNotRun: number;
}

export function bucketPoints(points: SuitePoint[]): {
  counts: SuiteCounts;
  skipsWithoutReason: SuitePoint[];
  failures: SuitePoint[];
  cancelled: SuitePoint[];
} {
  const counts: SuiteCounts = {
    reported: 0,
    pass: 0,
    fail: 0,
    skipped: 0,
    todo: 0,
    didNotRun: 0,
  };
  const skipsWithoutReason: SuitePoint[] = [];
  const failures: SuitePoint[] = [];
  const cancelled: SuitePoint[] = [];
  for (const point of points) {
    if (point.entityType !== "test") {
      continue;
    }
    counts.reported += 1;
    const skipped = point.skip !== undefined && point.skip !== false;
    const todo = point.todo !== undefined && point.todo !== false;
    if (skipped) {
      counts.skipped += 1;
      const reason = typeof point.skip === "string" ? point.skip.trim() : "";
      if (reason === "") {
        skipsWithoutReason.push(point);
      }
      continue;
    }
    if (todo) {
      counts.todo += 1;
      continue;
    }
    if (point.event === "test:fail") {
      if (point.failureType === "cancelledByParent") {
        counts.didNotRun += 1;
        cancelled.push(point);
      } else {
        counts.fail += 1;
        failures.push(point);
      }
      continue;
    }
    counts.pass += 1;
  }
  return { counts, skipsWithoutReason, failures, cancelled };
}

/**
 * Walk one declared root for files carrying the declared suffix. The walk
 * never expands the runner's selection pattern; the roots and suffix are
 * the declaration, and the walk is exhaustive under them. Fail closed on
 * anything that is not a regular file or a real directory (M2-C-6): a
 * named pipe inside a test root makes the gate `error`, never a hang.
 */
export function walkTestFiles(root: string, suffix: string): string[] {
  const found: string[] = [];
  const rootEntry = classifyEntry(root);
  if (rootEntry.kind === "absent" || rootEntry.kind === "dangling") {
    throw new Error(`declared test root ${root} does not exist`);
  }
  if (rootEntry.kind === "regular") {
    throw new Error(`declared test root ${root} is a regular file, not a directory`);
  }
  if (rootEntry.kind === "unexaminable") {
    throw new Error(rootEntry.reason);
  }
  // "irregular" covers real directories along with everything else that is
  // not a regular file; only a REAL directory (never a symlink to one, the
  // same rule pin.ts walks by) may be walked.
  if (!lstatSync(root).isDirectory()) {
    throw new Error(
      `${rootEntry.reason}; a declared test root must be a real directory`,
    );
  }
  const walk = (dir: string): void => {
    const names = readdirSync(dir).sort();
    for (const name of names) {
      const path = join(dir, name);
      let isDirectory = false;
      try {
        isDirectory = lstatSync(path).isDirectory();
      } catch {
        isDirectory = false;
      }
      if (isDirectory) {
        walk(path);
        continue;
      }
      const entry = classifyEntry(path);
      if (entry.kind === "absent" || entry.kind === "dangling") {
        continue;
      }
      if (entry.kind !== "regular") {
        throw new Error(`${entry.reason}; refusing to walk ${root}`);
      }
      if (name.endsWith(suffix)) {
        found.push(path);
      }
    }
  };
  walk(root);
  return found.sort();
}

interface Flags {
  result?: string;
  evidence?: string;
  base?: string;
  head?: string;
  registry: string;
  testRoots: string[];
  pinRoots: string[];
  suffix: string;
}

const USAGE =
  "usage: node src/gates/suite.ts --result <file> --evidence <dir> --base <ref> " +
  "[--head <ref>] [--test-root <dir>]... [--pin-root <dir>]... " +
  "[--suffix <s>] [--registry <path>]";

function parseFlags(args: string[]): Flags | string {
  const flags: Flags = {
    registry: "test/behaviors.json",
    testRoots: [],
    pinRoots: [],
    suffix: ".test.ts",
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      flag === undefined ||
      ![
        "--result",
        "--evidence",
        "--base",
        "--head",
        "--test-root",
        "--pin-root",
        "--suffix",
        "--registry",
      ].includes(flag)
    ) {
      return `unknown flag ${flag ?? ""}`;
    }
    if (value === undefined || value.startsWith("--")) {
      return `${flag} requires a value`;
    }
    if (flag === "--result") {
      flags.result = value;
    } else if (flag === "--evidence") {
      flags.evidence = value;
    } else if (flag === "--base") {
      flags.base = value;
    } else if (flag === "--head") {
      flags.head = value;
    } else if (flag === "--test-root") {
      flags.testRoots.push(value);
    } else if (flag === "--pin-root") {
      flags.pinRoots.push(value);
    } else if (flag === "--suffix") {
      flags.suffix = value;
    } else {
      flags.registry = value;
    }
    index += 1;
  }
  if (flags.testRoots.length === 0) {
    flags.testRoots.push("test");
  }
  if (flags.pinRoots.length === 0) {
    flags.pinRoots.push("src", "test");
  }
  return flags;
}

function now(): string {
  return new Date().toISOString();
}

function git(
  cwd: string,
  args: string[],
): { ok: true; stdout: string } | { ok: false; reason: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} exited ${String(result.status)}: ${singleLine(result.stderr ?? "")}`,
    };
  }
  return { ok: true, stdout: result.stdout ?? "" };
}

type RegistryRead =
  | { ok: true; registry: Record<string, string> }
  | { ok: false; reason: string };

function parseRegistry(body: string, what: string): RegistryRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      reason: `${what} does not parse as JSON: ${(error as Error).message}`,
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `${what} is not a JSON object` };
  }
  const registry: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      return {
        ok: false,
        reason: `${what} entry ${key} is not a string description`,
      };
    }
    registry[key] = value;
  }
  return { ok: true, registry };
}

/** NODE_OPTIONS values survive space-splitting only for these characters. */
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;

interface Emit {
  status: GateStatus;
  units: number;
  detail: string;
  evidence: string[];
  pin?: { start: Pin; end: Pin };
}

export function runSuiteGate(argv: string[]): number {
  const flags = parseFlags(argv);
  if (typeof flags === "string") {
    process.stderr.write(`tiphys suite gate: ${flags}\n${USAGE}\n`);
    return 64;
  }
  if (flags.result === undefined || flags.evidence === undefined) {
    process.stderr.write(
      `tiphys suite gate: --result and --evidence are required\n${USAGE}\n`,
    );
    return 64;
  }
  const resultPath = resolve(flags.result);
  const evidenceDir = resolve(flags.evidence);
  const startedAt = now();
  const cwd = process.cwd();

  const emit = (fields: Emit): number => {
    const result: GateResult = makeGateResult({
      gate: SUITE_GATE_ID,
      status: fields.status,
      units: fields.units,
      unitLabel: SUITE_UNIT_LABEL,
      startedAt,
      endedAt: now(),
      detail: singleLine(fields.detail),
      evidence: fields.evidence,
      ...(fields.pin === undefined ? {} : { pin: fields.pin }),
    });
    const refusal = refuseOpenForWrite(resultPath);
    if (refusal !== undefined) {
      process.stderr.write(`tiphys suite gate: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    const written = runStep(`writing ${resultPath}`, () =>
      writeFileSync(resultPath, renderGateResult(result)),
    );
    if (!written.ok) {
      process.stderr.write(`tiphys suite gate: ${written.reason}\n`);
      return EXIT_GATE_ERROR;
    }
    process.stdout.write(
      `${SUITE_GATE_ID}: ${result.status} (${String(result.units)} ${SUITE_UNIT_LABEL})\n`,
    );
    if (result.detail !== "") {
      process.stdout.write(`${result.detail}\n`);
    }
    return exitCodeForStatus(result.status);
  };
  const error = (detail: string, evidence: string[] = []): number =>
    emit({ status: "error", units: 0, detail, evidence });

  // --base is a REQUIRED run parameter: without it the merge-base registry
  // comparison cannot be performed, and a check that cannot reach a verdict
  // is error, never not-applicable and never green (M2-C-3, criterion 9).
  if (flags.base === undefined) {
    return error(
      "--base was not supplied; the merge-base registry comparison cannot be performed (M2-C-3)",
    );
  }
  if (isAbsolute(flags.registry)) {
    return error(
      `registry path ${flags.registry} must be repository-relative so the merge-base copy can be resolved`,
    );
  }

  // Evidence directory: create it if needed, refusing any irregular entry.
  const evidenceEntry = classifyEntry(evidenceDir);
  if (evidenceEntry.kind === "regular") {
    return error(`${evidenceDir} is a regular file, not a directory`);
  }
  if (evidenceEntry.kind === "unexaminable") {
    return error(evidenceEntry.reason);
  }
  let evidenceIsDirectory = false;
  try {
    evidenceIsDirectory = lstatSync(evidenceDir).isDirectory();
  } catch {
    evidenceIsDirectory = false;
  }
  if (evidenceEntry.kind === "irregular" && !evidenceIsDirectory) {
    return error(evidenceEntry.reason);
  }
  const made = runStep(`creating ${evidenceDir}`, () =>
    mkdirSync(evidenceDir, { recursive: true }),
  );
  if (!made.ok) {
    return error(made.reason);
  }

  // The configured test command, executed verbatim and never interpreted.
  const packageJsonPath = join(cwd, "package.json");
  const packageRead = readRegularFileIfPresent(packageJsonPath);
  if (packageRead.kind === "absent") {
    return error(`${packageJsonPath} does not exist`);
  }
  if (packageRead.kind === "refused") {
    return error(packageRead.reason);
  }
  let packageParsed: unknown;
  try {
    packageParsed = JSON.parse(packageRead.body);
  } catch (caught) {
    return error(
      `${packageJsonPath} does not parse as JSON: ${(caught as Error).message}`,
    );
  }
  const script = (packageParsed as { scripts?: { test?: unknown } }).scripts?.test;
  if (typeof script !== "string" || script.trim() === "") {
    return error(
      `${packageJsonPath} declares no test script; the suite cannot be run as configured`,
    );
  }

  // Merge base and the two registry copies.
  const mergeBase = git(cwd, ["merge-base", flags.base, "HEAD"]);
  if (!mergeBase.ok) {
    return error(
      `the merge base of ${flags.base} and HEAD could not be resolved: ${mergeBase.reason}`,
    );
  }
  const mergeBaseSha = mergeBase.stdout.trim();
  const headRegistryRead = readRegularFileIfPresent(join(cwd, flags.registry));
  if (headRegistryRead.kind === "absent") {
    return error(`behavior registry ${flags.registry} does not exist at HEAD`);
  }
  if (headRegistryRead.kind === "refused") {
    return error(headRegistryRead.reason);
  }
  const headRegistry = parseRegistry(
    headRegistryRead.body,
    `behavior registry ${flags.registry}`,
  );
  if (!headRegistry.ok) {
    return error(headRegistry.reason);
  }
  const baseListing = git(cwd, ["ls-tree", mergeBaseSha, "--", flags.registry]);
  if (!baseListing.ok) {
    return error(baseListing.reason);
  }
  let baseRegistry: Record<string, string> = {};
  let baseRegistryPresent = false;
  if (baseListing.stdout.trim() !== "") {
    const baseBody = git(cwd, ["show", `${mergeBaseSha}:${flags.registry}`]);
    if (!baseBody.ok) {
      return error(baseBody.reason);
    }
    const parsedBase = parseRegistry(
      baseBody.stdout,
      `merge-base behavior registry ${mergeBaseSha}:${flags.registry}`,
    );
    if (!parsedBase.ok) {
      return error(parsedBase.reason);
    }
    baseRegistry = parsedBase.registry;
    baseRegistryPresent = true;
  }

  // Independent discovery walk (step 3).
  let discoveredFiles: string[];
  try {
    discoveredFiles = flags.testRoots.flatMap((root) =>
      walkTestFiles(resolve(cwd, root), flags.suffix),
    );
    discoveredFiles.sort();
  } catch (caught) {
    return error(singleLine((caught as Error).message));
  }

  // Reporter stream destination, probed and cleared BEFORE the child
  // exists: a named pipe here would block the child harness in the kernel
  // and this gate behind it (M2-C-6).
  const streamPath = join(evidenceDir, STREAM_FILE);
  if (!SAFE_PATH.test(streamPath)) {
    return error(
      `evidence path ${streamPath} contains characters that cannot be carried through NODE_OPTIONS safely`,
    );
  }
  const streamRefusal = refuseOpenForWrite(streamPath);
  if (streamRefusal !== undefined) {
    return error(streamRefusal);
  }
  const cleared = runStep(`clearing ${streamPath}`, () =>
    rmSync(streamPath, { force: true }),
  );
  if (!cleared.ok) {
    return error(cleared.reason);
  }

  // Start pin, child run, end pin (M2-C-5).
  let startPin: Pin;
  try {
    startPin = takePin(flags.pinRoots.map((root) => resolve(cwd, root)));
  } catch (caught) {
    return error(singleLine((caught as Error).message));
  }
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // NODE_OPTIONS: an inherited reporter option is the ambient default the
    // pin exists to exclude. NODE_TEST_*: a nested `node --test` inheriting
    // NODE_TEST_CONTEXT switches to its child-of-a-runner protocol.
    if (value !== undefined && key !== "NODE_OPTIONS" && !key.startsWith("NODE_TEST")) {
      childEnv[key] = value;
    }
  }
  childEnv["NODE_OPTIONS"] =
    `--test-reporter=${reporterDataUrl()} --test-reporter-destination=${streamPath}`;
  const child = spawnSync("/bin/sh", ["-c", script], {
    cwd,
    encoding: "utf8",
    env: childEnv,
    maxBuffer: 64 * 1024 * 1024,
  });
  let endPin: Pin;
  try {
    endPin = takePin(flags.pinRoots.map((root) => resolve(cwd, root)));
  } catch (caught) {
    return error(singleLine((caught as Error).message));
  }
  const pin = { start: startPin, end: endPin };

  const evidence: string[] = [];
  const writeEvidence = (name: string, body: string): string | undefined => {
    const path = join(evidenceDir, name);
    const refusal = refuseOpenForWrite(path);
    if (refusal !== undefined) {
      return refusal;
    }
    const written = runStep(`writing ${path}`, () => writeFileSync(path, body));
    if (!written.ok) {
      return written.reason;
    }
    evidence.push(name);
    return undefined;
  };
  const stdoutRefusal = writeEvidence(STDOUT_FILE, child.stdout ?? "");
  const stderrRefusal = writeEvidence(STDERR_FILE, child.stderr ?? "");
  const captureRefusal = stdoutRefusal ?? stderrRefusal;
  if (captureRefusal !== undefined) {
    return error(captureRefusal, evidence);
  }

  if (child.error !== undefined) {
    return error(
      `the configured test command could not be run: ${singleLine(String(child.error))}`,
      evidence,
    );
  }
  if (child.signal !== null && child.signal !== undefined) {
    return error(
      `the configured test command was terminated by ${child.signal}`,
      evidence,
    );
  }
  const childExit = child.status ?? -1;

  // The stream, read and validated as the pinned format before any count.
  const streamRead = readRegularFileIfPresent(streamPath);
  if (streamRead.kind === "absent") {
    return error(
      `the configured test command (${singleLine(script)}) exited ${String(childExit)} without producing ` +
        `the requested ${REPORTER_NAME} reporter stream at ${STREAM_FILE}`,
      evidence,
    );
  }
  if (streamRead.kind === "refused") {
    return error(streamRead.reason, evidence);
  }
  evidence.push(STREAM_FILE);
  const parsed = parseSuiteStream(streamRead.body);
  if (!parsed.ok) {
    return error(parsed.reason, evidence);
  }
  const stream = parsed.stream;
  const rawRefusal = writeEvidence(RAW_OUTPUT_FILE, stream.rawOutput);
  if (rawRefusal !== undefined) {
    return error(rawRefusal, evidence);
  }

  // CR-1306: strip a file-wrapper phantom (a file that defined zero tests)
  // BEFORE any of the three sites below reads entityType === "test", so an
  // emptied file cannot inflate `reported` and cannot slip past M2-C-2 as
  // a counted green; see isFileWrapperPhantom's derivation above.
  const points = stream.points.filter((point) => !isFileWrapperPhantom(point, cwd));

  // M2-C-5: any pin difference makes the record error, whatever the counts
  // said, because a run over a tree that changed names nothing.
  const pinDifferences = comparePins(startPin, endPin);
  if (pinDifferences.length > 0) {
    return emit({
      status: "error",
      units: 0,
      detail:
        "M2-C-5: the tree changed during the run: " +
        pinDifferences.map(describePinDifference).join("; "),
      evidence,
      pin,
    });
  }

  const { counts, skipsWithoutReason, failures, cancelled } = bucketPoints(
    points,
  );
  const identity =
    counts.pass + counts.fail + counts.skipped + counts.todo + counts.didNotRun;
  if (identity !== counts.reported) {
    return emit({
      status: "error",
      units: 0,
      detail:
        `internal inconsistency: bucket sum ${String(identity)} does not equal reported ` +
        `${String(counts.reported)} (${JSON.stringify(counts)})`,
      evidence,
      pin,
    });
  }

  // Exit-code truth (step 8), cross-checked against the structured stream.
  if (childExit === 0 && counts.fail + counts.didNotRun > 0) {
    return emit({
      status: "error",
      units: 0,
      detail:
        `the test command exited 0 while the stream reports ${String(counts.fail)} failing and ` +
        `${String(counts.didNotRun)} did-not-run test(s); the two authorities disagree`,
      evidence,
      pin,
    });
  }
  if (childExit !== 0 && counts.fail + counts.didNotRun === 0) {
    return emit({
      status: "error",
      units: 0,
      detail:
        `the test command exited ${String(childExit)} with no failing test in the stream; ` +
        "the suite did not complete for a reason the stream does not carry",
      evidence,
      pin,
    });
  }

  // Discovery parity, both directions (step 3).
  const reportedFiles = [
    ...new Set(
      points
        .filter((point) => point.entityType === "test")
        .map((point) => point.file),
    ),
  ].sort();
  const discoveredSet = new Set(discoveredFiles);
  const reportedSet = new Set(reportedFiles);
  const findings: string[] = [];
  for (const file of discoveredFiles) {
    if (!reportedSet.has(file)) {
      findings.push(
        `test file discovered by the walk but absent from the reporter: ${relative(cwd, file)}`,
      );
    }
  }
  for (const file of reportedFiles) {
    if (!discoveredSet.has(file)) {
      findings.push(
        `test file reported but outside the declared roots and suffix: ${relative(cwd, file)}`,
      );
    }
  }

  // Registry resolution and merge-base preservation (step 4).
  const reportedTestNames = new Set(
    points
      .filter((point) => point.entityType === "test")
      .map((point) => point.name),
  );
  for (const [behavior, description] of Object.entries(headRegistry.registry)) {
    if (!reportedTestNames.has(description)) {
      findings.push(
        `behavior ${behavior} does not resolve: no reported test is named "${description}"`,
      );
    }
  }
  for (const behavior of Object.keys(baseRegistry)) {
    if (!(behavior in headRegistry.registry)) {
      findings.push(
        `behavior ${behavior} is registered at the merge base (${mergeBaseSha.slice(0, 12)}) ` +
          "and deleted from the head registry",
      );
    }
  }

  // Skip accounting (step 5, EXT-F-05 executable form).
  for (const point of skipsWithoutReason) {
    findings.push(
      `skipped without a reason: "${point.name}" (${relative(cwd, point.file)})`,
    );
  }

  for (const point of failures) {
    findings.push(`failing test: "${point.name}" (${relative(cwd, point.file)})`);
  }
  for (const point of cancelled) {
    findings.push(
      `did-not-run test: "${point.name}" (${relative(cwd, point.file)})`,
    );
  }

  const countsDocument = {
    gate: SUITE_GATE_ID,
    requestedReporter: REPORTER_NAME,
    reporterRequestedVia:
      "child-scoped NODE_OPTIONS --test-reporter=data:... --test-reporter-destination",
    childNode: stream.childNode,
    gateNode: process.version,
    testScript: script,
    shell: "/bin/sh",
    base: flags.base,
    mergeBase: mergeBaseSha,
    testRoots: flags.testRoots,
    suffix: flags.suffix,
    pinRoots: flags.pinRoots,
    mapping: MAPPING_STATEMENT,
    counts: {
      ...counts,
      discoveredFiles: discoveredFiles.length,
      reportedFiles: reportedFiles.length,
      behaviors: Object.keys(headRegistry.registry).length,
      mergeBaseBehaviors: Object.keys(baseRegistry).length,
    },
    baseRegistryPresent,
    childExit,
    discovered: discoveredFiles.map((file) => relative(cwd, file)),
    reported: reportedFiles.map((file) => relative(cwd, file)),
    findings,
  };
  const countsRefusal = writeEvidence(
    COUNTS_FILE,
    `${JSON.stringify(countsDocument, null, 2)}\n`,
  );
  if (countsRefusal !== undefined) {
    return error(countsRefusal, evidence);
  }

  if (findings.length > 0) {
    const shown = findings.slice(0, 10);
    const more =
      findings.length > shown.length
        ? `; and ${String(findings.length - shown.length)} more (see ${COUNTS_FILE})`
        : "";
    return emit({
      status: "red",
      units: counts.reported,
      detail: `${String(findings.length)} finding(s): ${shown.join("; ")}${more}`,
      evidence,
      pin,
    });
  }

  return emit({
    status: "green",
    units: counts.reported,
    detail:
      `suite green via ${REPORTER_NAME} (child node ${stream.childNode}): reported ${String(counts.reported)} ` +
      `test(s) from ${String(reportedFiles.length)} file(s) (pass ${String(counts.pass)}, fail 0, ` +
      `skipped ${String(counts.skipped)}, todo ${String(counts.todo)}, did-not-run 0); ` +
      `discovered ${String(discoveredFiles.length)} file(s) walking ${flags.testRoots.join(", ")} ` +
      `for ${flags.suffix}; ${String(Object.keys(headRegistry.registry).length)} behavior(s) resolve; ` +
      `merge base ${mergeBaseSha.slice(0, 12)}`,
    evidence,
    pin,
  });
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathsIdentifySameObject(fileURLToPath(import.meta.url), process.argv[1]);

if (invokedDirectly) {
  process.exit(runSuiteGate(process.argv.slice(2)));
}
