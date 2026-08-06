import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script, createContext } from "node:vm";
import {
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import { loadSchema, validate } from "./validate.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type { GateStatus } from "./result.ts";
import type { SchemaDocument } from "./validate.ts";

/**
 * THE COVERAGE CHECKER (kernel plan M2, M2-P6).
 *
 * "No orphans" as a check with an exit code: every id in an INVENTORY
 * document lands in exactly one row of a COVERAGE-TABLE document, a bucket
 * value that does not match a declared kind is named rather than silently
 * uncounted, a bucket kind that requires a note (`parked`) is red when the
 * note is empty, and a coverage-table row whose id is absent from the
 * inventory (a renumbering) is named as phantom coverage.
 *
 * HAZARD CLASS (T-007, M2-D-18): arithmetic over two documents that can
 * drift, where a total can add up while a row is lost. Named defenses,
 * each tied to a criterion:
 *
 *   - a renumbering that leaves a bucket row pointing at a dead id: the
 *     PHANTOM check (every coverage-table row's id is required to be in
 *     the inventory), independent of the orphan check (every inventory id
 *     is required to have a coverage-table row).
 *   - a duplicated id INSIDE the inventory document itself (fix round 1,
 *     CR-985): counted once as a unit is not the same claim as "appears
 *     once in the text", so `units` is the count of DISTINCT ids and a
 *     repeated id is its own named finding (`duplicate-inventory-id`),
 *     symmetric with the coverage side's `double-bucketed` check.
 *     **CORRECTED CLAIM (fix round 1): an earlier revision of this comment
 *     said the orphan and phantom checks "scan in opposite directions on
 *     purpose, so neither can compensate for the other's blind spot." That
 *     was false for cardinality: a duplicated inventory id defeated BOTH
 *     of them (it is not an orphan, because a coverage row exists; it is
 *     not phantom, because the id is genuinely in the inventory), and
 *     inflated every count while staying green. The true property is
 *     narrower: orphan and phantom together catch every EXISTENCE
 *     mismatch (an id present on one side and not the other); cardinality
 *     mismatches (an id present more than once on one side) need the
 *     separate check named above, and a row lost from BOTH documents
 *     needs the `expectedUnits` check below, because the two documents
 *     still agree with each other in that case and existence/cardinality
 *     checks over agreeing documents find nothing.
 *   - a row lost from BOTH documents (fix round 1, CR-986): the previous
 *     bullet's residue. An optional `expectedUnits` config field states
 *     the anchor no arithmetic over the two documents alone can produce;
 *     a computed unit count that does not equal it is the
 *     `expected-units-mismatch` finding. This repository's real config
 *     sets it to 115 (kernel plan v1 Appendix A's stated total).
 *   - a bucket value matching no declared kind, silently uncounted: every
 *     bucket-kind pattern is compiled ANCHORED (`^(?:pattern)$`) and tested
 *     against the whole cell; a value none of them match is the
 *     `unknown-kind` finding, named by id and value, never absorbed into a
 *     nearby kind by a partial match.
 *   - a bucket value matching MORE than one declared kind (fix round 1,
 *     CR-992): resolved by silent first-match-wins until this round; now
 *     the `ambiguous-kind` finding, naming every kind that matched, rather
 *     than one kind's `requiresNote` silently never being consulted.
 *   - an empty inventory producing a green with nothing examined: `units`
 *     is always the number of DISTINCT ids the inventory actually
 *     produced, and this module never constructs a `GateResult` except
 *     through `makeGateResult`, whose M2-C-2 rewrite turns a
 *     green-with-zero-units record into `error` with `vacuous: true`.
 *     This gate does not duplicate that rule; it relies on the shared
 *     constructor the way M2-C-6 requires reuse of `classifyEntry` rather
 *     than a second implementation of "may this path be read".
 *   - a milestone extraction that cannot produce the totals the plan
 *     states: the milestone view and the kind view are two INDEPENDENT
 *     tallies computed from the same classification pass (`perKind` keyed
 *     by the bucket kind's name, `perMilestone` keyed by the pattern's
 *     first capture group when present, else by the kind's own name), so
 *     the two views can be compared against each other and against the
 *     plan's stated totals rather than one being asserted to imply the
 *     other.
 *   - a finding whose outcome cell is present but empty:
 *     `checkFindingOutcomeParity` treats an empty outcome as a named
 *     failure distinct from a missing row, so "the row exists" and "the
 *     row says something" are not conflated. Fix round 1, CR-987: "empty"
 *     is ONE shared predicate (`isEmptyCell`, below), applied wherever a
 *     note or an outcome is tested, so whitespace-only and zero-width-only
 *     content (U+200B, which `String.prototype.trim` does not strip) is
 *     empty on both sides rather than only where a trim happened to run.
 *   - a finding-to-outcome report carrying a PHANTOM outcome (fix round 1,
 *     CR-988): `checkFindingOutcomeParity` used to scan inventory ids
 *     only, so a report row for an id absent from the inventory (the
 *     renumbering shape the coverage side's phantom check exists for) was
 *     silently accepted. Now symmetric: a phantom outcome row is named.
 *
 * M2-C-6: the inventory path, the coverage-table path and an optional
 * `--config` document are all supplied by configuration and none of them
 * is a path this module created, so every read goes through
 * `readRegularFileIfPresent` (which itself routes through `classifyEntry`),
 * never a bare `readFileSync`. A named pipe at any of the three paths is
 * `error` naming the path and the observed type, and this module never
 * blocks on one. Fix round 1, CR-989: the same discipline now applies to
 * the WRITE side inside the evidence directory (`counts.json`): a refused
 * or failed write there used to be computed and discarded, leaving a
 * silent green with empty evidence; it is now loud and makes the gate
 * `error`, the same way a refused result-path write already did.
 *
 * Fix round 1 also closes the REGEX MECHANISM (CR-990/991/992): every
 * config-supplied pattern (both `idPattern`s and every `bucketKinds[].pattern`)
 * is VALIDATED (compiles, and is rejected if it matches a known
 * catastrophic-backtracking shape) before it is ever executed, and every
 * EXECUTION of a config-supplied pattern is BOUNDED by a wall-clock timeout
 * (`boundedExec`, below), so neither a malformed pattern (CR-990, used to
 * throw with no result record written) nor a ReDoS pattern (CR-991, used
 * to hang indefinitely) can defeat this gate; CR-992 (overlapping kinds)
 * is folded into the same fix because it is the same "a config string is
 * trusted further than its syntax justifies" mechanism one property over.
 */

/** One row of the `bucketKinds` config. */
export interface BucketKindConfig {
  kind: string;
  /** Regex source, compiled anchored `^(?:pattern)$` against a bucket value. */
  pattern: string;
  requiresNote: boolean;
}

export interface DocumentConfig {
  path: string;
  /** Regex source, compiled anchored, tested against a row's first cell. */
  idPattern: string;
}

export interface CoverageTableConfig extends DocumentConfig {
  /** 0-based cell index (cell 0 is the id) holding the bucket value. */
  bucketColumn: number;
  /** 0-based cell index holding the note. */
  noteColumn: number;
}

export interface CoverageConfig {
  inventory: DocumentConfig;
  coverageTable: CoverageTableConfig;
  bucketKinds: BucketKindConfig[];
  /**
   * CR-986: the exact expected count of DISTINCT inventory ids. Optional;
   * when absent, no floor is enforced. A row deleted from BOTH documents
   * leaves the two documents agreeing with each other, which every other
   * check in this module is powerless against, so this is a config-stated
   * anchor rather than a derived one.
   */
  expectedUnits?: number;
}

/**
 * THE KERNEL CONFIG (kernel plan M2-P6 step 2): this repository's real
 * pair and the four bucket kinds the plan states verbatim. It is a plain
 * exported constant, not a checked-in data file, because M2-C-1's
 * verification-first reading of the plan's files-to-touch list for this
 * phase names the module, its schema and its test, and no committed
 * configuration document alongside them; a `--config` flag (validated
 * against `coverage-config.schema.json`) exists for a caller that wants a
 * different pair, and every fixture test in `test/coverage-gate.test.ts`
 * uses it rather than editing this constant.
 */
export const KERNEL_COVERAGE_CONFIG: CoverageConfig = {
  inventory: {
    path: "delivery/requirements/migration-table.md",
    idPattern: "R-[0-9]+[a-z]?",
  },
  coverageTable: {
    path: "delivery/plan/kernel-plan-v1.md",
    idPattern: "R-[0-9]+[a-z]?",
    bucketColumn: 1,
    noteColumn: 2,
  },
  bucketKinds: [
    { kind: "phase", pattern: "M([0-9]+)-P[0-9]+", requiresNote: false },
    { kind: "milestone", pattern: "M([0-9]+)", requiresNote: false },
    {
      kind: "decision",
      pattern: "DR-[0-9]{4}|D-[0-9]+|M2-D-[0-9]+",
      requiresNote: false,
    },
    { kind: "parked", pattern: "parked", requiresNote: true },
  ],
  expectedUnits: 115,
};

/**
 * THE SHARED EMPTINESS PREDICATE (fix round 1, CR-987).
 *
 * Before this round, `checkCoverage`'s note check compared a value already
 * passed through `String.prototype.trim` (applied once, at extraction) to
 * `""`, and `checkFindingOutcomeParity`'s outcome check compared a value
 * that was never trimmed at all to `""`. Two definitions, only one of
 * which trimmed, and NEITHER strips a zero-width character: `trim()`
 * removes Unicode whitespace (which includes U+00A0 and U+FEFF) but not
 * U+200B ZERO WIDTH SPACE, U+200C ZERO WIDTH NON-JOINER or U+200D ZERO
 * WIDTH JOINER, so a cell or an outcome containing only one of those reads
 * as non-empty to a bare `=== ""` comparison, trimmed or not. One
 * predicate, called at every point this module asks "is this empty",
 * closes both instances at once.
 */
export function isEmptyCell(value: string): boolean {
  // U+200B ZERO WIDTH SPACE, U+200C ZERO WIDTH NON-JOINER, U+200D ZERO
  // WIDTH JOINER, U+FEFF ZERO WIDTH NO-BREAK SPACE (BOM). Written as
  // \u escapes rather than embedded literally: this repository's
  // authored files are pure ASCII (CLAUDE.md convention 3), which a
  // literal zero-width character in source would silently violate.
  return value.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").trim() === "";
}

/**
 * A REUSED v8 CONTEXT for every bounded regex execution this module
 * performs (fix round 1, the regex mechanism, CR-991). Created once at
 * module load rather than per call: `vm.createContext` builds a real v8
 * context and doing that once per row per bucket kind measured
 * meaningfully slower in this round's own benchmark than reusing one.
 */
const regexSandbox = createContext(Object.create(null) as Record<string, unknown>);

/** Wall-clock bound on one regex execution. Measured (this round): a real
 * catastrophic pattern, `(a+)+b` against 30 a's, which never returns on
 * its own, is interrupted within 251-267ms under this mechanism; a safe
 * pattern executes in under a millisecond, so the bound is not on the
 * critical path for any pattern this repository's own config uses. */
export const REGEX_EXEC_TIMEOUT_MS = 250;

export class RegexBoundExceededError extends Error {}

/**
 * Execute `compiled.exec(value)` inside a v8 context with a wall-clock
 * timeout. `node:vm`'s `timeout` option interrupts synchronous JavaScript
 * execution, INCLUDING regex backtracking (v8 checks for the termination
 * request during a regex match, not only between statements), which is
 * why this bound can stop a hung `.exec()` where a plain try/catch around
 * a synchronous call cannot: a catastrophic match never throws on its
 * own, it simply never returns. Measured directly (this round): the same
 * `(a+)+b` pattern against inputs of length 18 through 40 completes in
 * under 40ms up to length 22, then 63ms, 302ms, and is interrupted at the
 * 250ms bound from length 26 onward, rather than running to the multi-
 * second and then multi-minute times the unbounded engine produces at
 * length 26 and 40.
 */
export function boundedExec(compiled: RegExp, value: string): RegExpExecArray | null {
  Object.assign(regexSandbox, { __pattern: compiled, __value: value, __out: undefined });
  try {
    new Script("__out = __pattern.exec(__value);").runInContext(regexSandbox, {
      timeout: REGEX_EXEC_TIMEOUT_MS,
    });
  } catch {
    throw new RegexBoundExceededError(
      `pattern ${compiled.source} did not complete within ${String(REGEX_EXEC_TIMEOUT_MS)}ms ` +
        `against a value of length ${String(value.length)} (possible catastrophic backtracking)`,
    );
  }
  const out = (regexSandbox as { __out?: RegExpExecArray | null }).__out;
  return out ?? null;
}

/**
 * A STATIC heuristic for the single most common catastrophic-backtracking
 * shape (fix round 1, CR-991): a parenthesised group containing an
 * unbounded quantifier (`+` or `*`), itself immediately followed by
 * another unbounded quantifier, e.g. `(a+)+`, `(a*)+`, `(a+)*`. This is
 * exactly the shape the round's own red witness constructs
 * (`(a+)+b`). It is a heuristic, not a proof: it does not see every
 * catastrophic shape (a documented residue below), which is why every
 * EXECUTION is also bounded by `boundedExec` regardless of whether a
 * pattern passes this check.
 */
export function catastrophicShapeReason(pattern: string): string | undefined {
  if (/\([^()]*[+*][^()]*\)[+*]/.test(pattern)) {
    return (
      `contains a group ending in a repeated + or * immediately followed ` +
      `by another + or * (a known catastrophic-backtracking shape); ` +
      `rewrite it to avoid nested unbounded repetition`
    );
  }
  return undefined;
}

/**
 * Validate one config-supplied pattern SOURCE before it is ever compiled
 * into a live regex the gate will execute (fix round 1, CR-990/991):
 * compiles cleanly, and does not match the static catastrophic-shape
 * heuristic. `label` identifies which config field failed, so a config
 * error names the field, not just "a pattern".
 */
export function validatePatternSource(label: string, pattern: string): string | undefined {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
  } catch (error) {
    return `${label} ${JSON.stringify(pattern)} is not a valid regular expression: ${(error as Error).message}`;
  }
  const shape = catastrophicShapeReason(pattern);
  if (shape !== undefined) {
    return `${label} ${JSON.stringify(pattern)} ${shape}`;
  }
  return undefined;
}

