/**
 * The retirement inventory checker (M4-P23).
 *
 * THE RED WITNESS THESE TESTS EXIST FOR. The dangerous state is not an absent
 * checker: it is a checker that reads the rows and reports green because the
 * FIELDS ARE PRESENT. That is the guard this repository has shipped three times
 * and it is the one that cannot go red. So the class has two structurally
 * different members:
 *
 *   A. a row with no `verified-by` at all      (an ABSENT field)
 *   B. a PORT row whose `negative-witness` command EXITS 0 (a PRESENT field
 *      that asserts nothing)
 *
 * Member B carries the proof that the guard is real, because the same fixture
 * is GREEN under `--no-execute`, which is the field-checking checker exactly.
 * One invocation says every rule is resolved; the other says the probe
 * discriminates nothing. That pair is the witness.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const checker = fileURLToPath(new URL("../scripts/check-retirement-inventory.mjs", import.meta.url));
const inventoryPath = fileURLToPath(
  new URL("../delivery/plan/cutover/retirement-inventory.json", import.meta.url),
);

interface Row {
  id: string;
  status: string;
  disposition: string;
  probe?: string;
  destination?: string;
  "verified-by"?: { command: string; exit: number; output: string };
  "negative-witness"?: { kind: string; command: string; exit: number; output: string };
  [k: string]: unknown;
}

function realRows(): Row[] {
  return (JSON.parse(readFileSync(inventoryPath, "utf8")) as { rows: Row[] }).rows;
}

/** Write a candidate inventory to a scratch file and check it against the REAL roots. */
function check(rows: Row[], extra: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-retirement-"));
  const path = join(dir, "candidate.json");
  writeFileSync(path, JSON.stringify({ rows }, null, 2));
  return spawnSync(process.execPath, [checker, "--repo", repo, "--json", path, ...extra], {
    encoding: "utf8",
  });
}

/** A few real rows, so a negative fixture is small and its execution is cheap. */
function sample(n: number): Row[] {
  return realRows()
    .filter((r) => r.disposition === "PORT")
    .slice(0, n)
    .map((r) => JSON.parse(JSON.stringify(r)) as Row);
}

function firstPortRowIndex(rows: Row[]): number {
  const i = rows.findIndex((r) => r.disposition === "PORT" && r["negative-witness"] !== undefined);
  assert.ok(i >= 0, "the inventory carries at least one PORT row with a negative witness");
  return i;
}

test("retirement inventory resolves every rule in the three roots", () => {
  const result = spawnSync(process.execPath, [checker, "--repo", repo], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /commands EXECUTED/);
  assert.match(result.stdout, /every rule in the three roots is resolved/);
});

test("retirement checker reddens on a row with no verified-by block", () => {
  const rows = sample(3);
  delete rows[0]["verified-by"];
  const result = check(rows);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`${rows[0].id}: no verified-by block`));
});

test("retirement checker reddens on a negative witness that exits 0", () => {
  const rows = realRows();
  const i = firstPortRowIndex(rows);
  /* THE VACUOUS WITNESS, in the shape a careless author actually writes it: a
   * multi-file grep whose subject list still INCLUDES the destination. It is a
   * different command from `verified-by`, it carries the probe, its kind is
   * declared, and it can never go red. Every field check passes.
   *
   * The first draft of this fixture just re-ran the verified-by command, and the
   * structural pass caught it as byte-identical, which is worth recording: that
   * cheap check exists, and it is not the one under test here. */
  const dest = rows[i].destination;
  const subjects = dest === "AGENTS.md" ? `roles/implementer.md ${dest}` : `AGENTS.md ${dest}`;
  rows[i]["negative-witness"] = {
    kind: "sibling",
    command: `grep -c '${rows[i].probe}' ${subjects}`,
    exit: 1,
    output: "0",
  };

  const executed = check(rows);
  assert.equal(executed.status, 1);
  assert.match(
    executed.stdout,
    new RegExp(`${rows[i].id}: negative-witness exits 0: the probe does not discriminate`),
  );

  /* THE CONTROL, and it is the point of the test: the field-checking checker
   * calls the same fixture clean. */
  const structural = check(rows, ["--no-execute"]);
  assert.equal(structural.status, 0, structural.stdout + structural.stderr);
  assert.match(structural.stdout, /structure only, commands NOT executed/);
  assert.match(structural.stdout, /every rule in the three roots is resolved/);
});

test("retirement checker reddens on a negative witness that runs a different probe", () => {
  const rows = sample(3);
  const i = firstPortRowIndex(rows);
  rows[i]["negative-witness"] = {
    kind: "sibling",
    command: "grep -c 'a-string-no-kernel-artifact-contains' templates/warnings.md",
    exit: 1,
    output: "0",
  };
  const result = check(rows);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`${rows[i].id}: negative-witness does not carry the probe`));
});

test("retirement checker reddens on a rule with no row", () => {
  const rows = realRows();
  const dropped = rows.pop();
  assert.ok(dropped !== undefined);
  const result = check(rows, ["--no-execute"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`${dropped.id}: rule at .* has NO row`));
});

