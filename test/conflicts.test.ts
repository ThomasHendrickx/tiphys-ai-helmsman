/**
 * THE CONFLICT PRE-PASS TESTS (value-delivery plan M5-P6 step 2, criterion
 * p6-prepass; R-026a).
 *
 * Every test drives the REAL CLI (`node bin/tiphys.ts conflicts ...`) and
 * asserts on its exit code and its stdout, because the command's contract is
 * what a dispatcher reads: the exit code and the named paths. Fixtures are
 * written to a scratch directory; one test reads this repository's own m5
 * declarations as a real input.
 *
 * The dangerous states, which the witness specs under witness/ demonstrate
 * these tests red against:
 *   - an overlap reported as disjoint (exit 0, or a path left unnamed);
 *   - a disjoint result, or an error, that omits the semantic-coupling
 *     obligation (the plan's false-disjointness hazard);
 *   - an unreadable or wrongly shaped declaration read as "zero overlaps";
 *   - an append-only registry silently dropped, or silently counted.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");

/** The obligation's opening words, matched as a whole last line below. */
const OBLIGATION = /^semantic coupling: NOT CHECKED\. .*reviewer must still judge semantic coupling for EVERY pair/;

interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
  lines: string[];
}

function runConflicts(args: string[], cwd: string = repoRoot): CliRun {
  const result = spawnSync(process.execPath, [cliEntry, "conflicts", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  });
  const stdout = result.stdout ?? "";
  return {
    status: result.status,
    stdout,
    stderr: result.stderr ?? "",
    lines: stdout.split("\n").filter((line) => line !== ""),
  };
}

function assertObligationLast(run: CliRun): void {
  const last = run.lines[run.lines.length - 1] ?? "";
  assert.match(last, OBLIGATION, `last stdout line was: ${last}`);
}

