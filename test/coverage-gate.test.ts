import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M2-P6: the coverage checker.
 *
 * Criterion 1 runs the real check against this repository's own real pair
 * (delivery/requirements/migration-table.md, delivery/plan/kernel-plan-v1.md
 * Appendix A), not a fixture, so a drift between this test and the actual
 * documents is a red rather than a green over a stale expectation.
 * Criteria 2 to 8 stage the dangerous state named in the plan (a deleted
 * row, a duplicated id, an id absent from the inventory, an empty note, an
 * empty inventory, a missing/duplicated/empty finding outcome) with small
 * fixtures built for that one shape, per the red-witness rule's "one
 * witness is not a class" ("both directions" is demonstrated in-line
 * wherever the criterion asks for it, by running the same check on both the
 * dangerous state and its correction).
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const coverageEntry = fileURLToPath(new URL("../src/gates/coverage.ts", import.meta.url));

interface BucketKindConfig {
  kind: string;
  pattern: string;
  requiresNote: boolean;
}
interface DocumentConfig {
  path: string;
  idPattern: string;
}
interface CoverageTableConfig extends DocumentConfig {
  bucketColumn: number;
  noteColumn: number;
}
interface CoverageConfig {
  inventory: DocumentConfig;
  coverageTable: CoverageTableConfig;
  bucketKinds: BucketKindConfig[];
  expectedUnits?: number;
}
interface CoverageFinding {
  kind: string;
  id: string;
  detail: string;
}
interface CoverageReport {
  totalInventoryIds: number;
  perKind: Record<string, number>;
  perMilestone: Record<string, number>;
  findings: CoverageFinding[];
}
interface FindingOutcomeRow {
  id: string;
  outcome: string;
}
interface FindingParityResult {
  ok: boolean;
  checked: number;
  missing: string[];
  duplicated: string[];
  empty: string[];
  phantom: string[];
}

const coverageModule = (await import(new URL("../src/gates/coverage.ts", import.meta.url).href)) as {
  KERNEL_COVERAGE_CONFIG: CoverageConfig;
  checkCoverage: (
    config: CoverageConfig,
    inventoryText: string,
    coverageTableText: string,
  ) => CoverageReport;
  checkFindingOutcomeParity: (
    inventoryIds: string[],
    findings: FindingOutcomeRow[],
  ) => FindingParityResult;
  isEmptyCell: (value: string) => boolean;
  boundedExec: (compiled: RegExp, value: string) => RegExpExecArray | null;
  RegexBoundExceededError: new (message: string) => Error;
  validateConfigPatterns: (config: CoverageConfig) => string | undefined;
  REGEX_EXEC_TIMEOUT_MS: number;
};

const manifestModule = (await import(new URL("../src/gates/manifest.ts", import.meta.url).href)) as {
  validateResultDocument: (document: unknown) => string[];
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-coverage-"));
}

interface GateRecord {
  gate: string;
  status: string;
  units: number;
  unitLabel: string;
  vacuous?: boolean;
  detail: string;
  evidence: string[];
}