/**
 * Validate every config-supplied pattern this module will ever compile
 * and execute: both `idPattern`s and every `bucketKinds[].pattern`. Run
 * once per config, before the config is used, so a malformed or dangerous
 * pattern is a named CONFIG error (a clean result record) rather than an
 * uncaught exception with no record (CR-990) or an unbounded hang
 * (CR-991).
 */
export function validateConfigPatterns(config: CoverageConfig): string | undefined {
  const checks: [string, string][] = [
    ["inventory.idPattern", config.inventory.idPattern],
    ["coverageTable.idPattern", config.coverageTable.idPattern],
    ...config.bucketKinds.map(
      (bucketKind, index): [string, string] => [
        `bucketKinds[${String(index)}] (kind ${bucketKind.kind}).pattern`,
        bucketKind.pattern,
      ],
    ),
  ];
  for (const [label, pattern] of checks) {
    const problem = validatePatternSource(label, pattern);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

interface TableRow {
  id: string;
  cells: string[];
  line: number;
}

/**
 * Walk a document's lines and return every markdown-table row whose first
 * cell matches `idPattern` (compiled anchored). Separator rows
 * (`|---|:--:|---|`) are skipped by construction: every cell in one matches
 * `/^:?-+:?$/`, which cannot also match a realistic id pattern, but the
 * separator test is applied explicitly rather than relied on implicitly, so
 * a future id pattern that could coincide does not silently absorb one.
 * Every match against a config-supplied pattern is BOUNDED (fix round 1,
 * `boundedExec`), so a hostile `idPattern` cannot hang this walk.
 */
export function extractIdRows(text: string, idPattern: string): TableRow[] {
  const anchored = new RegExp(`^(?:${idPattern})$`);
  const rows: TableRow[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (!line.startsWith("|") || !line.endsWith("|") || line.length < 2) {
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length === 0) {
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue; // header separator row
    }
    const first = cells[0] ?? "";
    if (boundedExec(anchored, first) !== null) {
      rows.push({ id: first, cells, line: index + 1 });
    }
  }
  return rows;
}

export type CoverageFindingKind =
  | "orphan"
  | "double-bucketed"
  | "phantom"
  | "unknown-kind"
  | "ambiguous-kind"
  | "missing-note"
  | "duplicate-inventory-id"
  | "expected-units-mismatch";

export interface CoverageFinding {
  kind: CoverageFindingKind;
  id: string;
  detail: string;
}

export interface CoverageReport {
  totalInventoryIds: number;
  perKind: Record<string, number>;
  perMilestone: Record<string, number>;
  findings: CoverageFinding[];
}

/**
 * The core check. Pure: takes the two documents' TEXT (already read through
 * M2-C-6's guarded read at the call site) and the config, and returns a
 * report with nothing hidden inside a status string.
 */
export function checkCoverage(
  config: CoverageConfig,
  inventoryText: string,
  coverageTableText: string,
): CoverageReport {
  const inventoryRows = extractIdRows(inventoryText, config.inventory.idPattern);
  const coverageRows = extractIdRows(
    coverageTableText,
    config.coverageTable.idPattern,
  );

  // CR-985: THE INVENTORY-SIDE CARDINALITY INVARIANT. `inventoryRows` can
  // carry the same id more than once (the raw text says so); `units` is a
  // count of DISTINCT ids, stated here rather than left implicit, and a
  // repeated id is its own finding, never silently folded into "one more
  // unit". `uniqueInventoryIds` preserves first-occurrence order so the
  // classification loop below processes each distinct id exactly once,
  // the same way the coverage side's `byId` grouping processes each
  // distinct coverage-table id exactly once.
  const inventoryIdOccurrences = new Map<string, number>();
  for (const row of inventoryRows) {
    inventoryIdOccurrences.set(row.id, (inventoryIdOccurrences.get(row.id) ?? 0) + 1);
  }
  const uniqueInventoryIds = [...inventoryIdOccurrences.keys()];
  const inventorySet = new Set(uniqueInventoryIds);

  const byId = new Map<string, TableRow[]>();
  for (const row of coverageRows) {
    const existing = byId.get(row.id);
    if (existing === undefined) {
      byId.set(row.id, [row]);
    } else {
      existing.push(row);
    }
  }

  const findings: CoverageFinding[] = [];
  const perKind: Record<string, number> = {};
  const perMilestone: Record<string, number> = {};

  for (const [id, occurrences] of inventoryIdOccurrences) {
    if (occurrences > 1) {
      findings.push({
        kind: "duplicate-inventory-id",
        id,
        detail: `inventory id ${id} appears ${String(occurrences)} times in the inventory document`,
      });
      // The id is still checked against the coverage table below: a
      // duplicated id can ALSO be an orphan, and both are worth naming.
    }
    const rows = byId.get(id) ?? [];
    if (rows.length === 0) {
      findings.push({
        kind: "orphan",
        id,
        detail: `inventory id ${id} has no row in the coverage table`,
      });
      continue;
    }
    if (rows.length > 1) {
      findings.push({
        kind: "double-bucketed",
        id,
        detail: `inventory id ${id} appears in ${String(rows.length)} coverage-table rows (lines ${rows
          .map((row) => String(row.line))
          .join(", ")})`,
      });
      continue;
    }
    const row = rows[0] as TableRow;
    const bucketValue = row.cells[config.coverageTable.bucketColumn] ?? "";
    const note = row.cells[config.coverageTable.noteColumn] ?? "";

    // CR-992: EVERY declared kind is tested, never only until the first
    // match, so a value matching more than one kind is a named finding
    // rather than a silent first-match-wins (which used to let a second
    // kind's `requiresNote` go uninspected with nothing said).
    const matches: { kind: BucketKindConfig; milestone: string | undefined }[] = [];
    for (const bucketKind of config.bucketKinds) {
      const compiled = new RegExp(`^(?:${bucketKind.pattern})$`);
      const match = boundedExec(compiled, bucketValue);
      if (match !== null) {
        matches.push({ kind: bucketKind, milestone: match[1] });
      }
    }
    if (matches.length === 0) {
      findings.push({
        kind: "unknown-kind",
        id,
        detail: `bucket value ${JSON.stringify(bucketValue)} for id ${id} (line ${String(row.line)}) matches no declared bucket kind`,
      });
      continue;
    }
    if (matches.length > 1) {
      findings.push({
        kind: "ambiguous-kind",
        id,
        detail: `bucket value ${JSON.stringify(bucketValue)} for id ${id} (line ${String(row.line)}) matches more than one declared bucket kind: ${matches
          .map((entry) => entry.kind.kind)
          .join(", ")}`,
      });
      continue;
    }
    const classified = matches[0] as { kind: BucketKindConfig; milestone: string | undefined };
    // CR-987: ONE shared emptiness predicate, not a bare `=== ""`, so a
    // whitespace-only or zero-width-only note is empty here the same way
    // it is empty in `checkFindingOutcomeParity` below.
    if (classified.kind.requiresNote && isEmptyCell(note)) {
      findings.push({
        kind: "missing-note",
        id,
        detail: `${classified.kind.kind} row for id ${id} (line ${String(row.line)}) has an empty note`,
      });
      continue;
    }
    const kindName = classified.kind.kind;
    perKind[kindName] = (perKind[kindName] ?? 0) + 1;
    const milestoneKey =
      classified.milestone === undefined ? kindName : `M${classified.milestone}`;
    perMilestone[milestoneKey] = (perMilestone[milestoneKey] ?? 0) + 1;
  }

  for (const row of coverageRows) {
    if (!inventorySet.has(row.id)) {
      findings.push({
        kind: "phantom",
        id: row.id,
        detail: `coverage-table row ${row.id} (line ${String(row.line)}) has no matching inventory id`,
      });
    }
  }

  const totalInventoryIds = uniqueInventoryIds.length;

  // CR-986: THE EXPECTED-UNITS FLOOR. A row deleted from BOTH documents
  // leaves them agreeing with each other, so orphan, phantom and
  // duplicate-inventory-id are all silent about it; only a config-stated
  // expectation can catch a computed total that is smaller (or larger)
  // than the number of ids this pair is supposed to carry.
  if (config.expectedUnits !== undefined && totalInventoryIds !== config.expectedUnits) {
    findings.push({
      kind: "expected-units-mismatch",
      id: "(total)",
      detail: `expected ${String(config.expectedUnits)} distinct inventory id(s) but found ${String(totalInventoryIds)}`,
    });
  }

  return {
    totalInventoryIds,
    perKind,
    perMilestone,
    findings,
  };
}

/**
 * R-089b, THE FINDING-TO-OUTCOME PARITY CONTRACT (M2-P6 step 4).
 *
 * Section 2 item 2 of the M2 plan states that the report contract does not
 * exist yet, so this module defines its own input shape and M3's report
 * schema must emit it or supersede it. The shape declared here:
 *
 *   inventoryIds: string[]           every id that must be resolved
 *   findings: { id: string; outcome: string }[]   the report's rows
 *
 * A CONFORMING future report is a list of `{id, outcome}` pairs, one row
 * per id, `outcome` a non-empty string. This function does not care what
 * the outcome STRING says (that is a judgement M3 owns); it only checks
 * that every id got exactly one non-empty say. Fix round 1 adds the
 * direction the original version lacked: a report row whose id is not in
 * the inventory at all (CR-988, a PHANTOM outcome, symmetric with
 * `checkCoverage`'s phantom finding) is also named, not silently accepted.
 */
export interface FindingOutcomeRow {
  id: string;
  outcome: string;
}

export interface FindingParityResult {
  ok: boolean;
  checked: number;
  missing: string[];
  duplicated: string[];
  empty: string[];
  /** CR-988: report rows whose id is absent from `inventoryIds`. */
  phantom: string[];
}

export function checkFindingOutcomeParity(
  inventoryIds: string[],
  findings: FindingOutcomeRow[],
): FindingParityResult {
  const inventorySet = new Set(inventoryIds);
  const byId = new Map<string, FindingOutcomeRow[]>();
  for (const finding of findings) {
    const existing = byId.get(finding.id);
    if (existing === undefined) {
      byId.set(finding.id, [finding]);
    } else {
      existing.push(finding);
    }
  }
  const missing: string[] = [];
  const duplicated: string[] = [];
  const empty: string[] = [];
  const phantom: string[] = [];
  for (const id of inventoryIds) {
    const rows = byId.get(id) ?? [];
    if (rows.length === 0) {
      missing.push(id);
      continue;
    }
    if (rows.length > 1) {
      duplicated.push(id);
      continue;
    }
    // CR-987: the shared predicate, not a bare `=== ""` (a whitespace-only
    // or zero-width-only outcome used to read as a non-empty say).
    if (isEmptyCell((rows[0] as FindingOutcomeRow).outcome)) {
      empty.push(id);
    }
  }
  // CR-988: THE OTHER DIRECTION. `inventoryIds` alone cannot see a report
  // row for an id that no longer exists; that requires scanning the
  // REPORT'S OWN ids against the inventory, the same shape as
  // `checkCoverage`'s phantom scan over coverage-table rows.
  for (const id of byId.keys()) {
    if (!inventorySet.has(id)) {
      phantom.push(id);
    }
  }
  return {
    ok:
      missing.length === 0 &&
      duplicated.length === 0 &&
      empty.length === 0 &&
      phantom.length === 0,
    checked: inventoryIds.length,
    missing,
    duplicated,
    empty,
    phantom,
  };
}

/* -------------------------------------------------------------------- */
/* The CLI entry: `node src/gates/coverage.ts --result <path> --evidence */
/* <dir> [--config <path>]`, the gate subprocess contract src/gates/run.ts */
/* documents. Registered in gates.manifest.json with no declared          */
/* parameters, so the runner's invocation is exactly these two flags.     */
/* -------------------------------------------------------------------- */

const schemaUrl = new URL("./schemas/coverage-config.schema.json", import.meta.url);

let cachedConfigSchema: SchemaDocument | undefined;

type SchemaLoadOutcome =
  | { ok: true; schema: SchemaDocument }
  | { ok: false; loadError: string };

function configSchema(): SchemaLoadOutcome {
  if (cachedConfigSchema !== undefined) {
    return { ok: true, schema: cachedConfigSchema };
  }
  const path = fileURLToPath(schemaUrl);
  const read = readRegularFileIfPresent(path);
  if (read.kind !== "read") {
    return {
      ok: false,
      loadError:
        read.kind === "absent"
          ? `schema document ${path} is missing from this installation`
          : read.reason,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return { ok: false, loadError: `${path} does not parse as JSON: ${(error as Error).message}` };
  }
  const loaded = loadSchema(parsed, path);
  if (!loaded.ok) {
    return { ok: false, loadError: loaded.reason };
  }
  cachedConfigSchema = loaded.schema;
  return { ok: true, schema: cachedConfigSchema };
}

interface Flags {
  result?: string;
  evidence?: string;
  config?: string;
}

const VALUE_FLAGS = ["--result", "--evidence", "--config"];

function parseFlags(args: string[]): Flags | undefined {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || !VALUE_FLAGS.includes(flag)) {
      return undefined;
    }
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }
    if (flag === "--result") {
      flags.result = value;
    } else if (flag === "--evidence") {
      flags.evidence = value;
    } else {
      flags.config = value;
    }
    index += 1;
  }
  return flags;
}

