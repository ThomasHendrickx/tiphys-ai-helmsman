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
