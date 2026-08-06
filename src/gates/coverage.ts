import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
 *     is required to have a coverage-table row). The two checks scan in
 *     opposite directions on purpose, so neither can compensate for the
 *     other's blind spot.
 *   - a bucket value matching no declared kind, silently uncounted: every
 *     bucket-kind pattern is compiled ANCHORED (`^(?:pattern)$`) and tested
 *     against the whole cell; a value none of them match is the
 *     `unknown-kind` finding, named by id and value, never absorbed into a
 *     nearby kind by a partial match.
 *   - an empty inventory producing a green with nothing examined: `units`
 *     is always the number of ids the inventory actually produced, and this
 *     module never constructs a `GateResult` except through
 *     `makeGateResult`, whose M2-C-2 rewrite turns a green-with-zero-units
 *     record into `error` with `vacuous: true`. This gate does not
 *     duplicate that rule; it relies on the shared constructor the way
 *     M2-C-6 requires reuse of `classifyEntry` rather than a second
 *     implementation of "may this path be read".
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
 *     row says something" are not conflated.
 *
 * M2-C-6: the inventory path, the coverage-table path and an optional
 * `--config` document are all supplied by configuration and none of them
 * is a path this module created, so every read goes through
 * `readRegularFileIfPresent` (which itself routes through `classifyEntry`),
 * never a bare `readFileSync`. A named pipe at any of the three paths is
 * `error` naming the path and the observed type, and this module never
 * blocks on one.
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
};

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
    if (anchored.test(first)) {
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
  | "missing-note";

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

  const inventoryIds = inventoryRows.map((row) => row.id);
  const inventorySet = new Set(inventoryIds);

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

  for (const id of inventoryIds) {
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

    let classified: { kind: BucketKindConfig; milestone: string | undefined } | undefined;
    for (const bucketKind of config.bucketKinds) {
      const match = new RegExp(`^(?:${bucketKind.pattern})$`).exec(bucketValue);
      if (match !== null) {
        classified = { kind: bucketKind, milestone: match[1] };
        break;
      }
    }
    if (classified === undefined) {
      findings.push({
        kind: "unknown-kind",
        id,
        detail: `bucket value ${JSON.stringify(bucketValue)} for id ${id} (line ${String(row.line)}) matches no declared bucket kind`,
      });
      continue;
    }
    if (classified.kind.requiresNote && note === "") {
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

  return {
    totalInventoryIds: inventoryIds.length,
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
 * that every id got exactly one non-empty say.
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
}

export function checkFindingOutcomeParity(
  inventoryIds: string[],
  findings: FindingOutcomeRow[],
): FindingParityResult {
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
    if ((rows[0] as FindingOutcomeRow).outcome === "") {
      empty.push(id);
    }
  }
  return {
    ok: missing.length === 0 && duplicated.length === 0 && empty.length === 0,
    checked: inventoryIds.length,
    missing,
    duplicated,
    empty,
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

  const report = checkCoverage(config, inventory.text, coverageTable.text);

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

  const evidenceFiles: string[] = [];
  if (flags.evidence !== undefined) {
    const countsPath = join(flags.evidence, "counts.json");
    const refusal = refuseOpenForWrite(countsPath);
    if (refusal === undefined) {
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
      if (written.ok) {
        evidenceFiles.push("counts.json");
      }
    }
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
