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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * A scratch retirement root: the three roots, plus one victim file that a
 * destructive fixture can be aimed at.
 *
 * THIS EXISTS BECAUSE THE RED ARM OF A DESTRUCTIVE WITNESS MUST NOT BE ABLE TO
 * DESTROY ITS SUBJECT. The first version of the allowlist test set a row's
 * `verified-by` to `rm -rf delivery/plan/cutover` and ran the checker with
 * `--repo` pointed at the REAL repository root. The screen refuses `rm` today,
 * so nothing happened, and that is exactly the problem: the witness's red arm
 * is "the screen failed", and in that state the command deletes a tracked
 * directory of the working tree before the assertion fires. A clean-room
 * reviewer raised it, and the fix is to give the destructive fixtures a tree of
 * their own rather than to trust the guard they are testing.
 */
function scratchRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-retirement-root-"));
  mkdirSync(join(dir, ".claude", "skills"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "CLAUDE.md"), "# Lab rules\n");
  writeFileSync(join(dir, ".claude", "skills", "SKILL.md"), "# Lab skill\n");
  writeFileSync(join(dir, ".claude", "orchestrator-next.mjs"), "export const LAB = 1;\n");
  writeFileSync(join(dir, "src", "victim.txt"), VICTIM);
  /* One file from WIDENED_SURFACE, so a widening search in this root has
   * something to search. Its text carries `widget` and deliberately not the
   * probe the other scratch fixtures use. */
  writeFileSync(join(dir, "AGENTS.md"), "The kernel brief. It carries the word widget.\n");
  return dir;
}

const VICTIM = "IMPORTANT ORIGINAL CONTENT\n";

/** The rows that resolve a `scratchRoot`, with row 0 carrying `command`. */
function scratchRows(command: string): Row[] {
  const anchors = [
    { id: "claude-md:lab-rules", file: "CLAUDE.md", line: 1, kind: "heading", text: "# Lab rules" },
    { id: "skill-skills:lab-skill", file: ".claude/skills/SKILL.md", line: 1, kind: "heading", text: "# Lab skill" },
    { id: "next-script:lab", file: ".claude/orchestrator-next.mjs", line: 1, kind: "binding", text: "export const LAB = 1;" },
  ];
  return anchors.map((a, i) => ({
    ...a,
    status: i === 0 ? "FALSE" : "GAP",
    disposition: "KEEP",
    gap: "lab fixture, nothing is missing anywhere",
    correction: i === 0 ? "lab fixture" : undefined,
    "dr0029-side": "process",
    "verified-by":
      i === 0
        ? { command, exit: 0, output: "(lab)" }
        : { command: "grep -c 'LAB' src/victim.txt", exit: 1, output: "0" },
  })) as unknown as Row[];
}

/** Run the checker against a scratch root, never against the repository. */
function checkScratch(root: string, rows: Row[], extra: string[] = []) {
  const path = join(root, "candidate.json");
  writeFileSync(path, JSON.stringify({ rows }, null, 2));
  return spawnSync(process.execPath, [checker, "--repo", root, "--json", path, ...extra], {
    encoding: "utf8",
  });
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

/**
 * THE SCREEN IS A LIST OF TOOLS THAT CANNOT WRITE, and that is a stronger claim
 * than "a list of tools that look harmless". Two structurally different write
 * paths, because one member is not a class: `sed -i` reaches the write through
 * an IN-PLACE EDITOR FLAG, and `sort -o` reaches it through an OUTPUT FLAG on an
 * ordinary filter. Both were on the allowlist before this fix round and both
 * were measured executing against the tree the checker was auditing: `sed -i`
 * rewrote the victim file, `sort -o` truncated it to zero bytes.
 *
 * Every arm runs against a scratch root. If the screen regresses, this test
 * fails and destroys a temporary directory.
 */
for (const [label, command, tool] of [
  ["an in-place editor flag", "sed -i s/ORIGINAL/DESTROYED/ src/victim.txt", "sed"],
  ["an output flag on a filter", "sort -o src/victim.txt /dev/null", "sort"],
] as const) {
  test(`retirement checker refuses a write-capable tool reached through ${label}`, () => {
    const root = scratchRoot();
    const result = checkScratch(root, scratchRows(command));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`verified-by command segment starts with "${tool}", which is not on the allowlist`),
    );
    /* The refusal is a screen, not a report: the file it was aimed at is intact. */
    assert.equal(readFileSync(join(root, "src", "victim.txt"), "utf8"), VICTIM);
  });
}