function scratch(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-conflicts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function declaration(
  dir: string,
  id: string,
  filesToTouch: string[],
  declaredExtras: string[] = [],
): string {
  const slug = id.toLowerCase();
  const path = join(dir, `${slug}.json`);
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        id,
        branch: `claude/${slug}-fixture`,
        filesToTouch,
        declaredExtras,
        citations: [],
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

test("conflicts exits 1 and names every overlapping path for an overlapping pair", (t) => {
  const dir = scratch(t);
  const left = declaration(
    dir,
    "M9-P1",
    ["src/a.ts", "src/shared.ts", "docs/guide.md", "witness/"],
    ["test/behaviors.json"],
  );
  const right = declaration(
    dir,
    "M9-P2",
    ["src/b.ts", "src/shared.ts", "docs/guide.md", "witness/m9-p2.json"],
    ["test/behaviors.json"],
  );
  const run = runConflicts([left, right]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const overlaps = run.lines.filter((line) => line.startsWith("OVERLAP "));
  assert.deepEqual(overlaps, [
    "OVERLAP M9-P1 M9-P2 docs/guide.md",
    "OVERLAP M9-P1 M9-P2 src/shared.ts",
    "OVERLAP M9-P1 M9-P2 witness/ and witness/m9-p2.json (directory contains path)",
  ]);
  assert.ok(!run.lines.some((line) => line.startsWith("DISJOINT ")), run.stdout);
  assert.ok(
    run.lines.includes("conflicts: 1 overlapping pair(s), 0 disjoint pair(s), 3 overlapping path(s)"),
    run.stdout,
  );
  assertObligationLast(run);
});

test("conflicts exits 0 with zero overlaps for a disjoint pair and still prints the semantic coupling obligation", (t) => {
  const dir = scratch(t);
  const left = declaration(dir, "M9-P1", ["src/a.ts", "docs/a.md"]);
  const right = declaration(dir, "M9-P2", ["src/b.ts", "docs/b/"]);
  const run = runConflicts([left, right]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.ok(!run.lines.some((line) => line.startsWith("OVERLAP ")), run.stdout);
  assert.ok(run.lines.includes("DISJOINT M9-P1 M9-P2"), run.stdout);
  assert.ok(
    run.lines.includes("conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)"),
    run.stdout,
  );
  assertObligationLast(run);
});

test("a shared append-only registry is reported on its own line and does not make a pair overlap", (t) => {
  const dir = scratch(t);
  const left = declaration(dir, "M9-P1", ["src/a.ts"], ["test/behaviors.json", "gates.manifest.json"]);
  const right = declaration(dir, "M9-P2", ["src/b.ts"], ["test/behaviors.json", "gates.manifest.json"]);
  const run = runConflicts([left, right]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.ok(
    run.lines.includes(
      "append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json",
    ),
    run.stdout,
  );
  assert.deepEqual(
    run.lines.filter((line) => line.startsWith("APPEND-ONLY ")),
    ["APPEND-ONLY M9-P1 M9-P2 gates.manifest.json", "APPEND-ONLY M9-P1 M9-P2 test/behaviors.json"],
  );
  assert.ok(run.lines.includes("DISJOINT M9-P1 M9-P2"), run.stdout);
  assertObligationLast(run);
});

test("--append-only replaces the default registry list, so an unlisted shared registry is an overlap", (t) => {
  const dir = scratch(t);
  const left = declaration(dir, "M9-P1", ["src/a.ts", "registry.json"], ["test/behaviors.json"]);
  const right = declaration(dir, "M9-P2", ["src/b.ts", "registry.json"], ["test/behaviors.json"]);
  const run = runConflicts(["--append-only", "registry.json", left, right]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.lines.includes("append-only, union-resolved, never an overlap: registry.json"), run.stdout);
  assert.ok(run.lines.includes("APPEND-ONLY M9-P1 M9-P2 registry.json"), run.stdout);
  assert.ok(run.lines.includes("OVERLAP M9-P1 M9-P2 test/behaviors.json"), run.stdout);
  assertObligationLast(run);
});

test("a missing declaration exits 2 with no verdict and still prints the obligation", (t) => {
  const dir = scratch(t);
  const good = declaration(dir, "M9-P1", ["src/a.ts"]);
  const run = runConflicts([good, join(dir, "absent.json")]);
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /absent\.json does not exist/);
  assert.ok(run.lines.some((line) => line.startsWith("conflicts: NO VERDICT: 1 of 2")), run.stdout);
  assert.ok(!run.lines.some((line) => line.startsWith("DISJOINT ")), run.stdout);
  assertObligationLast(run);
});

test("a directory given as a declaration exits 2 with no verdict", (t) => {
  const dir = scratch(t);
  const good = declaration(dir, "M9-P1", ["src/a.ts"]);
  const notAFile = join(dir, "a-directory.json");
  mkdirSync(notAFile);
  const run = runConflicts([good, notAFile]);
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /a-directory\.json/);
  assert.ok(run.lines.some((line) => line.startsWith("conflicts: NO VERDICT: 1 of 2")), run.stdout);
  assert.ok(!run.lines.some((line) => line.startsWith("DISJOINT ")), run.stdout);
  assertObligationLast(run);
});

test("a declaration that is not JSON exits 2 with no verdict", (t) => {
  const dir = scratch(t);
  const good = declaration(dir, "M9-P1", ["src/a.ts"]);
  const yamlish = join(dir, "m9-p2.json");
  writeFileSync(yamlish, "id: M9-P2\nfilesToTouch:\n  - src/a.ts\n");
  const run = runConflicts([good, yamlish]);
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /does not parse as JSON/);
  assert.ok(run.lines.some((line) => line.startsWith("conflicts: NO VERDICT: 1 of 2")), run.stdout);
  assert.ok(!run.lines.some((line) => line.startsWith("DISJOINT ")), run.stdout);
  assertObligationLast(run);
});

test("a wrongly shaped declaration exits 2 with no verdict rather than reading as an empty edit list", (t) => {
  const dir = scratch(t);
  const good = declaration(dir, "M9-P1", ["src/a.ts"]);
  const shapeless = join(dir, "m9-p2.json");
  writeFileSync(shapeless, `${JSON.stringify({ id: "M9-P2", branch: "claude/m9-p2-x", citations: [] })}\n`);
  const run = runConflicts([good, shapeless]);
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /is not a valid phase declaration: .*filesToTouch/);
  assert.ok(run.lines.some((line) => line.startsWith("conflicts: NO VERDICT: 1 of 2")), run.stdout);
  assert.ok(!run.lines.some((line) => line.startsWith("DISJOINT ")), run.stdout);
  assertObligationLast(run);
});

test("two declarations carrying the same phase id exit 2 rather than overlapping with themselves", (t) => {
  const dir = scratch(t);
  const first = declaration(dir, "M9-P1", ["src/a.ts"]);
  const copyDir = join(dir, "copy");
  mkdirSync(copyDir);
  const second = declaration(copyDir, "M9-P1", ["src/a.ts"]);
  const run = runConflicts([first, second]);
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /phase id M9-P1 is declared by both/);
  assert.ok(!run.lines.some((line) => line.startsWith("OVERLAP ")), run.stdout);
  assertObligationLast(run);
});

test("conflicts with fewer than two declarations exits 64 and still prints the obligation", (t) => {
  const dir = scratch(t);
  const only = declaration(dir, "M9-P1", ["src/a.ts"]);
  const run = runConflicts([only]);
  assert.equal(run.status, 64, run.stdout + run.stderr);
  assert.match(run.stderr, /at least two declarations are required, got 1/);
  assert.match(run.stderr, /usage: tiphys conflicts/);
  assertObligationLast(run);
});

test("conflicts is registered in the CLI and its usage line names it", () => {
  const result = spawnSync(process.execPath, [cliEntry, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\| conflicts \|/);
  const run = runConflicts(["--no-such-option"]);
  assert.equal(run.status, 64, run.stdout + run.stderr);
  assert.match(run.stderr, /tiphys conflicts: unknown option --no-such-option/);
});

test("conflicts names roles/clean-room-reviewer.md for the real m5-p2 and m5-p3 declarations", () => {
  const run = runConflicts([
    "delivery/plan/phase-declarations/m5-p2.json",
    "delivery/plan/phase-declarations/m5-p3.json",
  ]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.lines.includes("OVERLAP M5-P2 M5-P3 roles/clean-room-reviewer.md"), run.stdout);
  assert.ok(run.lines.includes("APPEND-ONLY M5-P2 M5-P3 test/behaviors.json"), run.stdout);
  assertObligationLast(run);
});