interface LoadedConfig {
  ok: true;
  config: CoverageConfig;
}
interface FailedConfig {
  ok: false;
  reason: string;
}

/** Load and validate a `--config` document, or fall back to the kernel config. */
function resolveConfig(configPath: string | undefined): LoadedConfig | FailedConfig {
  if (configPath === undefined) {
    return { ok: true, config: KERNEL_COVERAGE_CONFIG };
  }
  const read = readRegularFileIfPresent(configPath);
  if (read.kind !== "read") {
    return {
      ok: false,
      reason:
        read.kind === "absent"
          ? `config ${configPath} does not exist`
          : read.reason,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      ok: false,
      reason: `config ${configPath} does not parse as JSON: ${(error as Error).message}`,
    };
  }
  const schema = configSchema();
  if (!schema.ok) {
    return { ok: false, reason: schema.loadError };
  }
  const diagnostics = validate(schema.schema, parsed);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `config ${configPath} is not a valid coverage config: ${diagnostics
        .map((diagnostic) => `INVALID ${diagnostic.pointer} ${diagnostic.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, config: parsed as CoverageConfig };
}

function readConfiguredDocument(
  label: string,
  path: string,
): { ok: true; text: string } | { ok: false; reason: string } {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "read") {
    return { ok: true, text: read.body };
  }
  return {
    ok: false,
    reason:
      read.kind === "absent"
        ? `${label} ${path} does not exist`
        : read.reason,
  };
}