/**
 * The screen's contract, asserted rather than described. This does NOT check
 * that each named tool lacks a write option: that is a fact about the tool, not
 * about the checker, and nothing in this repository can settle it. What it does
 * is make widening the list fail the suite, so a tenth name has to be argued
 * for in a diff instead of appearing in one.
 *
 * The import is by computed URL because a literal relative path from `test/`
 * does not survive the project reference (standing warning 4).
 */
test("the command allowlist is pinned, so widening it is a deliberate edit", async () => {
  const mod = (await import(new URL("../scripts/check-retirement-inventory.mjs", import.meta.url).href)) as {
    ALLOWED_FIRST_TOKENS: Set<string>;
  };
  assert.deepEqual(
    [...mod.ALLOWED_FIRST_TOKENS].sort(),
    ["cat", "comm", "diff", "grep", "head", "ls", "tail", "test", "wc"],
  );
});

/**
 * The widening grep's own outcome, classified.
 *
 * The SPAWN-ERROR arm is forced end to end by the test above. The EXIT-2 arm is
 * not, and I say so rather than implying otherwise: this container runs the
 * suite as uid 0, so the obvious forcing move (an unreadable directory on the
 * search surface) still gives grep exit 1, and a symlink loop gives exit 1 too
 * because `grep -r` does not follow symlinks. Both measured. So exit 2 is
 * exercised at the classifier and not along the whole path, which is the weaker
 * of the two and is the strongest I found.
 */
test("an errored widening grep is classified as a non-answer, not as no hits", async () => {
  const mod = (await import(new URL("../scripts/check-retirement-inventory.mjs", import.meta.url).href)) as {
    unexpectedGrepStatus: (s: number | null, e?: unknown, sig?: unknown) => string | null;
  };
  assert.equal(mod.unexpectedGrepStatus(0, null, null), null, "found is an answer");
  assert.equal(mod.unexpectedGrepStatus(1, null, null), null, "not found is an answer");
  assert.match(String(mod.unexpectedGrepStatus(2, null, null)), /exited 2, which is an error/);
  assert.match(
    String(mod.unexpectedGrepStatus(null, new Error("ENOENT"), null)),
    /did not run: ENOENT/,
  );
  assert.match(String(mod.unexpectedGrepStatus(null, null, "SIGKILL")), /terminated by signal SIGKILL/);
});

/**
 * THE FAIL-OPEN THE FIX ROUND PUT IN ITS OWN NEW CODE, and then took out.
 *
 * The first version of the widening read `if (r.status === 0)` and otherwise
 * left the hit list empty, so a widening grep that ERRORED was
 * indistinguishable from one that found nothing, and "found nothing" is exactly
 * the verdict that lets the absence stand. It is the shape this whole round is
 * about, one level in.
 *
 * Forced end to end rather than described: the checker runs with a PATH holding
 * no `grep`, so `spawnSync` returns an error and never a status.
 * `process.execPath` is absolute, so node itself still starts. Measured against
 * the pre-fix variant, the only finding was "verified-by did not run" and the
 * absence claim passed in silence.
 */