function runGate(args: string[]): { status: number | null; record?: GateRecord; stdout: string; stderr: string } {
  const dir = scratch();
  try {
    const resultPath = join(dir, "result.json");
    const evidenceDir = join(dir, "evidence");
    mkdirSync(evidenceDir);
    const spawned = spawnSync(
      process.execPath,
      [coverageEntry, "--result", resultPath, "--evidence", evidenceDir, ...args],
      { encoding: "utf8", cwd: repoRoot },
    );
    let record: GateRecord | undefined;
    try {
      record = JSON.parse(readFileSync(resultPath, "utf8")) as GateRecord;
    } catch {
      record = undefined;
    }
    return { status: spawned.status, record, stdout: spawned.stdout, stderr: spawned.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeConfig(dir: string, config: CoverageConfig): string {
  const path = join(dir, "config.json");
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

/* -------------------------------------------------------------------- */
/* Criterion 1: the real pair.                                          */
/* -------------------------------------------------------------------- */

test("the coverage gate against the real migration table and appendix reports units 115 with per-kind and per-milestone breakdowns matching the plan", () => {
  const config = coverageModule.KERNEL_COVERAGE_CONFIG;
  const inventoryText = readFileSync(join(repoRoot, config.inventory.path), "utf8");
  const coverageText = readFileSync(join(repoRoot, config.coverageTable.path), "utf8");

  const report = coverageModule.checkCoverage(config, inventoryText, coverageText);

  assert.equal(report.totalInventoryIds, 115);
  assert.deepEqual(report.findings, []);
  assert.equal(report.perKind["phase"], 11);
  assert.equal(report.perKind["milestone"], 104);
  assert.equal(report.perMilestone["M1"], 11);
  assert.equal(report.perMilestone["M2"], 16);
  assert.equal(report.perMilestone["M3"], 74);
  assert.equal(report.perMilestone["M4"], 13);
  assert.equal(report.perMilestone["M5"], 1);
  assert.equal(report.perMilestone["parked"] ?? 0, 0);

  // The end-to-end CLI path, through the real manifest entry, confirms the
  // gate is wired rather than only importable: gates run reads its own
  // manifest, so the coverage entry's precondition, command and unitLabel
  // are exercised exactly as the runner would exercise them in CI.
  const dir = scratch();
  try {
    const evidenceDir = join(dir, "evidence");
    const spawned = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url)),
        "gates",
        "run",
        "--manifest",
        "gates.manifest.json",
        "--evidence",
        evidenceDir,
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    const summary = JSON.parse(
      readFileSync(join(evidenceDir, "summary.json"), "utf8"),
    ) as { gates: { id: string; status: string; units: number }[] };
    const coverageRow = summary.gates.find((row) => row.id === "coverage");
    assert.ok(coverageRow, `no coverage row in summary: ${spawned.stdout}\n${spawned.stderr}`);
    assert.equal(coverageRow?.status, "green");
    assert.equal(coverageRow?.units, 115);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 2: bucket classification, both a known and an unknown kind. */
/* -------------------------------------------------------------------- */

test("a phase bucket value is counted under its milestone and kind, and an unrecognized bucket value is red naming the row", () => {
  const config: CoverageConfig = {
    inventory: { path: "inventory.md", idPattern: "F-[0-9]+" },
    coverageTable: {
      path: "coverage.md",
      idPattern: "F-[0-9]+",
      bucketColumn: 1,
      noteColumn: 2,
    },
    bucketKinds: [
      { kind: "phase", pattern: "M([0-9]+)-P[0-9]+", requiresNote: false },
      { kind: "milestone", pattern: "M([0-9]+)", requiresNote: false },
    ],
  };
  const inventoryText = "| ID |\n|---|\n| F-1 |\n| F-2 |\n";
  const coverageText =
    "| Row | Bucket | Note |\n|---|---|---|\n| F-1 | M1-P3 | worktree pool |\n| F-2 | TBD | not yet placed |\n";

  const report = coverageModule.checkCoverage(config, inventoryText, coverageText);

  assert.equal(report.perKind["phase"], 1);
  assert.equal(report.perMilestone["M1"], 1);
  const unknown = report.findings.find((finding) => finding.kind === "unknown-kind");
  assert.ok(unknown, JSON.stringify(report.findings));
  assert.equal(unknown?.id, "F-2");
  assert.match(unknown?.detail ?? "", /TBD/);
});

/* -------------------------------------------------------------------- */
/* Criterion 3: orphan, staged against the real appendix, both           */
/* directions.                                                           */
/* -------------------------------------------------------------------- */

test("deleting an appendix row is red naming the orphan id, and restoring it is green", () => {
  const config = coverageModule.KERNEL_COVERAGE_CONFIG;
  const inventoryText = readFileSync(join(repoRoot, config.inventory.path), "utf8");
  const coverageText = readFileSync(join(repoRoot, config.coverageTable.path), "utf8");

  const targetId = "R-050a";
  assert.ok(
    coverageText.includes(`| ${targetId} |`),
    `fixture assumption failed: ${targetId} not found in the real appendix`,
  );
  const mutatedLines = coverageText
    .split("\n")
    .filter((line) => !line.trim().startsWith(`| ${targetId} |`));
  const mutatedText = mutatedLines.join("\n");
  assert.notEqual(mutatedText, coverageText);

  // DANGEROUS STATE: the row is gone.
  const mutatedReport = coverageModule.checkCoverage(config, inventoryText, mutatedText);
  const orphan = mutatedReport.findings.find(
    (finding) => finding.kind === "orphan" && finding.id === targetId,
  );
  assert.ok(orphan, JSON.stringify(mutatedReport.findings));

  // BOTH DIRECTIONS: restored, the same id is not an orphan.
  const restoredReport = coverageModule.checkCoverage(config, inventoryText, coverageText);
  const stillOrphan = restoredReport.findings.find(
    (finding) => finding.kind === "orphan" && finding.id === targetId,
  );
  assert.equal(stillOrphan, undefined);
});

/* -------------------------------------------------------------------- */
/* Criterion 4: double-bucketed.                                        */
/* -------------------------------------------------------------------- */

test("an id appearing in two coverage-table rows is red naming it double-bucketed", () => {
  const config: CoverageConfig = {
    inventory: { path: "inventory.md", idPattern: "G-[0-9]+" },
    coverageTable: {
      path: "coverage.md",
      idPattern: "G-[0-9]+",
      bucketColumn: 1,
      noteColumn: 2,
    },
    bucketKinds: [{ kind: "milestone", pattern: "M([0-9]+)", requiresNote: false }],
  };
  const inventoryText = "| ID |\n|---|\n| G-1 |\n";
  const coverageText =
    "| Row | Bucket | Note |\n|---|---|---|\n| G-1 | M2 | first placement |\n| G-1 | M3 | second placement |\n";

  const report = coverageModule.checkCoverage(config, inventoryText, coverageText);
  const doubled = report.findings.find((finding) => finding.kind === "double-bucketed");
  assert.ok(doubled, JSON.stringify(report.findings));
  assert.equal(doubled?.id, "G-1");
});

/* -------------------------------------------------------------------- */
/* Criterion 5: phantom coverage.                                       */
/* -------------------------------------------------------------------- */

test("a coverage-table row whose id is absent from the inventory is red naming it phantom", () => {
  const config: CoverageConfig = {
    inventory: { path: "inventory.md", idPattern: "H-[0-9]+" },
    coverageTable: {
      path: "coverage.md",
      idPattern: "H-[0-9]+",
      bucketColumn: 1,
      noteColumn: 2,
    },
    bucketKinds: [{ kind: "milestone", pattern: "M([0-9]+)", requiresNote: false }],
  };
  const inventoryText = "| ID |\n|---|\n| H-1 |\n";
  const coverageText =
    "| Row | Bucket | Note |\n|---|---|---|\n| H-1 | M2 | fine |\n| H-2 | M3 | renumbered away |\n";

  const report = coverageModule.checkCoverage(config, inventoryText, coverageText);
  const phantom = report.findings.find((finding) => finding.kind === "phantom");
  assert.ok(phantom, JSON.stringify(report.findings));
  assert.equal(phantom?.id, "H-2");
});

/* -------------------------------------------------------------------- */
/* Criterion 6: parked row note, both directions.                       */
/* -------------------------------------------------------------------- */

test("a parked row with an empty note is red, and the same row with a note is green", () => {
  const config: CoverageConfig = {
    inventory: { path: "inventory.md", idPattern: "K-[0-9]+" },
    coverageTable: {
      path: "coverage.md",
      idPattern: "K-[0-9]+",
      bucketColumn: 1,
      noteColumn: 2,
    },
    bucketKinds: [{ kind: "parked", pattern: "parked", requiresNote: true }],
  };
  const inventoryText = "| ID |\n|---|\n| K-1 |\n";

  const noNote = "| Row | Bucket | Note |\n|---|---|---|\n| K-1 | parked |  |\n";
  const noNoteReport = coverageModule.checkCoverage(config, inventoryText, noNote);
  const missing = noNoteReport.findings.find((finding) => finding.kind === "missing-note");
  assert.ok(missing, JSON.stringify(noNoteReport.findings));
  assert.equal(missing?.id, "K-1");

  const withNote =
    "| Row | Bucket | Note |\n|---|---|---|\n| K-1 | parked | superseded by DR-0020 |\n";
  const withNoteReport = coverageModule.checkCoverage(config, inventoryText, withNote);
  assert.deepEqual(withNoteReport.findings, []);
  assert.equal(withNoteReport.perKind["parked"], 1);
  // parked's pattern carries no capture group, so the per-milestone view
  // buckets it by the kind's own name rather than dropping it silently.
  assert.equal(withNoteReport.perMilestone["parked"], 1);
});

/* -------------------------------------------------------------------- */
/* Criterion 7: empty inventory is error, never green, through the real */
/* CLI and file reads (M2-C-6, M2-C-2).                                 */
/* -------------------------------------------------------------------- */

test("an empty inventory is error with units 0 and the vacuous flag set, never green", () => {
  const dir = scratch();
  try {
    const inventoryPath = join(dir, "inventory.md");
    const coveragePath = join(dir, "coverage.md");
    writeFileSync(inventoryPath, "# Inventory\n\nNothing here yet.\n");
    writeFileSync(coveragePath, "# Coverage\n\nNothing here yet.\n");
    const configPath = writeConfig(dir, {
      inventory: { path: inventoryPath, idPattern: "R-[0-9]+" },
      coverageTable: {
        path: coveragePath,
        idPattern: "R-[0-9]+",
        bucketColumn: 1,
        noteColumn: 2,
      },
      bucketKinds: [{ kind: "milestone", pattern: "M([0-9]+)", requiresNote: false }],
    });

    const outcome = runGate(["--config", configPath]);
    assert.equal(outcome.status, 21, JSON.stringify(outcome));
    assert.equal(outcome.record?.status, "error");
    assert.equal(outcome.record?.units, 0);
    assert.equal(outcome.record?.vacuous, true);
    assert.notEqual(outcome.record?.status, "green");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 8: finding-to-outcome parity, three directions.            */
/* -------------------------------------------------------------------- */

test("a finding report missing an id, carrying an empty outcome, or fully covered, is red, red, and green respectively naming the id", () => {
  const inventoryIds = ["F-1", "F-2", "F-3", "F-4", "F-5", "F-6"];

  // DIRECTION 1: 5 of 6 covered.
  const partial = coverageModule.checkFindingOutcomeParity(
    inventoryIds,
    inventoryIds.slice(0, 5).map((id) => ({ id, outcome: "covered" })),
  );
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.missing, ["F-6"]);

  // DIRECTION 2: all 6 present, one with an empty outcome.
  const emptyOutcome = coverageModule.checkFindingOutcomeParity(
    inventoryIds,
    inventoryIds.map((id) => ({ id, outcome: id === "F-3" ? "" : "covered" })),
  );
  assert.equal(emptyOutcome.ok, false);
  assert.deepEqual(emptyOutcome.empty, ["F-3"]);

  // DIRECTION 3: all six covered and non-empty.
  const complete = coverageModule.checkFindingOutcomeParity(
    inventoryIds,
    inventoryIds.map((id) => ({ id, outcome: "covered" })),
  );
  assert.equal(complete.ok, true);
  assert.equal(complete.checked, 6);
  assert.deepEqual(complete.missing, []);
  assert.deepEqual(complete.duplicated, []);
  assert.deepEqual(complete.empty, []);
});

/* -------------------------------------------------------------------- */
/* Criterion 9 (registry): the CLI entry writes a schema-valid record,   */
/* both a green and a red outcome, status-mapped to the right exit code. */
/* -------------------------------------------------------------------- */

test("the coverage CLI entry writes a schema-valid result record and exits the status-mapped code", () => {
  const dir = scratch();
  try {
    const inventoryPath = join(dir, "inventory.md");
    const coveragePath = join(dir, "coverage.md");
    writeFileSync(inventoryPath, "| ID |\n|---|\n| Z-1 |\n| Z-2 |\n");
    writeFileSync(
      coveragePath,
      "| Row | Bucket | Note |\n|---|---|---|\n| Z-1 | M2 | fine |\n| Z-2 | M3 | fine |\n",
    );
    const configPath = writeConfig(dir, {
      inventory: { path: inventoryPath, idPattern: "Z-[0-9]+" },
      coverageTable: {
        path: coveragePath,
        idPattern: "Z-[0-9]+",
        bucketColumn: 1,
        noteColumn: 2,
      },
      bucketKinds: [{ kind: "milestone", pattern: "M([0-9]+)", requiresNote: false }],
    });

    const green = runGate(["--config", configPath]);
    assert.equal(green.status, 0, JSON.stringify(green));
    assert.equal(green.record?.status, "green");
    assert.equal(green.record?.units, 2);
    assert.deepEqual(manifestModule.validateResultDocument(green.record), []);

    // The RED direction: an undeclared row makes the same config red.
    writeFileSync(
      coveragePath,
      "| Row | Bucket | Note |\n|---|---|---|\n| Z-1 | M2 | fine |\n",
    );
    const red = runGate(["--config", configPath]);
    assert.equal(red.status, 1, JSON.stringify(red));
    assert.equal(red.record?.status, "red");
    assert.deepEqual(manifestModule.validateResultDocument(red.record), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ====================================================================== */
/* FIX ROUND 1 (arbitration-m2-p6.md): CR-985 to CR-992.                  */
/* ====================================================================== */

function mkfifo(path: string): void {
  const made = spawnSync("mkfifo", [path], { encoding: "utf8" });
  assert.equal(made.status, 0, `mkfifo ${path} failed: ${made.stderr}`);
}

/**
 * CR-985: the inventory-side cardinality invariant, staged against the
 * REAL migration table by duplicating one of its real rows (R-001a),
 * exactly the shape the hazard review's A2 constructed.
 */
test("a duplicated inventory id is red naming it, and units count distinct ids rather than occurrences", () => {
  const config = coverageModule.KERNEL_COVERAGE_CONFIG;
  const inventoryText = readFileSync(join(repoRoot, config.inventory.path), "utf8");
  const coverageText = readFileSync(join(repoRoot, config.coverageTable.path), "utf8");

  const targetLine =
    "| R-001a | S0, 15-17 | Orchestrator never writes feature code in projects (infra hotfixes excepted) | L1 | project-write block hook (Claude Code plugin) | M4 | Hook named in M4 contents; infra-hotfix carve-out needs a defined bypass |";
  assert.ok(inventoryText.includes(targetLine), "fixture assumption failed: R-001a line not found verbatim");

  // DANGEROUS STATE: the real line, duplicated immediately after itself.
  const duplicatedInventoryText = inventoryText.replace(
    targetLine,
    `${targetLine}\n${targetLine}`,
  );
  const dangerous = coverageModule.checkCoverage(config, duplicatedInventoryText, coverageText);
  const duplicateFinding = dangerous.findings.find(
    (finding) => finding.kind === "duplicate-inventory-id" && finding.id === "R-001a",
  );
  assert.ok(duplicateFinding, JSON.stringify(dangerous.findings));
  // THE INFLATION CR-985 NAMED: units must stay 115 (distinct ids), never
  // 116 (occurrences). This is the assertion that would have failed
  // against the pre-fix-round code, which counted the duplicate as a
  // second unit.
  assert.equal(dangerous.totalInventoryIds, 115);

  // BOTH DIRECTIONS: the original (undangered) text has no such finding.
  const clean = coverageModule.checkCoverage(config, inventoryText, coverageText);
  assert.equal(
    clean.findings.find((finding) => finding.kind === "duplicate-inventory-id"),
    undefined,
  );
  assert.equal(clean.totalInventoryIds, 115);
});

/**
 * CR-986: a row lost from BOTH real documents (the hazard review's A1
 * shape) leaves orphan, phantom and duplicate-inventory-id all silent,
 * because the two documents still agree with each other; only the
 * `expectedUnits` floor can catch it.
 */
test("a row deleted from both real documents is red against the expected-units floor, and restoring it is green", () => {
  const config = coverageModule.KERNEL_COVERAGE_CONFIG;
  const inventoryText = readFileSync(join(repoRoot, config.inventory.path), "utf8");
  const coverageText = readFileSync(join(repoRoot, config.coverageTable.path), "utf8");

  const dropLine = (text: string, needle: string): string =>
    text
      .split("\n")
      .filter((line) => !line.trim().startsWith(needle))
      .join("\n");

  assert.ok(inventoryText.includes("| R-050a |"));
  assert.ok(coverageText.includes("| R-050a |"));
  const mutatedInventory = dropLine(inventoryText, "| R-050a |");
  const mutatedCoverage = dropLine(coverageText, "| R-050a |");
  assert.notEqual(mutatedInventory, inventoryText);
  assert.notEqual(mutatedCoverage, coverageText);

  // DANGEROUS STATE: gone from both documents, which agree with each
  // other about R-050a's absence, so no existence or cardinality check
  // fires.
  const dangerous = coverageModule.checkCoverage(config, mutatedInventory, mutatedCoverage);
  assert.equal(dangerous.totalInventoryIds, 114);
  assert.equal(
    dangerous.findings.find((finding) => finding.kind === "orphan"),
    undefined,
  );
  assert.equal(
    dangerous.findings.find((finding) => finding.kind === "phantom"),
    undefined,
  );
  const mismatch = dangerous.findings.find(
    (finding) => finding.kind === "expected-units-mismatch",
  );
  assert.ok(mismatch, JSON.stringify(dangerous.findings));
  assert.match(mismatch?.detail ?? "", /expected 115.*found 114/);

  // BOTH DIRECTIONS: restored, no mismatch.
  const restored = coverageModule.checkCoverage(config, inventoryText, coverageText);
  assert.equal(restored.totalInventoryIds, 115);
  assert.equal(
    restored.findings.find((finding) => finding.kind === "expected-units-mismatch"),
    undefined,
  );
});

/**
 * CR-987: one shared emptiness predicate, exercised on both call sites it
 * governs (a coverage-table note, and a finding-outcome-parity outcome).
 * U+200B is not stripped by `String.prototype.trim`, which is exactly why
 * it is the chosen dangerous character rather than an ordinary space.
 */
test("a zero-width-only note or outcome is empty on both sides of the shared predicate", () => {
  // The predicate itself, directly: the CONTROL that trim() alone would
  // fail this (JS's trim does not strip U+200B).
  assert.equal("\u200B".trim(), "\u200B", "control: trim() must NOT strip U+200B on its own");
  assert.equal(coverageModule.isEmptyCell("\u200B"), true);
  assert.equal(coverageModule.isEmptyCell("   \u200B  "), true);
  assert.equal(coverageModule.isEmptyCell("x"), false);
  assert.equal(coverageModule.isEmptyCell(""), true);

  // SIDE 1: checkCoverage's note check (the A5e shape).
  const config: CoverageConfig = {
    inventory: { path: "inventory.md", idPattern: "K-[0-9]+" },
    coverageTable: {
      path: "coverage.md",
      idPattern: "K-[0-9]+",
      bucketColumn: 1,
      noteColumn: 2,
    },
    bucketKinds: [{ kind: "parked", pattern: "parked", requiresNote: true }],
  };
  const inventoryText = "| ID |\n|---|\n| K-1 |\n";
  const zwspNote = "| Row | Bucket | Note |\n|---|---|---|\n| K-1 | parked | \u200B |\n";
  const zwspReport = coverageModule.checkCoverage(config, inventoryText, zwspNote);
  const missing = zwspReport.findings.find((finding) => finding.kind === "missing-note");
  assert.ok(missing, JSON.stringify(zwspReport.findings));
  assert.equal(zwspReport.perKind["parked"], undefined);

  // SIDE 2: checkFindingOutcomeParity's outcome check (the A5b shape).
  const parity = coverageModule.checkFindingOutcomeParity(["F-1"], [
    { id: "F-1", outcome: "\u200B" },
  ]);
  assert.equal(parity.ok, false);
  assert.deepEqual(parity.empty, ["F-1"]);

  // BOTH DIRECTIONS: a real, non-whitespace value is not empty on either
  // side.
  const realNote = "| Row | Bucket | Note |\n|---|---|---|\n| K-1 | parked | superseded |\n";
  const realReport = coverageModule.checkCoverage(config, inventoryText, realNote);
  assert.deepEqual(realReport.findings, []);
  const realParity = coverageModule.checkFindingOutcomeParity(["F-1"], [
    { id: "F-1", outcome: "covered" },
  ]);
  assert.equal(realParity.ok, true);
});

/**
 * CR-988: the parity scan's missing direction, symmetric with the
 * coverage side's phantom check. The A6 shape: a report row for an id
 * that is not in the inventory at all.
 */
test("a finding report row whose id is absent from the inventory is red naming it phantom", () => {
  const dangerous = coverageModule.checkFindingOutcomeParity(["F-1"], [
    { id: "F-1", outcome: "covered" },
    { id: "F-99", outcome: "covered" },
  ]);
  assert.equal(dangerous.ok, false);
  assert.deepEqual(dangerous.phantom, ["F-99"]);

  // BOTH DIRECTIONS: without the phantom row, parity holds.
  const clean = coverageModule.checkFindingOutcomeParity(["F-1"], [
    { id: "F-1", outcome: "covered" },
  ]);
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.phantom, []);
});

/**
 * CR-989: the evidence-side refusal, staged with TWO structurally
 * different members (a real named pipe, and a parent directory that does
 * not exist), matching the hazard review's C8 and C9. Before this round
 * both exited 0 with a green record and empty evidence; both must now be
 * `error`.
 */
test("a refused or failed evidence write makes the gate error instead of a silent green", () => {
  const dir = scratch();
  try {
    const inventoryPath = join(dir, "inventory.md");
    const coveragePath = join(dir, "coverage.md");
    writeFileSync(inventoryPath, "| ID |\n|---|\n| Z-1 |\n| Z-2 |\n");
    writeFileSync(
      coveragePath,
      "| Row | Bucket | Note |\n|---|---|---|\n| Z-1 | M2 | fine |\n| Z-2 | M3 | fine |\n",
    );
    const configPath = writeConfig(dir, {
      inventory: { path: inventoryPath, idPattern: "Z-[0-9]+" },
      coverageTable: {
        path: coveragePath,
        idPattern: "Z-[0-9]+",
        bucketColumn: 1,
        noteColumn: 2,
      },
      bucketKinds: [{ kind: "milestone", pattern: "M([0-9]+)", requiresNote: false }],
    });

    // MEMBER 1 (C8): a real named pipe sits exactly where the gate writes
    // its evidence.
    const resultPath1 = join(dir, "result1.json");
    const evidenceDir1 = join(dir, "evidence1");
    mkdirSync(evidenceDir1);
    mkfifo(join(evidenceDir1, "counts.json"));
    const fifoRun = spawnSync(
      process.execPath,
      [coverageEntry, "--result", resultPath1, "--evidence", evidenceDir1, "--config", configPath],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.notEqual(fifoRun.status, 0, JSON.stringify(fifoRun));
    const fifoRecord = JSON.parse(readFileSync(resultPath1, "utf8")) as GateRecord;
    assert.equal(fifoRecord.status, "error");
    assert.deepEqual(fifoRecord.evidence, []);
    assert.match(fifoRecord.detail, /evidence write refused/);

    // MEMBER 2 (C9): the evidence directory itself does not exist, a
    // STRUCTURALLY DIFFERENT failure (a missing parent, not an irregular
    // entry at the exact path), so refuseOpenForWrite sees "absent" and
    // the failure surfaces from the write itself, not from the type probe.
    const resultPath2 = join(dir, "result2.json");
    const missingEvidenceDir = join(dir, "does-not-exist");
    const missingRun = spawnSync(
      process.execPath,
      [coverageEntry, "--result", resultPath2, "--evidence", missingEvidenceDir, "--config", configPath],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.notEqual(missingRun.status, 0, JSON.stringify(missingRun));
    const missingRecord = JSON.parse(readFileSync(resultPath2, "utf8")) as GateRecord;
    assert.equal(missingRecord.status, "error");
    assert.deepEqual(missingRecord.evidence, []);
    assert.match(missingRecord.detail, /evidence write failed/);

    // BOTH DIRECTIONS: a real, writable evidence directory is green with
    // the evidence file present (already covered by the CLI record test
    // above; reasserted here as the direct contrast to both members).
    const resultPath3 = join(dir, "result3.json");
    const evidenceDir3 = join(dir, "evidence3");
    mkdirSync(evidenceDir3);
    const cleanRun = spawnSync(
      process.execPath,
      [coverageEntry, "--result", resultPath3, "--evidence", evidenceDir3, "--config", configPath],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(cleanRun.status, 0, JSON.stringify(cleanRun));
    const cleanRecord = JSON.parse(readFileSync(resultPath3, "utf8")) as GateRecord;
    assert.equal(cleanRecord.status, "green");
    assert.deepEqual(cleanRecord.evidence, ["counts.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-990: a malformed config pattern used to throw out of `extractIdRows`
 * and escape to the top-level handler with NO result record written at
 * all. It must now be a named config error WITH a written record.
 */
test("a malformed config pattern is a named config error with a written result record, never an uncaught exception", () => {
  const dir = scratch();
  try {
    const inventoryPath = join(dir, "inventory.md");
    const coveragePath = join(dir, "coverage.md");
    writeFileSync(inventoryPath, "| ID |\n|---|\n| Z-1 |\n");
    writeFileSync(coveragePath, "| Row | Bucket | Note |\n|---|---|---|\n| Z-1 | M2 | fine |\n");
    const configPath = writeConfig(dir, {
      inventory: { path: inventoryPath, idPattern: "Z-[0-9" },
      coverageTable: {
        path: coveragePath,
        idPattern: "Z-[0-9]+",
        bucketColumn: 1,
        noteColumn: 2,
      },
      bucketKinds: [{ kind: "milestone", pattern: "M([0-9]+)", requiresNote: false }],
    });

    const outcome = runGate(["--config", configPath]);
    assert.notEqual(outcome.status, 0, JSON.stringify(outcome));
    // THE ASSERTION CR-990 NAMED: a record exists at all.
    assert.ok(outcome.record, `no result record written: ${JSON.stringify(outcome)}`);
    assert.equal(outcome.record?.status, "error");
    assert.match(outcome.record?.detail ?? "", /not a valid regular expression/);

    // BOTH DIRECTIONS: the same config with the bracket closed is
    // evaluable.
    const fixedConfigPath = writeConfig(dir, {
      inventory: { path: inventoryPath, idPattern: "Z-[0-9]+" },
      coverageTable: {
        path: coveragePath,
        idPattern: "Z-[0-9]+",
        bucketColumn: 1,
        noteColumn: 2,
      },
      bucketKinds: [{ kind: "milestone", pattern: "M([0-9]+)", requiresNote: false }],
    });
    const fixed = runGate(["--config", fixedConfigPath]);
    assert.equal(fixed.status, 0, JSON.stringify(fixed));
    assert.equal(fixed.record?.status, "green");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-991: the ReDoS bound, staged with TWO structurally different
 * members. Member 1 calls the bounded executor DIRECTLY with the exact
 * pattern and input shape the hazard review measured (`(a+)+b`, `a`
 * repeated), with a REAL measured wall-clock bound: unbounded, this input
 * length does not return (the hazard review measured length 40 exceeding
 * a 180 SECOND timeout). Member 2 exercises the CLI's upfront static
 * rejection of the same shape, a structurally different code path (a
 * config error before any input is ever tested, rather than a runtime
 * interruption of a test that started).
 */
test("a catastrophic-backtracking pattern is bounded by a measured wall-clock timeout instead of hanging", () => {
  // MEMBER 1: the runtime bound, called directly, bypassing the static
  // validator entirely, so this witnesses `boundedExec` itself rather
  // than the config-time rejection.
  const dangerousInput = "a".repeat(30);
  const start = Date.now();
  assert.throws(
    () => coverageModule.boundedExec(new RegExp("^(?:(a+)+b)$"), dangerousInput),
    coverageModule.RegexBoundExceededError,
  );
  const elapsedMs = Date.now() - start;
  // A REAL measured bound: interrupted at or shortly after the module's
  // own timeout constant, never left to run to the multi-second (and at
  // length 40, multi-minute) time the unbounded engine takes.
  assert.ok(
    elapsedMs >= coverageModule.REGEX_EXEC_TIMEOUT_MS,
    `expected at least ${String(coverageModule.REGEX_EXEC_TIMEOUT_MS)}ms, measured ${String(elapsedMs)}ms`,
  );
  assert.ok(
    elapsedMs < coverageModule.REGEX_EXEC_TIMEOUT_MS + 2000,
    `expected the bound to hold, measured ${String(elapsedMs)}ms (unbounded, this shape exceeds 180s at length 40)`,
  );

  // BOTH DIRECTIONS: a safe pattern against the same executor is fast and
  // unaffected.
  const safeStart = Date.now();
  const safeResult = coverageModule.boundedExec(new RegExp("^(?:R-[0-9]+[a-z]?)$"), "R-001a");
  assert.notEqual(safeResult, null);
  assert.ok(Date.now() - safeStart < 100);

  // MEMBER 2: the CLI's static rejection of the same shape, before any
  // input is ever tested against it.
  const dir = scratch();
  try {
    const inventoryPath = join(dir, "inventory.md");
    const coveragePath = join(dir, "coverage.md");
    writeFileSync(inventoryPath, "| ID |\n|---|\n| Z-1 |\n");
    writeFileSync(coveragePath, "| Row | Bucket | Note |\n|---|---|---|\n| Z-1 | M2 | fine |\n");
    const configPath = writeConfig(dir, {
      inventory: { path: inventoryPath, idPattern: "Z-[0-9]+" },
      coverageTable: {
        path: coveragePath,
        idPattern: "Z-[0-9]+",
        bucketColumn: 1,
        noteColumn: 2,
      },
      bucketKinds: [{ kind: "milestone", pattern: "(a+)+b", requiresNote: false }],
    });
    const outcome = runGate(["--config", configPath]);
    assert.notEqual(outcome.status, 0, JSON.stringify(outcome));
    assert.equal(outcome.record?.status, "error");
    assert.match(outcome.record?.detail ?? "", /catastrophic-backtracking/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-992: overlapping bucket kinds used to resolve first-match-wins,
 * silently, which meant a second kind's `requiresNote` was never
 * consulted and nothing said so. The A7 shape from the hazard review:
 * `milestone` and `parked` both match the value `M1`.
 */
test("a bucket value matching more than one declared kind is red naming every match, never a silent first match", () => {
  const config: CoverageConfig = {
    inventory: { path: "inventory.md", idPattern: "P-[0-9]+" },
    coverageTable: {
      path: "coverage.md",
      idPattern: "P-[0-9]+",
      bucketColumn: 1,
      noteColumn: 2,
    },
    bucketKinds: [
      { kind: "milestone", pattern: "M([0-9]+)", requiresNote: false },
      { kind: "parked", pattern: "M1|parked", requiresNote: true },
    ],
  };
  const inventoryText = "| ID |\n|---|\n| P-1 |\n";
  const overlapping = "| Row | Bucket | Note |\n|---|---|---|\n| P-1 | M1 |  |\n";
  const dangerous = coverageModule.checkCoverage(config, inventoryText, overlapping);
  const ambiguous = dangerous.findings.find((finding) => finding.kind === "ambiguous-kind");
  assert.ok(ambiguous, JSON.stringify(dangerous.findings));
  assert.match(ambiguous?.detail ?? "", /milestone/);
  assert.match(ambiguous?.detail ?? "", /parked/);
  // THE SILENT-GREEN CR-992 NAMED: no perKind entry was produced, because
  // the row is a finding, not a silently accepted milestone match.
  assert.equal(dangerous.perKind["milestone"], undefined);

  // BOTH DIRECTIONS: a value matching only one declared kind is evaluable.
  const unambiguous = "| Row | Bucket | Note |\n|---|---|---|\n| P-1 | M2 |  |\n";
  const clean = coverageModule.checkCoverage(config, inventoryText, unambiguous);
  assert.deepEqual(
    clean.findings.filter((finding) => finding.kind === "ambiguous-kind"),
    [],
  );
  assert.equal(clean.perKind["milestone"], 1);
});