test("retirement checker reddens on a row whose rule is not extractable", () => {
  const rows = sample(2);
  rows[0].id = "claude-md:a-rule-that-was-reworded-or-removed";
  const result = check(rows);
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /claude-md:a-rule-that-was-reworded-or-removed: no rule with this id is extractable/,
  );
});

test("retirement checker reddens when verified-by names no kernel path", () => {
  const rows = sample(2);
  rows[0]["verified-by"] = { command: "test -f CLAUDE.md", exit: 0, output: "(no output)" };
  const result = check(rows);
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    new RegExp(`${rows[0].id}: verified-by names no existing path outside the three retirement roots`),
  );
});

test("retirement checker reddens when a recorded exit code no longer reproduces", () => {
  const rows = sample(2);
  const vb = rows[0]["verified-by"];
  assert.ok(vb !== undefined);
  vb.exit = 42;
  const result = check(rows);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`${rows[0].id}: verified-by recorded exit 42 and now exits`));
});

test("retirement checker refuses a command outside the allowlist without running it", () => {
  const rows = sample(2);
  rows[0]["verified-by"] = {
    command: "rm -rf delivery/plan/cutover",
    exit: 0,
    output: "(no output)",
  };
  const result = check(rows);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /verified-by command segment starts with "rm", which is not on the allowlist/);
  /* The refusal is a screen, not a report: the tree it names is still here. */
  assert.equal(spawnSync("test", ["-f", inventoryPath]).status, 0);
});

test("retirement checker reddens when no row is marked FALSE", () => {
  const rows = realRows().map((r) =>
    r.status === "FALSE" ? { ...r, status: "GAP", gap: "made up for this fixture" } : r,
  );
  const result = check(rows, ["--no-execute"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /no row is marked FALSE/);
});

test("retirement checker reddens when a PORT row claims a status other than PORTED", () => {
  const rows = sample(2);
  rows[0].status = "GAP";
  const result = check(rows, ["--no-execute"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`${rows[0].id}: disposition PORT requires status PORTED`));
});

test("retirement checker reddens on a GAP row that does not name what is missing", () => {
  const rows = realRows().filter((r) => r.status === "GAP").slice(0, 2);
  assert.ok(rows.length === 2, "the inventory carries GAP rows");
  delete rows[0].gap;
  const result = check(rows, ["--no-execute"]);
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    new RegExp(`${rows[0].id}: status GAP requires a gap field naming the kernel destination`),
  );
});

test("retirement checker exits 2 rather than green on an unreadable inventory", () => {
  const missing = spawnSync(
    process.execPath,
    [checker, "--repo", repo, "--json", join(tmpdir(), "tiphys-no-such-inventory.json")],
    { encoding: "utf8" },
  );
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read/);
});

test("retirement checker exits 2 rather than green when the derivation finds no rules", () => {
  const empty = mkdtempSync(join(tmpdir(), "tiphys-retirement-empty-"));
  writeFileSync(join(empty, "inventory.json"), JSON.stringify({ rows: [] }));
  const result = spawnSync(
    process.execPath,
    [checker, "--repo", empty, "--json", join(empty, "inventory.json")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /broken derivation/);
});

test("retirement extraction is deterministic and covers all three roots", () => {
  const first = spawnSync(process.execPath, [checker, "--repo", repo, "--extract"], {
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr);
  const second = spawnSync(process.execPath, [checker, "--repo", repo, "--extract"], {
    encoding: "utf8",
  });
  assert.equal(second.stdout, first.stdout);

  /* BY NAME, never by count: the number of rules is derived and will change the
   * next time a rule is written, so nothing here pins it. What is asserted is
   * that every root is represented and that the inventory's ids are exactly the
   * extracted ids. */
  const ids = new Set(
    first.stdout
      .split("\n")
      .filter((l) => l !== "" && !l.startsWith("#"))
      .map((l) => l.split("\t")[0]),
  );
  for (const root of ["CLAUDE.md", ".claude/skills", ".claude/orchestrator-next.mjs"]) {
    assert.ok(
      first.stdout.split("\n").some((l) => l.includes(`\t${root}`) || l.includes(`\t${root}/`)),
      `extraction covers ${root}`,
    );
  }
  const rowIds = new Set(realRows().map((r) => r.id));
  assert.deepEqual([...ids].filter((i) => !rowIds.has(i)), []);
  assert.deepEqual([...rowIds].filter((i) => !ids.has(i)), []);
});

test("retirement inventory deletes nothing from the three roots in this phase", () => {
  /* Criterion 7 needs no separate mechanism: a deletion removes an anchor and
   * the surviving row goes red as stale. This asserts the three roots are still
   * present and still producing rules, which is the precondition that makes the
   * set-equality check meaningful rather than vacuously true over nothing. */
  const extract = spawnSync(process.execPath, [checker, "--repo", repo, "--extract"], {
    encoding: "utf8",
  });
  assert.equal(extract.status, 0);
  for (const root of ["CLAUDE.md", ".claude/skills/phase-delivery/SKILL.md", ".claude/orchestrator-next.mjs"]) {
    assert.ok(extract.stdout.includes(`\t${root}:`), `${root} still carries rules`);
  }
});