test("an absence whose widening grep could not run is UNVERIFIED, not confirmed", () => {
  const root = scratchRoot();
  const empty = mkdtempSync(join(tmpdir(), "tiphys-retirement-nobin-"));
  const rows = scratchRows("grep -c 'widget' AGENTS.md").map((r) => ({
    ...r,
    "verified-by": { command: "grep -c 'widget' AGENTS.md", exit: 1, output: "0" },
  })) as Row[];
  const path = join(root, "candidate.json");
  writeFileSync(path, JSON.stringify({ rows }, null, 2));
  const result = spawnSync(process.execPath, [checker, "--repo", root, "--json", path], {
    encoding: "utf8",
    env: { ...process.env, PATH: empty },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /verified-by exits 1 \(an absence claim\) and the widening grep did not run: .*, so the absence is UNVERIFIED/,
  );
});

test("retirement checker refuses a command outside the allowlist without running it", () => {
  /* `rm` is the plainest member and the one a mistyped row is likeliest to
   * reach for. It is aimed at a scratch root, never at delivery/plan/cutover. */
  const root = scratchRoot();
  const result = checkScratch(root, scratchRows("rm -rf src"));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /verified-by command segment starts with "rm", which is not on the allowlist/);
  assert.equal(readFileSync(join(root, "src", "victim.txt"), "utf8"), VICTIM);
  /* And the real inventory, which an earlier version of this test aimed at. */
  assert.equal(spawnSync("test", ["-f", inventoryPath]).status, 0);
});

/**
 * A COMMAND THAT FAILED TO RUN IS NOT A COMMAND THAT ANSWERED, and the checker
 * could not tell those apart until this fix round. A row shipped carrying a
 * shell-quoting error whose recorded exit was 2 and whose note beside it read
 * "Re-verified in this phase and still TRUE". Nothing was searched, and the
 * checker was green, because an exit that means "I could not run" reproduces
 * forever.
 *
 * Two structurally different members: a TOOL-SPECIFIC error code on a
 * `verified-by`, and the SHELL's own "not found" on a `negative-witness`, which
 * is the sharper of the two because there the contract is only "exit nonzero"
 * and a usage error satisfies it perfectly while discriminating nothing.
 */
test("retirement checker reddens on a verified-by whose recorded exit is a grep usage error", () => {
  const rows = sample(2);
  rows[0]["verified-by"] = {
    command: "grep -c -- --registry AGENTS.md",
    exit: 2,
    output: "grep: unrecognized option '-- --registry'",
  };
  const result = check(rows, ["--no-execute"]);
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    new RegExp(`${rows[0].id}: verified-by records exit 2, which is not an answer`),
  );
});

test("retirement checker reddens on a negative witness whose recorded exit is the shell's not-found", () => {
  const rows = sample(2);
  const i = firstPortRowIndex(rows);
  const nw = rows[i]["negative-witness"];
  assert.ok(nw !== undefined);
  nw.exit = 127;
  const result = check(rows, ["--no-execute"]);
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    new RegExp(`${rows[i].id}: negative-witness records exit 127, which is not an answer`),
  );
});

/**
 * THE WORD BEING ABSENT IS NOT THE RULE BEING ABSENT. A row whose `verified-by`
 * exits nonzero is making an absence claim, and the claim its prose makes is
 * always wider than the claim its command proved. This shipped: the C-3 row
 * greped for the literal token `auto-background` across five files, exited 1,
 * and concluded that C-3 was stated in no instruction channel at all. It is
 * stated in `AGENTS.md`, in different words.
 *
 * Two structurally different members: the declaration is ABSENT, and the
 * declaration is PRESENT BUT INCOMPLETE. The second is the one that matters,
 * because a checker that only looks for a field is the guard this repository
 * has shipped three times and the one that cannot go red.
 */
test("retirement checker reddens on an absence row with no widened block when the token is carried", () => {
  const rows = sample(2);
  rows[0]["verified-by"] = { command: "grep -c 'mandated-reading' bin/tiphys.ts", exit: 1, output: "0" };
  delete rows[0].widened;
  const result = check(rows);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`${rows[0].id}: verified-by exits 1, so the row claims an absence`));
});