function formatCounts(counts: Record<string, number>): string {
  const keys = Object.keys(counts).sort();
  if (keys.length === 0) {
    return "(none)";
  }
  return keys.map((key) => `${key} ${String(counts[key])}`).join(", ");
}

export function main(argv: string[]): number {
  const flags = parseFlags(argv);
  const startedAt = new Date().toISOString();
  if (flags === undefined || flags.result === undefined) {
    process.stderr.write(
      "usage: node src/gates/coverage.ts --result <file> --evidence <dir> [--config <file>]\n",
    );
    return 64;
  }

  const resolvedConfig = resolveConfig(flags.config);
  if (!resolvedConfig.ok) {
    return emit(flags.result, {
      status: "error",
      units: 0,
      startedAt,
      detail: resolvedConfig.reason,
      evidence: [],
    });
  }
  const config = resolvedConfig.config;

  // CR-990/991, THE REGEX MECHANISM, VALIDATE HALF. Every config-supplied
  // pattern is checked BEFORE it is compiled into a live regex anywhere
  // else in this run: a malformed pattern used to throw out of
  // `extractIdRows` and escape all the way to the top-level handler,
  // which writes NO result record (CR-990); a syntactically valid but
  // catastrophic pattern used to hang (CR-991). Both are now a named
  // config error with a clean record, never an uncaught exception.
  const patternProblem = validateConfigPatterns(config);
  if (patternProblem !== undefined) {
    return emit(flags.result, {
      status: "error",
      units: 0,
      startedAt,
      detail: `invalid config: ${patternProblem}`,
      evidence: [],
    });
  }

  const inventory = readConfiguredDocument("inventory", config.inventory.path);
  if (!inventory.ok) {
    return emit(flags.result, {
      status: "error",
      units: 0,
      startedAt,
      detail: inventory.reason,
      evidence: [],
    });
  }
  const coverageTable = readConfiguredDocument(
    "coverage table",
    config.coverageTable.path,
  );
  if (!coverageTable.ok) {
    return emit(flags.result, {
      status: "error",
      units: 0,
      startedAt,
      detail: coverageTable.reason,
      evidence: [],
    });
  }

  // CR-990/991, THE REGEX MECHANISM, BOUND HALF (defense in depth). The
  // static validation above rejects the shapes `catastrophicShapeReason`
  // recognises; this catches anything an exception escapes with anyway
  // (a `RegexBoundExceededError` from `boundedExec`, or any other throw),
  // converting it into a normal error record instead of letting it reach
  // the top-level handler with no record written, which is the general
  // form of CR-990's finding rather than only its regex instance.
  let report: CoverageReport;
  try {
    report = checkCoverage(config, inventory.text, coverageTable.text);
  } catch (error) {
    return emit(flags.result, {
      status: "error",
      units: 0,
      startedAt,
      detail: `coverage check failed: ${singleLine((error as Error).message ?? String(error))}`,
      evidence: [],
    });
  }

  // M2-C-2: an empty inventory is reported GREEN with zero units so that
  // the shared constructor's rewrite (never duplicated here) turns it into
  // `error` with `vacuous: true`, rather than reporting whatever the
  // (vacuous) findings pass happened to compute.
  const status: GateStatus =
    report.totalInventoryIds === 0
      ? "green"
      : report.findings.length > 0
        ? "red"
        : "green";

  // CR-989: THE EVIDENCE-SIDE REFUSAL IS NOW HONOURED, not computed and
  // discarded. A FIFO or an absent parent directory at the evidence path
  // used to leave `refusal` and `written.reason` unread and report GREEN
  // with empty evidence; this is now the same M2-C-6 discipline the
  // result path already had (loud, and the gate reports `error`), applied
  // to the write side rather than only the read side.
  const evidenceFiles: string[] = [];
  if (flags.evidence !== undefined) {
    const countsPath = join(flags.evidence, "counts.json");
    const refusal = refuseOpenForWrite(countsPath);
    if (refusal !== undefined) {
      return emit(flags.result, {
        status: "error",
        units: report.totalInventoryIds,
        startedAt,
        detail: `evidence write refused: ${refusal}`,
        evidence: [],
      });
    }
    const written = runStep(`writing ${countsPath}`, () =>
      writeFileSync(
        countsPath,
        `${JSON.stringify(
          {
            totalInventoryIds: report.totalInventoryIds,
            perKind: report.perKind,
            perMilestone: report.perMilestone,
            findings: report.findings,
          },
          null,
          2,
        )}\n`,
      ),
    );
    if (!written.ok) {
      return emit(flags.result, {
        status: "error",
        units: report.totalInventoryIds,
        startedAt,
        detail: `evidence write failed: ${written.reason}`,
        evidence: [],
      });
    }
    evidenceFiles.push("counts.json");
  }

  const detail =
    report.findings.length > 0
      ? `${String(report.findings.length)} finding(s): ${report.findings
          .map((finding) => `${finding.kind} ${finding.id}`)
          .join("; ")}`
      : `${String(report.totalInventoryIds)} inventory id(s) checked; ` +
        `per-kind: ${formatCounts(report.perKind)}; ` +
        `per-milestone: ${formatCounts(report.perMilestone)}`;

  return emit(flags.result, {
    status,
    units: report.totalInventoryIds,
    startedAt,
    detail,
    evidence: evidenceFiles,
  });
}

interface EmitFields {
  status: GateStatus;
  units: number;
  startedAt: string;
  detail: string;
  evidence: string[];
}

function emit(resultPath: string, fields: EmitFields): number {
  const result = makeGateResult({
    gate: "coverage",
    status: fields.status,
    units: fields.units,
    unitLabel: "finding ids checked",
    startedAt: fields.startedAt,
    endedAt: new Date().toISOString(),
    detail: fields.detail,
    evidence: fields.evidence,
  });
  const refusal = refuseOpenForWrite(resultPath);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys coverage: ${refusal}\n`);
    return EXIT_GATE_ERROR;
  }
  const written = runStep(`writing ${resultPath}`, () =>
    writeFileSync(resultPath, renderGateResult(result)),
  );
  if (!written.ok) {
    process.stderr.write(`tiphys coverage: ${written.reason}\n`);
    return EXIT_GATE_ERROR;
  }
  process.stdout.write(
    `coverage: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(result.status);
}

/**
 * Run only when invoked directly (`node src/gates/coverage.ts ...`), never
 * on import: `test/coverage-gate.test.ts` imports this module's pure
 * functions through the computed-URL pattern and must not trigger a CLI
 * run as a side effect of that import.
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys coverage: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}