test("retirement checker reddens on a widened block whose hit-paths omit a carrying file", () => {
  const rows = sample(2);
  rows[0]["verified-by"] = { command: "grep -c 'mandated-reading' bin/tiphys.ts", exit: 1, output: "0" };
  rows[0].widened = {
    "hit-paths": [],
    read: "a declaration that names nothing, which is the shape that must not pass",
  };
  const result = check(rows);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`${rows[0].id}: widened absence: .* is not in the row's reviewed hit-paths`));
});

test("retirement checker reddens on an absence that is only an absence of that spelling", () => {
  /* The third member, and a different arm of the same mechanism: the surface
   * searched was RIGHT and the search was WRONG. `grep -c 'DELEGATED' <file>`
   * exits 1 against a file that carries `delegated` twice. Widening the TREES
   * cannot catch this, so the row's own files are widened over too. */
  const rows = sample(2);
  rows[0]["verified-by"] = {
    command: "grep -c 'MANDATED-READING' AGENTS.md",
    exit: 1,
    output: "0",
  };
  delete rows[0].widened;
  const result = check(rows);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`${rows[0].id}: verified-by exits 1, so the row claims an absence`));
  assert.match(result.stdout, /AGENTS\.md/);
});

/**
 * FENCED BLOCKS ARE NOT RULES. Two structurally different members inside one
 * fence, because the grammar has four markdown kinds and a fence swallows more
 * than one of them: a column-zero BULLET and a column-zero HEADING, the second
 * of which is how every shell comment in this repository's fenced examples
 * begins. Measured on the real roots, with and without the fence state machine:
 * the two anchor lists are byte-identical, so this is a trip wire for the next
 * editor rather than a correction to today's count.
 */
test("retirement extraction does not read rules out of fenced code blocks", () => {
  const root = scratchRoot();
  writeFileSync(
    join(root, "CLAUDE.md"),
    ["# Lab rules", "", "Run the check like this:", "", "```", "- Never do the thing.", "# a shell comment", "```", "", "That is all."].join("\n") + "\n",
  );
  const extract = spawnSync(process.execPath, [checker, "--repo", root, "--extract"], {
    encoding: "utf8",
  });
  assert.equal(extract.status, 0, extract.stderr);
  assert.ok(extract.stdout.includes("claude-md:lab-rules"), "the real heading outside the fence is still a rule");
  assert.ok(!extract.stdout.includes("never-do-the-thing"), "the fenced bullet is not a rule");
  assert.ok(!extract.stdout.includes("a-shell-comment"), "the fenced heading is not a rule");
});

/**
 * V-2's second member. The class is "a fence hides a rule", and the committed
 * pair for it differed in ANCHOR KIND (a bullet and a heading) while being
 * identical in FENCE KIND (both at column zero), so it proved the grammar half
 * twice and the fence-recognition half once. This member differs in FENCE KIND:
 * the same three anchor kinds inside a fence indented by three spaces, which is
 * what CommonMark allows and what this repository writes inside numbered list
 * items. It was RED before FENCE_RE gained its three-space prefix, producing
 * three phantom anchors.
 */
/**
 * V-1. ARM 2 OF THE WIDENING, AND ITS DANGEROUS STATE.
 *
 * The widening searches WIDENED_SURFACE **plus the files the row's own command
 * named**, and that second arm exists for one family the surface cannot reach:
 * a row that ran `grep -c 'DELEGATED' <file>` and recorded exit 1 has proved an
 * absence OF THAT SPELLING from a file that carries `delegated`. The search
 * surface was right and the search was wrong.
 *
 * The committed suite did not witness it. A delta verifier replaced
 * `argumentPathsNamed(vb.command, repo)` with `[]`, changed nothing else, and
 * all 27 tests still passed, because the fixture that was cited as its witness
 * greps `AGENTS.md`, which is the FIRST entry of WIDENED_SURFACE: the widening
 * reaches it through the surface with or without arm 2. What that fixture
 * witnesses is case-insensitivity, which is a different property.
 *
 * So the carrying file has to sit OFF the surface, and here it does: `docs/` is
 * in no member of WIDENED_SURFACE, and the scratch root's `AGENTS.md` and
 * `src/` carry nothing relevant. Red without arm 2, green with it.
 */
test("an absence refuted only by the row's OWN file is caught", () => {
  const root = scratchRoot();
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "dr0012.md"), "Merge authority is delegated under DR-0012.\n");
  const rows = scratchRows("grep -c 'DELEGATED' docs/dr0012.md").map((r, i) =>
    i === 0
      ? { ...r, "verified-by": { command: "grep -c 'DELEGATED' docs/dr0012.md", exit: 1, output: "0" } }
      : r,
  );
  const result = checkScratch(root, rows);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /the same pattern "DELEGATED" is carried by docs\/dr0012\.md/);

  /* THE CONTROL, and it is what makes the fixture a witness for ARM 2 rather
   * than for the surface: the same pattern, the same root, the same exit, with
   * the carrying file removed. Nothing anywhere holds the token, so the absence
   * stands and the checker is green. One variable. */
  writeFileSync(join(root, "docs", "dr0012.md"), "Merge authority is a settled question.\n");
  const control = checkScratch(root, rows);
  assert.equal(control.status, 0, control.stdout + control.stderr);
  assert.match(control.stdout, /every rule in the three roots is resolved/);
});

/**
 * THE RETIREMENT REGISTER'S RED ARM. A retired entry is a record, and a record
 * nothing checks is the guard-that-cannot-go-red shape this checker exists
 * against. Two members, structurally different:
 *
 *   A. the retired rule COMES BACK. Its anchor is extractable again, so it owes
 *      a row, and the retirement entry must not be a way to keep it out.
 *   B. `superseded-by` points at a row that is not in the inventory.
 */
test("a retired rule that is extractable again reddens", () => {
  const root = scratchRoot();
  const rows = scratchRows("grep -c 'LAB' src/victim.txt");
  const doc = {
    rows,
    retired: [
      {
        id: "next-script:lab",
        "retired-on": "2026-09-16",
        reason: "the lab binding was removed, says this fixture, while the root still carries it",
      },
    ],
  };
  writeFileSync(join(root, "candidate.json"), JSON.stringify(doc, null, 2));
  const result = spawnSync(
    process.execPath,
    [checker, "--repo", root, "--json", join(root, "candidate.json"), "--no-execute"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /retired next-script:lab: this id IS extractable/);
});

test("a retired entry whose successor is not a row reddens", () => {
  const root = scratchRoot();
  const doc = {
    rows: scratchRows("grep -c 'LAB' src/victim.txt"),
    retired: [
      {
        id: "claude-md:a-rule-that-was-removed",
        "retired-on": "2026-09-16",
        "superseded-by": "claude-md:a-row-that-does-not-exist",
        reason: "the rule was reworded",
      },
    ],
  };
  writeFileSync(join(root, "candidate.json"), JSON.stringify(doc, null, 2));
  const result = spawnSync(
    process.execPath,
    [checker, "--repo", root, "--json", join(root, "candidate.json"), "--no-execute"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /superseded-by names claude-md:a-row-that-does-not-exist, which is not a row/);
});

test("the live inventory's retired entries are checked, not merely stored", () => {
  const doc = JSON.parse(readFileSync(inventoryPath, "utf8")) as {
    rows: Row[];
    retired?: { id: string; reason?: string; "superseded-by"?: string }[];
  };
  const retired = doc.retired ?? [];
  assert.ok(retired.length > 0, "the inventory carries at least one retired row");
  const rowIds = new Set(doc.rows.map((r) => r.id));
  /* BY NAME, never by count: the register is append-only and the next
   * retirement must not redden this. */
  for (const entry of retired) {
    assert.ok(entry.reason !== undefined && entry.reason.trim() !== "", `${entry.id} carries a reason`);
    const sup = entry["superseded-by"];
    if (sup !== undefined && sup !== null) assert.ok(rowIds.has(sup), `${entry.id} supersedes a live row`);
  }
});

test("retirement extraction does not read rules out of an INDENTED fenced block", () => {
  const root = scratchRoot();
  writeFileSync(
    join(root, "CLAUDE.md"),
    [
      "# Lab rules",
      "",
      "1. Run the check like this:",
      "",
      "   ```",
      "- Never do the thing.",
      "# a shell comment",
      "**A bolded lead-in.**",
      "   ```",
      "",
      "That is all.",
    ].join("\n") + "\n",
  );
  const extract = spawnSync(process.execPath, [checker, "--repo", root, "--extract"], {
    encoding: "utf8",
  });
  assert.equal(extract.status, 0, extract.stderr);
  assert.ok(extract.stdout.includes("claude-md:lab-rules"), "the real heading outside the indented fence is still a rule");
  assert.ok(extract.stdout.includes("claude-md:run-the-check-like-this"), "the numbered item that OPENS the fence is still a rule");
  for (const phantom of ["never-do-the-thing", "a-shell-comment", "a-bolded-lead-in"]) {
    assert.ok(!extract.stdout.includes(phantom), `${phantom} sits inside an indented fence and is not a rule`);
  }
});

/**
 * V-4, one level out from the checker. `widenedHitPaths` filters
 * WIDENED_SURFACE through existsSync, so a member that MOVES makes every
 * absence claim quieter rather than louder, and the function cannot tell a
 * renamed tree from a deliberately absent one because it also runs against
 * scratch roots that hold almost none of the surface. The integrity of the
 * declared surface is a property of THIS repository, so it is asserted here,
 * where a rename reddens the suite by name.
 */
test("every member of the widened surface exists in this repository", async () => {
  const mod = (await import(new URL("../scripts/check-retirement-inventory.mjs", import.meta.url).href)) as {
    WIDENED_SURFACE: string[];
  };
  assert.ok(mod.WIDENED_SURFACE.length > 0, "the widened surface is not empty");
  const missing = mod.WIDENED_SURFACE.filter((m) => !existsSync(join(repo, m)));
  assert.deepEqual(missing, [], "a surface member that has moved silently narrows every absence claim");
});

/**
 * V-4's fail-closed arm, and the DANGEROUS state is the one the S1 fix removed
 * from the errored-grep path: nothing to search returning the
 * confirm-the-absence verdict. The fixture is a root carrying NO member of the
 * widened surface at all, so `present.length` is zero and the row's absence
 * cannot be re-established.
 */
test("an absence with nothing to search is UNVERIFIED, not confirmed", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-retirement-bare-"));
  mkdirSync(join(root, ".claude", "skills"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "CLAUDE.md"), "# Lab rules\n");
  writeFileSync(join(root, ".claude", "skills", "SKILL.md"), "# Lab skill\n");
  writeFileSync(join(root, ".claude", "orchestrator-next.mjs"), "export const LAB = 1;\n");
  /* The row's own file is OUTSIDE the surface too, so `extra` adds nothing that
   * exists and the survivor set is genuinely empty. */
  writeFileSync(join(root, "docs", "notes.md"), "nothing relevant here\n");
  const rows = scratchRows("grep -c 'ABSENTTOKEN' docs/notes.md").map((r, i) =>
    i === 0 ? { ...r, "verified-by": { command: "grep -c 'ABSENTTOKEN' docs/notes.md", exit: 1, output: "0" } } : r,
  );
  const result = checkScratch(root, rows);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /no member of the widened surface exists in this checkout/);
  assert.match(result.stdout, /the absence is UNVERIFIED/);
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
