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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/* ------------------------------------------------------------------------ *
 * M5-P5, the context diet.
 *
 * THE DANGEROUS STATE here is a removal whose disposition LOOKS evidenced and
 * is not. The cheapest such evidence is the one M4-P23 used for its PORT rows:
 * a grep for a keyword the removed block shares with some other file. The word
 * "watchdog" is in a dozen documents, so a grep for it exits 0 whether or not
 * the removed block's CONTENT survives anywhere. So a diet entry must carry
 * evidence a keyword cannot give: a multi-word quote that is found AT a named
 * line range of a file that existed at the diet baseline, plus the quote of the
 * rule that stayed. And it must not carry a probe command at all.
 *
 * BINDING TEXT IS AN ALLOWLIST (the fresh-implementer round). Two earlier
 * rounds defined NON-binding text by a list of labels, and any phrasing not on
 * the list passed. Now the structure of CLAUDE.md and AGENTS.md is parsed, and
 * a line is binding only when BOTH hold:
 *
 *   - it is a paragraph, list item, table row, heading or registered-binding
 *     frontmatter line, and NOT inside a fence, an HTML comment, a <details>
 *     block, any other HTML block, a blockquote or an indented code block;
 *   - every heading above it is registered `binding` in the `binding-headings`
 *     register in delivery/plan/cutover/retirement-inventory.json.
 *
 * Every heading in those files, ATX or Setext, must be in the register, so a
 * new `## Archive` is a finding rather than a silent pass. Text before the
 * first heading is not binding. Anything the parser does not recognise as a
 * paragraph or list item is not binding, which is the safe direction: a rule
 * moved there reads as REMOVED.
 *
 * WHAT A TEST CANNOT CLASSIFY, stated rather than hidden: a disclaimer written
 * in prose inside a binding section ("the list below no longer applies"). So
 * every match of a broad disclaimer word list in binding text is a finding of
 * its own unless an acknowledgement quote in the register covers it and occurs
 * exactly once. The acknowledgement is the human decision. A disclaimer in
 * words that are not on the list still passes, and that is the residue.
 *
 * STATE.md IS NOT A RULE FILE and is rewritten by every standing update. No
 * diet check reads its volatile text: status evidence is read at a pinned
 * revision that must be the diet baseline, or inside a registered stable section,
 * or in CLAUDE.md or AGENTS.md binding text, or in a file the diet does not
 * prune; the archived entry's pointer is derived from its own line range.
 * ------------------------------------------------------------------------ */

const DIET_FILES = ["CLAUDE.md", "AGENTS.md", "delivery/STATE.md"];
/** The rule files: registered, completeness-checked, and the only home of a kept rule. */
const RULE_FILES = ["CLAUDE.md", "AGENTS.md"];
const STATE_FILE = "delivery/STATE.md";
const STATE_ONLY = ["superseded-status", "archived"];
const DIET_KINDS = [
  "exact-duplicate",
  "mechanically-enforced",
  "history-moved",
  "corrected",
  ...STATE_ONLY,
];
/** A moved-history quote: long enough to be a sentence, not a phrase. */
const MIN_RECORD_WORDS = 8;
/**
 * Every other "this text is here" quote. A heading ("## M4 closure" is three
 * words) names a section rather than showing its content, so six is the floor.
 */
const MIN_RULE_WORDS = 6;
/**
 * An open owner action's register item. Every bold lead line in the register
 * is under 15 words and the shortest open item at the diet head is 39 words
 * (A-10), so 25 refuses an item cut back to its lead and passes every real one.
 */
const MIN_ACTION_WORDS = 25;
const DIET_BASELINE = "6dc5b06";
/**
 * Open owner actions whose register item is not on this branch, BY ID. A-14
 * was allocated on claude/m5-p1-pulse-value-proof and reaches the register
 * when that phase merges. A phrase in the bullet exempts nothing.
 */
const OPEN_ACTION_EXEMPT = ["A-14"];
/**
 * The disclaimer tripwire. Broad on purpose: a false hit costs one reviewed
 * acknowledgement, a miss costs a rule. It is still a word list, so it is a
 * tripwire and not a classifier.
 */
const DISCLAIMER =
  /\b(obsolete|deprecated|no longer|not binding|non-binding|for reference|historical|superseded|supersedes|superseding|archived|retired|kept for|legacy|withdrawn|withdrew|outdated)\b/gi;

interface Quote {
  at?: string;
  file?: string;
  rev?: string;
  quote?: string;
}
interface DietEntry {
  id?: string;
  file?: string;
  baseline?: string;
  lines?: [number, number];
  first?: string;
  last?: string;
  disposition?: string;
  reason?: string;
  retires?: string[];
  history?: Quote;
  "rule-kept"?: Quote;
  authority?: Quote;
  replacement?: Quote;
  "superseded-by"?: Quote;
  "duplicate-of"?: Quote;
  "enforced-by"?: { script?: string; gate?: string; test?: string; asserts?: string };
  [k: string]: unknown;
}
interface HeadingRegister {
  frontmatter?: string;
  headings: { heading: string; class: string }[];
}
interface DietDoc {
  rows: Row[];
  retired: { id: string; diet?: string }[];
  diet: DietEntry[];
  "binding-headings"?: Record<string, HeadingRegister>;
  "state-stable-sections"?: string[];
  "disclaimers-acknowledged"?: { file: string; quote: string; reason: string }[];
}

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
const withoutLineNumbers = (s: string) => s.replace(/(\.[A-Za-z0-9]+:)\d+(?:-\d+)?/g, "$1N");
const wordCount = (s: string) => normalise(s).split(" ").filter((w) => w !== "").length;

type LineKind =
  | "blank"
  | "heading"
  | "underline"
  | "paragraph"
  | "list"
  | "table"
  | "frontmatter"
  | "fence"
  | "comment"
  | "details"
  | "html"
  | "quote"
  | "code"
  | "rule";
/** The kinds that can carry binding text. Everything else is not binding. */
const LIVE_KINDS: ReadonlySet<LineKind> = new Set(["heading", "underline", "paragraph", "list", "table", "frontmatter"]);

interface Parsed {
  kinds: LineKind[];
  /** Per line, the keys of every heading above it (its own included for a heading line). */
  chains: string[][];
  /** Every heading: its key and its 1-based first line. */
  headings: { key: string; line: number }[];
}

/**
 * Classify every line by Markdown block structure. The rules follow CommonMark
 * closely enough for these files and err toward NOT-binding when unsure.
 */
function parseMarkdown(text: string): Parsed {
  const lines = text.split("\n");
  const kinds: LineKind[] = lines.map(() => "blank");
  const headAt: ({ level: number; key: string } | null)[] = lines.map(() => null);
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.findIndex((l, k) => k > 0 && l === "---");
    if (close > 0) {
      for (let k = 0; k <= close; k++) kinds[k] = "frontmatter";
      i = close + 1;
    }
  }
  let fence = "";
  let comment = false;
  let details = false;
  let html = false;
  let inList = false;
  let prev: LineKind = "blank";
  for (; i < lines.length; i++) {
    const l = lines[i];
    let kind: LineKind;
    if (fence !== "") {
      kind = "fence";
      if (new RegExp(`^\\s*${fence}`).test(l)) fence = "";
    } else if (comment) {
      kind = "comment";
      if (l.includes("-->")) comment = false;
    } else if (details) {
      kind = "details";
      if (/<\/details>/i.test(l)) details = false;
    } else if (html) {
      if (l.trim() === "") {
        html = false;
        kind = "blank";
      } else kind = "html";
    } else if (l.trim() === "") {
      kind = "blank";
    } else if (/^\s*(```|~~~)/.test(l)) {
      kind = "fence";
      fence = /^\s*(```|~~~)/.exec(l)![1];
    } else if (l.includes("<!--")) {
      kind = "comment";
      comment = !l.slice(l.indexOf("<!--") + 4).includes("-->");
    } else if (/^\s*<details\b/i.test(l)) {
      kind = "details";
      details = !/<\/details>/i.test(l);
    } else if (/^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(\s|>|\/|$)/.test(l)) {
      kind = "html";
      html = true;
    } else if (/^ {0,3}>/.test(l) || (prev === "quote" && !/^ {0,3}(#|[-*+] |\d+[.)] |\|)/.test(l))) {
      kind = "quote";
    } else if (/^ {0,3}(#{1,6})(\s|$)/.test(l)) {
      kind = "heading";
      inList = false;
      const m = /^ {0,3}(#{1,6})\s*(.*?)\s*#*\s*$/.exec(l)!;
      headAt[i] = { level: m[1].length, key: `${m[1]} ${normalise(m[2])}` };
    } else if (/^ {0,3}(=+|-+)\s*$/.test(l) && prev === "paragraph") {
      // A Setext underline: the paragraph above it is the heading.
      kind = "underline";
      let k = i - 1;
      while (k >= 0 && kinds[k] === "paragraph") k--;
      const start = k + 1;
      const level = l.trim().startsWith("=") ? 1 : 2;
      for (let n = start; n < i; n++) kinds[n] = "heading";
      headAt[start] = { level, key: `${"#".repeat(level)} ${normalise(lines.slice(start, i).join(" "))}` };
      inList = false;
    } else if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) {
      kind = "rule";
    } else if (/^ {0,3}\|/.test(l)) {
      kind = "table";
    } else if (/^( {4}|\t)/.test(l)) {
      // Four or more spaces: a continuation or a nested item inside a list or
      // paragraph, and otherwise an indented code block.
      if (prev === "paragraph" || prev === "list") kind = prev;
      else if (prev === "blank" && inList) kind = "list";
      else kind = "code";
    } else if (/^ {0,3}([-*+]|\d{1,9}[a-z]?[.)])(\s+|$)/.test(l)) {
      kind = "list";
      inList = true;
    } else if (prev === "paragraph" || prev === "list") {
      kind = prev; // a continuation line
    } else if (prev === "blank" && inList && /^ {1,3}\S/.test(l)) {
      kind = "list";
    } else {
      kind = "paragraph";
      inList = false;
    }
    kinds[i] = kind;
    prev = kind;
  }
  const chains: string[][] = [];
  const headings: { key: string; line: number }[] = [];
  const stack: { level: number; key: string }[] = [];
  lines.forEach((_, n) => {
    const h = headAt[n];
    if (h !== null) {
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
      headings.push({ key: h.key, line: n + 1 });
    }
    chains.push(kinds[n] === "frontmatter" ? [] : stack.map((s) => s.key));
  });
  return { kinds, chains, headings };
}

/** One flag per line, true where the line is NOT structurally live. */
function structuralMask(text: string): boolean[] {
  return parseMarkdown(text).kinds.map((k) => !LIVE_KINDS.has(k));
}

/**
 * One flag per line, true where the line is NOT binding in a registered rule
 * file. A file with no register has no binding text at all.
 */
function bindingMask(doc: DietDoc, file: string, text: string): boolean[] {
  const reg = doc["binding-headings"]?.[file];
  const classes = new Map((reg?.headings ?? []).map((h) => [h.heading, h.class]));
  const { kinds, chains } = parseMarkdown(text);
  return kinds.map((k, i) => {
    if (!LIVE_KINDS.has(k)) return true;
    if (k === "frontmatter") return reg?.frontmatter !== "binding";
    const chain = chains[i];
    if (chain.length === 0) return true; // before the first heading
    return !chain.every((key) => classes.get(key) === "binding");
  });
}

function keepUnmasked(text: string, mask: boolean[]): string {
  return text
    .split("\n")
    .filter((_, i) => !mask[i])
    .join("\n");
}

/** Consecutive unmasked non-blank lines, as blocks: [first line, text]. */
function blocks(text: string, mask: boolean[]): [number, string][] {
  const out: [number, string][] = [];
  const lines = text.split("\n");
  let cur: string[] = [];
  let at = 0;
  lines.forEach((l, i) => {
    if (mask[i] || l.trim() === "") {
      if (cur.length > 0) out.push([at, cur.join("\n")]);
      cur = [];
    } else {
      if (cur.length === 0) at = i + 1;
      cur.push(l);
    }
  });
  if (cur.length > 0) out.push([at, cur.join("\n")]);
  return out;
}

/** Why the heading register does not describe the file. Empty means it does. */
function headingFindings(doc: DietDoc, file: string, text: string): string[] {
  const reg = doc["binding-headings"]?.[file];
  if (reg === undefined) return [`${file}: has no binding-heading register`];
  const f: string[] = [];
  const registered = new Map<string, string>();
  for (const h of reg.headings) {
    if (registered.has(h.heading)) f.push(`${file}: heading "${h.heading}" is registered twice`);
    if (h.class !== "binding" && h.class !== "non-binding") f.push(`${file}: heading "${h.heading}" has class ${h.class}`);
    registered.set(h.heading, h.class);
  }
  const present = parseMarkdown(text).headings;
  for (const h of present) {
    if (!registered.has(h.key)) f.push(`${file}: heading "${h.key}" at line ${h.line} is not in the binding-heading register`);
  }
  const keys = new Set(present.map((h) => h.key));
  for (const h of reg.headings) {
    if (!keys.has(h.heading)) f.push(`${file}: registered heading "${h.heading}" is not in the file`);
  }
  return f;
}

/**
 * Every disclaimer word in the binding text of a rule file must sit inside an
 * acknowledged quote, and every acknowledged quote must occur exactly once in
 * that binding text, so a copied acknowledged sentence is a finding too.
 */
function disclaimerFindings(doc: DietDoc, file: string, text: string): string[] {
  const f: string[] = [];
  const acks = (doc["disclaimers-acknowledged"] ?? []).filter((a) => a.file === file);
  const found = new Map<string, number>();
  for (const a of acks) {
    if (wordCount(a.quote) < MIN_RULE_WORDS) f.push(`${file}: acknowledged disclaimer "${a.quote}" is under ${MIN_RULE_WORDS} words`);
    if (typeof a.reason !== "string" || a.reason === "") f.push(`${file}: acknowledged disclaimer "${a.quote}" has no reason`);
    found.set(a.quote, 0);
  }
  for (const [line, raw] of blocks(text, bindingMask(doc, file, text))) {
    const t = withoutLineNumbers(normalise(raw));
    const covered: [number, number][] = [];
    for (const a of acks) {
      const q = withoutLineNumbers(normalise(a.quote));
      for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + 1)) {
        covered.push([at, at + q.length]);
        found.set(a.quote, (found.get(a.quote) ?? 0) + 1);
      }
    }
    for (const m of t.matchAll(DISCLAIMER)) {
      const s = m.index;
      const e = s + m[0].length;
      if (!covered.some(([a, b]) => a <= s && e <= b)) {
        f.push(`${file}: binding text at line ${line} carries the disclaimer "${m[0]}" with no acknowledgement`);
      }
    }
  }
  for (const [q, n] of found) {
    if (n !== 1) f.push(`${file}: acknowledged disclaimer "${q}" occurs ${n} times in binding text, not once`);
  }
  return f;
}

const revCache = new Map<string, string | null>();
function atRevision(rev: string, path: string): string | null {
  const key = `${rev}:${path}`;
  if (!revCache.has(key)) {
    const r = spawnSync("git", ["-C", repo, "show", key], { encoding: "utf8", maxBuffer: 64 << 20 });
    revCache.set(key, r.status === 0 ? r.stdout : null);
  }
  return revCache.get(key) ?? null;
}

function currentText(path: string): string | null {
  const full = join(repo, path);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

/**
 * The text at `path:a` or `path:a-b` in `body`, or null when it does not
 * resolve. With a mask, only its unmasked lines.
 */
function rangeText(body: string, a: number, b: number, mask: boolean[] | null): string | null {
  const lines = body.split("\n");
  if (a < 1 || b < a || b > lines.length) return null;
  return lines
    .slice(a - 1, b)
    .filter((_, i) => mask === null || !mask[a - 1 + i])
    .join("\n");
}
function parsePointer(pointer: string): { path: string; a: number; b: number } | null {
  const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(pointer);
  if (m === null) return null;
  return { path: m[1], a: Number(m[2]), b: m[3] === undefined ? Number(m[2]) : Number(m[3]) };
}

/** The lines of STATE.md whose `## ` section is registered stable. */
function stableStateText(doc: DietDoc, text: string): string {
  const stable = new Set(doc["state-stable-sections"] ?? []);
  let on = false;
  return text
    .split("\n")
    .filter((l) => {
      if (/^## /.test(l)) on = stable.has(l.trim());
      return on;
    })
    .join("\n");
}

interface TestSite {
  file: string;
  body: string;
}
let testCache: Map<string, TestSite[]> | null = null;
/** Every `test("title", ...)` in test/*.test.ts, with the file and its own body. */
function allTests(): Map<string, TestSite[]> {
  if (testCache !== null) return testCache;
  const tests = new Map<string, TestSite[]>();
  const dir = join(repo, "test");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".test.ts")) continue;
    const src = readFileSync(join(dir, f), "utf8");
    const starts = [...src.matchAll(/^test\(\s*"((?:[^"\\]|\\.)*)"/gm)];
    starts.forEach((m, k) => {
      const end = k + 1 < starts.length ? starts[k + 1].index : src.length;
      const site = { file: `test/${f}`, body: src.slice(m.index, end) };
      tests.set(m[1], [...(tests.get(m[1]) ?? []), site]);
    });
  }
  testCache = tests;
  return tests;
}

let ciCache: string | null = null;
/** Everything CI is told to run: the workflows plus the gate manifest. */
function ciText(): string {
  if (ciCache !== null) return ciCache;
  const wf = join(repo, ".github", "workflows");
  const parts = readdirSync(wf)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => readFileSync(join(wf, f), "utf8"));
  parts.push(readFileSync(join(repo, "gates.manifest.json"), "utf8"));
  ciCache = parts.join("\n");
  return ciCache;
}

interface DietWorld {
  current: (path: string) => string | null;
  tests: () => Map<string, TestSite[]>;
  ci: () => string;
}
const realWorld: DietWorld = { current: currentText, tests: allTests, ci: ciText };

/** Every reason a diet register is not evidenced. Empty means it is. */
function checkDiet(doc: DietDoc, world: Partial<DietWorld> = {}): string[] {
  const w: DietWorld = { ...realWorld, ...world };
  const findings: string[] = [];
  const seen = new Set<string>();
  const liveIds = new Set(doc.rows.map((r) => r.id));
  const retiredIds = new Map(doc.retired.map((r) => [r.id, r]));
  const floor = (q: string, min: number, what: string, fail: (m: string) => void) => {
    if (wordCount(q) < min) fail(`${what} quote is under ${min} words, which a keyword can satisfy`);
  };
  /** A kept rule: binding text of a rule file, never anywhere else. */
  const ruleQuote = (q: Quote | undefined, what: string, fail: (m: string) => void) => {
    if (q === undefined || typeof q.file !== "string" || typeof q.quote !== "string") {
      fail(`has no ${what} {file, quote}`);
      return;
    }
    floor(q.quote, MIN_RULE_WORDS, what, fail);
    if (!RULE_FILES.includes(q.file)) {
      fail(`${what} file ${q.file} is not a rule file (${RULE_FILES.join(", ")})`);
      return;
    }
    const body = w.current(q.file);
    if (body === null) fail(`${what} file ${q.file} is absent`);
    else if (!normalise(keepUnmasked(body, bindingMask(doc, q.file, body))).includes(normalise(q.quote))) {
      fail(
        normalise(body).includes(normalise(q.quote))
          ? `${what} quote is in ${q.file} only as non-binding text`
          : `${what} quote is not in ${q.file}`,
      );
    }
  };
  /** A quote AT a line range: raw for history, structurally live for an authority or a pinned status. */
  const pointerQuote = (q: Quote | undefined, min: number, what: string, fail: (m: string) => void, mode: "raw" | "live") => {
    if (q === undefined || typeof q.at !== "string" || typeof q.quote !== "string") {
      fail(`has no ${what} {at, quote}`);
      return null;
    }
    floor(q.quote, min, what, fail);
    const p = parsePointer(q.at);
    const body = p === null ? null : q.rev === undefined ? w.current(p.path) : atRevision(q.rev, p.path);
    // Liveness is a Markdown property; a pinned source or YAML file is read raw.
    const live = mode === "live" && p !== null && p.path.endsWith(".md");
    const text = p === null || body === null ? null : rangeText(body, p.a, p.b, live ? structuralMask(body) : null);
    if (text === null) fail(`${what} pointer ${q.rev === undefined ? "" : `${q.rev}:`}${q.at} does not resolve`);
    else if (!normalise(text).includes(normalise(q.quote))) fail(`${what} quote is not at ${q.at}${mode === "live" ? " in live text" : ""}`);
    return p?.path ?? null;
  };
  /**
   * Status evidence for a STATE.md entry. Pinned (`rev`, `at`): read at the
   * diet baseline, a commit already on `main`, so no later edit changes it and
   * no squash merge can orphan it (a branch commit would vanish from `main`).
   * Unpinned: a rule file's binding text, a registered stable STATE.md
   * section, or the live text of a file the diet does not prune.
   */
  const statusQuote = (q: Quote | undefined, what: string, fail: (m: string) => void) => {
    if (q !== undefined && q.rev !== undefined) {
      if (q.rev !== DIET_BASELINE) {
        fail(`${what} revision ${q.rev} is not the diet baseline ${DIET_BASELINE}, the only pinnable commit`);
        return;
      }
      pointerQuote(q, MIN_RULE_WORDS, what, fail, "live");
      return;
    }
    if (q === undefined || typeof q.file !== "string" || typeof q.quote !== "string") {
      fail(`has no ${what} {file, quote} or {rev, at, quote}`);
      return;
    }
    if (RULE_FILES.includes(q.file)) {
      ruleQuote(q, what, fail);
      return;
    }
    floor(q.quote, MIN_RULE_WORDS, what, fail);
    const body = w.current(q.file);
    if (body === null) {
      fail(`${what} file ${q.file} is absent`);
      return;
    }
    const text =
      q.file === STATE_FILE ? stableStateText(doc, body) : q.file.endsWith(".md") ? keepUnmasked(body, structuralMask(body)) : body;
    if (!normalise(text).includes(normalise(q.quote))) {
      fail(
        q.file === STATE_FILE && normalise(body).includes(normalise(q.quote))
          ? `${what} quote is in ${STATE_FILE} only outside its stable sections, where routine updates rewrite it; pin it with rev`
          : `${what} quote is not in the live text of ${q.file}`,
      );
    }
  };

  for (const e of doc.diet) {
    const id = typeof e.id === "string" && e.id !== "" ? e.id : "<diet entry with no id>";
    const fail = (m: string) => findings.push(`${id}: ${m}`);
    if (seen.has(id)) fail("duplicate id");
    seen.add(id);
    if (typeof e.file !== "string" || !DIET_FILES.includes(e.file)) {
      fail(`file is not one of ${DIET_FILES.join(", ")}`);
      continue;
    }
    if (e.baseline !== DIET_BASELINE) fail(`baseline is not ${DIET_BASELINE}`);
    for (const k of ["verified-by", "probe", "negative-witness"]) {
      if (k in e) fail(`carries a keyword probe (${k}); a diet disposition is evidenced by quotes, not by a grep`);
    }
    const base = atRevision(DIET_BASELINE, e.file);
    if (base === null) {
      fail(`cannot read ${e.file} at ${DIET_BASELINE}; the check needs full history`);
      continue;
    }
    const L = base.split("\n");
    const [a, b] = Array.isArray(e.lines) ? e.lines : [0, 0];
    const rangeOk = Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= a && b <= L.length;
    if (!rangeOk) {
      fail("lines is not a range inside the baseline file");
    } else {
      // A range may carry trailing or leading blank lines; its first and last
      // NON-EMPTY lines are what the entry names.
      const body = L.slice(a - 1, b).filter((l) => l.trim() !== "");
      if (normalise(body[0] ?? "") !== normalise(e.first ?? "")) fail(`baseline lines ${a}-${b} do not begin with the entry's first line`);
      if (normalise(body[body.length - 1] ?? "") !== normalise(e.last ?? "")) fail(`baseline lines ${a}-${b} do not end with the entry's last line`);
    }
    const kind = e.disposition ?? "";
    if (!DIET_KINDS.includes(kind)) {
      fail(`disposition ${kind} is not one of ${DIET_KINDS.join(", ")}`);
      continue;
    }
    if (STATE_ONLY.includes(kind) && e.file !== STATE_FILE) {
      fail(`${kind} is a status disposition and is allowed only for ${STATE_FILE}`);
    }
    if (kind === "exact-duplicate") {
      const d = e["duplicate-of"];
      const body = d?.file === undefined ? null : w.current(d.file);
      if (d?.file === undefined || !RULE_FILES.includes(d.file)) fail(`duplicate-of names no rule file`);
      else if (body === null) fail("duplicate-of file is absent");
      else if (rangeOk) {
        const block = withoutLineNumbers(normalise(L.slice(a - 1, b).join("\n")));
        if (!withoutLineNumbers(normalise(keepUnmasked(body, bindingMask(doc, d.file, body)))).includes(block)) {
          fail(`the whole removed block is not in the binding text of ${d.file}; a shared keyword is not a duplicate`);
        }
      }
    }
    if (kind === "mechanically-enforced") {
      const by = e["enforced-by"];
      const gates = (JSON.parse(readFileSync(join(repo, "gates.manifest.json"), "utf8")) as {
        gates: { id: string }[];
      }).gates.map((g) => g.id);
      const script = typeof by?.script === "string" ? by.script : "";
      const scriptOk = script !== "" && w.current(script) !== null;
      const gateOk = typeof by?.gate === "string" && gates.includes(by.gate);
      if (!scriptOk && !gateOk) fail("enforced-by names no existing script and no manifest gate");
      const name = script.split("/").pop() ?? "";
      if (scriptOk && !w.ci().includes(name)) fail(`enforced-by script ${script} is not run by any workflow or manifest gate`);
      const sites = typeof by?.test === "string" ? (w.tests().get(by.test) ?? []) : [];
      if (sites.length !== 1) {
        fail(sites.length === 0 ? "enforced-by names no existing test title" : "enforced-by names a test title defined more than once");
      } else {
        const site = sites[0];
        if (scriptOk && !site.body.includes(name)) fail(`enforced-by test does not name ${name} in its own body`);
        if (typeof by?.asserts !== "string" || by.asserts.trim().length < 8) {
          fail("enforced-by declares no asserts fragment naming what the test checks");
        } else if (!site.body.includes(by.asserts)) {
          fail(`enforced-by asserts fragment is not in the body of the named test`);
        }
      }
      ruleQuote(e["rule-kept"], "rule-kept", fail);
    }
    if (kind === "history-moved") {
      const target = pointerQuote(e.history, MIN_RECORD_WORDS, "history", fail, "raw");
      if (target !== null) {
        if (!target.startsWith("delivery/")) fail("history is not under delivery/");
        if (DIET_FILES.includes(target)) fail("history points into a file this diet prunes");
        if (atRevision(DIET_BASELINE, target) === null) fail(`history file ${target} did not exist at ${DIET_BASELINE}`);
      }
      ruleQuote(e["rule-kept"], "rule-kept", fail);
    }
    if (kind === "corrected") {
      pointerQuote(e.authority, MIN_RULE_WORDS, "authority", fail, "live");
      ruleQuote(e.replacement, "replacement", fail);
    }
    if (STATE_ONLY.includes(kind)) {
      if (typeof e.reason !== "string" || e.reason === "") fail("has no reason");
      if (kind === "superseded-status") statusQuote(e["superseded-by"], "superseded-by", fail);
      if (kind === "archived") {
        // The pointer is DERIVED from the entry's own range, so it cannot drift from it.
        const now = w.current(STATE_FILE) ?? "";
        const want = [`git show ${DIET_BASELINE}:${STATE_FILE}`, `lines ${a} to ${b}`];
        const para = now.split(/\n\s*\n/).map(normalise);
        if (!para.some((p) => want.every((x) => p.includes(x)))) {
          fail(`${STATE_FILE} carries no paragraph pointing at ${want.join(" ")}, so the archived block is unreachable`);
        }
      }
    }
    for (const r of e.retires ?? []) {
      if (liveIds.has(r)) fail(`retires ${r}, which is still a live row`);
      const entry = retiredIds.get(r);
      if (entry === undefined) fail(`retires ${r}, which is not in the retired register`);
      else if (entry.diet !== id) fail(`retired ${r} does not name ${id} back`);
    }
  }
  for (const r of doc.retired) {
    if (r.diet === undefined) continue;
    const e = doc.diet.find((d) => d.id === r.diet);
    if (e === undefined) findings.push(`retired ${r.id}: names diet entry ${r.diet}, which does not exist`);
    else if (!(e.retires ?? []).includes(r.id)) findings.push(`retired ${r.id}: ${r.diet} does not list it in retires`);
  }
  for (const s of doc["state-stable-sections"] ?? []) {
    const now = w.current(STATE_FILE) ?? "";
    if (!now.split("\n").some((l) => l.trim() === s)) findings.push(`stable STATE.md section "${s}" is not in ${STATE_FILE}`);
  }
  return findings;
}

/**
 * Every run of baseline lines NOT inside a diet range, split at blank lines,
 * must still be in the current file (whitespace collapsed, citation line
 * numbers masked, so a repointed citation is not a removal). A run that was
 * structurally live at the baseline must be in the current file's BINDING
 * text. The baseline is read generously (every live line counts as binding),
 * which is the strict direction for the current file.
 */
function uncoveredRemovals(doc: DietDoc, file: string, baseText: string, nowText: string): string[] {
  const L = baseText.split("\n");
  const baseMask = structuralMask(baseText);
  const covered = new Array<boolean>(L.length + 1).fill(false);
  for (const e of doc.diet) {
    if (e.file !== file || !Array.isArray(e.lines)) continue;
    for (let i = e.lines[0]; i <= e.lines[1]; i++) covered[i] = true;
  }
  const nowAll = withoutLineNumbers(normalise(nowText));
  const nowBinding = withoutLineNumbers(normalise(keepUnmasked(nowText, bindingMask(doc, file, nowText))));
  const missing: string[] = [];
  let seg: number[] = [];
  const flush = () => {
    if (seg.length === 0) return;
    const text = withoutLineNumbers(normalise(seg.map((n) => L[n - 1]).join("\n")));
    const wasBinding = seg.every((n) => !baseMask[n - 1]);
    if (text !== "" && !(wasBinding ? nowBinding : nowAll).includes(text)) {
      missing.push(`${file}@${DIET_BASELINE} lines ${seg[0]}-${seg[seg.length - 1]}`);
    }
    seg = [];
  };
  for (let n = 1; n <= L.length; n++) {
    if (covered[n] || L[n - 1].trim() === "") flush();
    else seg.push(n);
  }
  flush();
  return missing;
}

/** Every reason a pruned rule file lost force: register, disclaimers, removals. */
function ruleFileFindings(doc: DietDoc, file: string, baseText: string, nowText: string): string[] {
  return [
    ...headingFindings(doc, file, nowText),
    ...disclaimerFindings(doc, file, nowText),
    ...uncoveredRemovals(doc, file, baseText, nowText),
  ];
}

/** The lines of a `## ` section by its exact heading line, or null. */
function section(text: string, heading: RegExp): string[] | null {
  const lines = text.split("\n");
  const a = lines.findIndex((l) => heading.test(l));
  if (a < 0) return null;
  const level = (/^#+/.exec(lines[a]) ?? [""])[0].length;
  let b = lines.findIndex((l, i) => i > a && /^#+ /.test(l) && (/^#+/.exec(l) ?? [""])[0].length <= level);
  if (b < 0) b = lines.length;
  return lines.slice(a + 1, b);
}

/**
 * Why the open owner actions have lost their runnable text. Each id named in
 * the standing section's "Owner actions open" list must have a register item
 * (a bullet or numbered item whose bold lead begins with that id) of at least
 * MIN_ACTION_WORDS words carrying at least one code span. Only an id in
 * OPEN_ACTION_EXEMPT is exempt.
 */
function openActionFindings(text: string, exempt: readonly string[] = OPEN_ACTION_EXEMPT): string[] {
  const f: string[] = [];
  const standing = section(text, /^## M\d+ standing at /);
  const open = standing === null ? null : section(standing.join("\n"), /^### Owner actions open\s*$/);
  if (open === null) return ["the standing section has no 'Owner actions open' list"];
  const bullets: string[] = [];
  for (const l of open) {
    if (l.startsWith("- ")) bullets.push(l);
    else if (bullets.length > 0 && l.startsWith("  ")) bullets[bullets.length - 1] += ` ${l.trim()}`;
  }
  const ids: string[] = [];
  for (const bl of bullets) {
    const lead = bl.slice(2).split(":")[0];
    ids.push(...[...lead.matchAll(/\bA-\d+\b/g)].map((m) => m[0]).filter((id) => !exempt.includes(id)));
  }
  const register = section(text, /^## Owner action items\s*$/);
  if (register === null) return ["there is no '## Owner action items' register"];
  const items = new Map<string, string>();
  let cur: string | null = null;
  for (const l of register) {
    const m = /^(?:\d+[a-z]?\.|-) \*\*(A-\d+)\b/.exec(l);
    if (m !== null) {
      cur = m[1];
      items.set(cur, l);
      continue;
    }
    if (/^(?:\d+[a-z]?\.|-) |^#|^<!--|^\*\*/.test(l)) cur = null;
    else if (cur !== null) items.set(cur, `${items.get(cur)} ${l}`);
  }
  for (const id of ids) {
    const item = items.get(id);
    if (item === undefined) f.push(`open owner action ${id} has no register item`);
    else {
      if (wordCount(item) < MIN_ACTION_WORDS) f.push(`open owner action ${id}'s register item is under ${MIN_ACTION_WORDS} words`);
      if (!/`[^`]+`/.test(item)) f.push(`open owner action ${id}'s register item carries no runnable text (no code span)`);
    }
  }
  return f;
}

/** Why a STATE.md is not a current-standing document. Empty means it is. */
function checkState(text: string, baselineText: string): string[] {
  const f: string[] = [];
  const first = text.split("\n").find((l) => l.startsWith("## "));
  if (first === undefined || !/^## M\d+ standing at /.test(first)) {
    f.push(`the first section is not the current standing: ${first ?? "<none>"}`);
  }
  if (/^- as of:/m.test(text)) f.push("a dated '- as of:' daily block survives");
  if (text.includes("NEWEST BLOCK")) f.push("a NEWEST BLOCK marker survives");
  if (/^## Standing at /m.test(text)) f.push("a superseded '## Standing at' section survives");
  const standings = text.split("\n").filter((l) => /^## M\d+ standing at /.test(l)).length;
  if (standings !== 1) f.push(`${standings} standing sections, not exactly one`);
  for (const needle of [
    "## M4 closure",
    "### Residue, carried deliberately rather than lost",
    `git show ${DIET_BASELINE}:delivery/STATE.md`,
    "git log -p",
  ]) {
    if (!text.includes(needle)) f.push(`missing ${needle}`);
  }
  const ids = (s: string) => new Set([...s.matchAll(/\bA-(\d+)\b/g)].map((m) => `A-${m[1]}`));
  const now = ids(text);
  for (const a of ids(baselineText)) if (!now.has(a)) f.push(`owner action ${a} is lost`);
  f.push(...openActionFindings(text));
  return f;
}

function dietDoc(): DietDoc {
  return JSON.parse(readFileSync(inventoryPath, "utf8")) as DietDoc;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** A current-file reader with one file replaced, for fixtures. */
const withFile = (path: string, text: string) => (p: string) => (p === path ? text : currentText(p));
/** CLAUDE.md with its closing `## Never` section cut out, and that section's text. */
function neverSplit(now: string): { before: string; never: string; body: string } {
  const at = now.indexOf("\n## Never\n");
  assert.ok(at >= 0 && now.indexOf("\n## ", at + 1) < 0, "CLAUDE.md ends with its ## Never section");
  const never = now.slice(at + 1);
  return { before: now.slice(0, at + 1), never, body: never.replace(/^## Never\n\n?/, "") };
}

test("every diet disposition carries evidence a keyword cannot give, and the live inventory passes", () => {
  const doc = dietDoc();
  assert.ok(doc.diet.length > 0, "the diet register is not empty");
  assert.deepEqual(checkDiet(doc), []);
});

test("a history-moved disposition whose only evidence is a keyword is refused", () => {
  const doc = dietDoc();
  const e = doc.diet.find((d) => d.disposition === "history-moved");
  assert.ok(e !== undefined && e.history !== undefined);
  // "watchdogs" is present in T-014 at the pointer, so only the word floor refuses it.
  e.history = { at: "delivery/tuition/T-014-the-watchdog-watched-the-wrong-place-six-times.md:1-40", quote: "watchdogs" };
  const f = checkDiet(doc);
  assert.ok(f.some((m) => m.includes(`${e.id}: history quote is under`)), f.join("\n"));
});

test("an exact-duplicate disposition pointing at a shared keyword is refused", () => {
  const doc = dietDoc();
  const e = clone(doc.diet.find((d) => d.file === "CLAUDE.md" && d.disposition === "history-moved")!);
  e.id = "diet-fixture-duplicate";
  e.disposition = "exact-duplicate";
  e["duplicate-of"] = { file: "AGENTS.md" }; // AGENTS.md shares words, not the block
  doc.diet.push(e);
  const f = checkDiet(doc);
  assert.ok(f.some((m) => m.startsWith("diet-fixture-duplicate: the whole removed block is not in the binding text of AGENTS.md")), f.join("\n"));
});

test("a diet entry whose evidence is a sibling keyword grep is refused", () => {
  const doc = dietDoc();
  const e = doc.diet.find((d) => d.disposition === "history-moved")!;
  delete e.history;
  e["verified-by"] = { command: "grep -c watchdog AGENTS.md", exit: 0, output: "AGENTS.md:7" };
  const f = checkDiet(doc);
  assert.ok(f.some((m) => m.includes(`${e.id}: carries a keyword probe (verified-by)`)), f.join("\n"));
  assert.ok(f.some((m) => m.includes(`${e.id}: has no history {at, quote}`)), f.join("\n"));
});

test("a diet entry naming a block that is not at its baseline range is refused", () => {
  const doc = dietDoc();
  const e = doc.diet.find((d) => d.file === "CLAUDE.md")!;
  e.lines = [e.lines![0] + 1, e.lines![1] + 1];
  const f = checkDiet(doc);
  assert.ok(f.some((m) => m.startsWith(`${e.id}: baseline lines`)), f.join("\n"));
});

test("every line removed from CLAUDE.md or AGENTS.md since the diet baseline has a disposition, and both files match their heading register", () => {
  const doc = dietDoc();
  for (const file of RULE_FILES) {
    const base = atRevision(DIET_BASELINE, file);
    assert.ok(base !== null, `${file} is readable at ${DIET_BASELINE}; this check needs full history`);
    assert.deepEqual(ruleFileFindings(doc, file, base, currentText(file) ?? ""), [], file);
  }
});

test("a block removed from CLAUDE.md with no disposition reddens the completeness check", () => {
  const doc = dietDoc();
  const base = atRevision(DIET_BASELINE, "CLAUDE.md");
  assert.ok(base !== null);
  const now = currentText("CLAUDE.md") ?? "";
  // Remove a kept paragraph that no diet entry covers: the Red-witness rule's first sentence.
  const kept = "A test only counts as guarding a behavior if it has been demonstrated red";
  assert.ok(now.includes(kept));
  const pruned = now.replace(kept, "");
  assert.deepEqual(uncoveredRemovals(doc, "CLAUDE.md", base, now), []);
  const missing = uncoveredRemovals(doc, "CLAUDE.md", base, pruned);
  assert.equal(missing.length, 1, missing.join("\n"));
  // Dropping the entry that covers a real removal reddens it too.
  const without = clone(doc);
  without.diet = without.diet.filter((d) => d.id !== "diet-claude-md-03");
  assert.ok(uncoveredRemovals(without, "CLAUDE.md", base, now).length > 0);
});

/*
 * The relocation class: the words of a binding rule kept, their force removed.
 * Each member names the ARM that must catch it, so disabling one arm reddens
 * only its own members. Two reviews built these; every one of their bypasses
 * is a row here.
 */
const NEVER_KEPT = "Never soften a work history.";
/** The Red-witness rule's first paragraph, a prose rule rather than a list. */
const RED_WITNESS = "A test only counts as guarding a behavior if it has been demonstrated red\nwithout the behavior and green with it.";
const RELOCATIONS: {
  name: string;
  arm: "removal" | "heading" | "disclaimer";
  kept?: string;
  build: (s: ReturnType<typeof neverSplit>, now: string) => string;
}[] = [
  { name: "inside an HTML comment", arm: "removal", build: (s) => `${s.before}## Never\n\n<!-- kept for search\n${s.body}\n-->\n` },
  { name: "inside a fenced block", arm: "removal", build: (s) => `${s.before}## Never\n\nThe former list, for search:\n\n\`\`\`\n${s.body}\n\`\`\`\n` },
  { name: "inside a details block", arm: "removal", build: (s) => `${s.before}## Never\n\n<details><summary>The list</summary>\n\n${s.body}\n</details>\n` },
  // A blockquote whose continuation line is lazy, so the words survive unprefixed:
  // only the blockquote arm can refuse it (a fully prefixed quote also changes the text).
  { name: "inside a blockquote", arm: "removal", kept: normalise(RED_WITNESS), build: (_, now) => now.replace(RED_WITNESS, `> ${RED_WITNESS}`) },
  { name: "as an indented code block", arm: "removal", build: (s) => `${s.before}## Never\n\nThe list:\n\n${s.body.split("\n").map((l) => (l === "" ? "" : `    ${l}`)).join("\n")}\n` },
  { name: "under an unregistered ATX heading", arm: "heading", build: (s) => `${s.before}## Never\n\n## Archive\n\n${s.body}` },
  { name: "under an unregistered Setext heading", arm: "heading", build: (s) => `${s.before}## Never\n\nHistory\n=======\n\n${s.body}` },
  { name: "after a disclaimer in its own paragraph", arm: "disclaimer", build: (s) => `${s.before}## Never\n\nThe list below is no longer binding.\n\n${s.body}` },
  { name: "after a disclaimer in other words", arm: "disclaimer", build: (s) => `${s.before}## Never\n\nThis text is obsolete and kept for reference only.\n\n${s.body}` },
];

test("a binding rule relocated out of binding force is caught, in every container the reviews built", () => {
  const doc = dietDoc();
  const base = atRevision(DIET_BASELINE, "CLAUDE.md");
  assert.ok(base !== null);
  const now = currentText("CLAUDE.md") ?? "";
  assert.deepEqual(ruleFileFindings(doc, "CLAUDE.md", base, now), [], "control: the live file is clean");
  const s = neverSplit(now);
  for (const r of RELOCATIONS) {
    const text = r.build(s, now);
    assert.notEqual(text, now, `${r.name}: the fixture changed the file`);
    assert.ok(normalise(text).includes(r.kept ?? NEVER_KEPT), `${r.name}: the words are kept`);
    const got: string[] =
      r.arm === "removal"
        ? uncoveredRemovals(doc, "CLAUDE.md", base, text)
        : r.arm === "heading"
          ? headingFindings(doc, "CLAUDE.md", text)
          : disclaimerFindings(doc, "CLAUDE.md", text);
    assert.ok(got.length > 0, `${r.name}: its ${r.arm} arm reports nothing`);
  }
});

test("a heading registered non-binding takes its section's text out of force, including a binding-registered heading under it", () => {
  const doc = dietDoc();
  const base = atRevision(DIET_BASELINE, "CLAUDE.md");
  assert.ok(base !== null);
  const s = neverSplit(currentText("CLAUDE.md") ?? "");
  const reg = clone(doc);
  reg["binding-headings"]!["CLAUDE.md"].headings.push({ heading: "## Archive", class: "non-binding" });
  // Member A: the list directly under a heading registered non-binding.
  const direct = `${s.before}## Never\n\n## Archive\n\n${s.body}`;
  assert.deepEqual(headingFindings(reg, "CLAUDE.md", direct), []);
  assert.ok(uncoveredRemovals(reg, "CLAUDE.md", base, direct).length > 0, "a list under a non-binding heading is removed");
  // Member B: under a sub-heading registered BINDING whose parent is non-binding.
  reg["binding-headings"]!["CLAUDE.md"].headings.push({ heading: "### Rules", class: "binding" });
  const nested = `${s.before}## Never\n\n## Archive\n\n### Rules\n\n${s.body}`;
  assert.deepEqual(headingFindings(reg, "CLAUDE.md", nested), []);
  assert.ok(uncoveredRemovals(reg, "CLAUDE.md", base, nested).length > 0, "a binding heading under a non-binding one is not binding");
});

test("a heading register that has drifted from its file is refused", () => {
  const doc = dietDoc();
  const now = currentText("CLAUDE.md") ?? "";
  // Member A: a registered heading removed from the file.
  const gone = now.replace("\n## Never\n", "\n");
  assert.ok(headingFindings(doc, "CLAUDE.md", gone).includes('CLAUDE.md: registered heading "## Never" is not in the file'));
  // Member B: a heading renamed in place, so the file has one unregistered and the register one absent.
  const renamed = now.replace("\n## Never\n", "\n## Never, archived\n");
  const f = headingFindings(doc, "CLAUDE.md", renamed);
  assert.ok(f.some((m) => m.includes('heading "## Never, archived"') && m.includes("is not in the binding-heading register")), f.join("\n"));
});

test("an acknowledged disclaimer covers only its own sentence, once", () => {
  const doc = dietDoc();
  const acks = (doc["disclaimers-acknowledged"] ?? []).filter((a) => a.file === "CLAUDE.md");
  assert.ok(acks.length > 0, "CLAUDE.md carries acknowledged disclaimers");
  const now = currentText("CLAUDE.md") ?? "";
  assert.deepEqual(disclaimerFindings(doc, "CLAUDE.md", now), []);
  const s = neverSplit(now);
  // Member A: an acknowledged sentence copied in front of a rule is no longer "once".
  const copied = `${s.before}## Never\n\n${acks[0].quote}\n\n${s.body}`;
  const fA = disclaimerFindings(doc, "CLAUDE.md", copied);
  assert.ok(fA.some((m) => m.includes("occurs 2 times in binding text, not once")), fA.join("\n"));
  // Member B: the acknowledgement dropped, so the real sentence is a bare disclaimer again.
  const dropped = clone(doc);
  dropped["disclaimers-acknowledged"] = dropped["disclaimers-acknowledged"]!.filter((a) => a.quote !== acks[0].quote);
  const fB = disclaimerFindings(dropped, "CLAUDE.md", now);
  assert.ok(fB.some((m) => m.includes("with no acknowledgement")), fB.join("\n"));
});

test("a kept-rule quote that survives only as non-binding text, or outside a rule file, is refused", () => {
  const doc = dietDoc();
  const e = doc.diet.find((d) => d.file === "CLAUDE.md" && d.disposition === "history-moved")!;
  const quote = e["rule-kept"]!.quote!;
  const now = currentText("CLAUDE.md") ?? "";
  assert.ok(normalise(now).includes(normalise(quote)));
  // Replace every binding occurrence: a whitespace-flexible pattern for the quote.
  const pattern = new RegExp(
    quote
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+"),
    "g",
  );
  const stripped = now.replace(pattern, "(moved)");
  assert.ok(!normalise(stripped).includes(normalise(quote)), "the fixture removed every binding copy");
  const nonBinding = "only as non-binding text";
  // Member A: inside an HTML comment.
  const fA = checkDiet(doc, { current: withFile("CLAUDE.md", `${stripped}\n<!-- ${quote} -->\n`) });
  assert.ok(fA.some((m) => m.startsWith(`${e.id}: rule-kept quote is in CLAUDE.md ${nonBinding}`)), fA.join("\n"));
  // Member B: inside a fenced block.
  const fB = checkDiet(doc, { current: withFile("CLAUDE.md", `${stripped}\n\`\`\`\n${quote}\n\`\`\`\n`) });
  assert.ok(fB.some((m) => m.startsWith(`${e.id}: rule-kept quote is in CLAUDE.md ${nonBinding}`)), fB.join("\n"));
  // Member C: kept in a file that is not a rule file, where nothing makes it binding.
  const moved = clone(doc);
  moved.diet.find((d) => d.id === e.id)!["rule-kept"] = { file: STATE_FILE, quote: "Read `CLAUDE.md`, then this file. `git fetch origin main` and check" };
  const fC = checkDiet(moved);
  assert.ok(fC.includes(`${e.id}: rule-kept file ${STATE_FILE} is not a rule file (CLAUDE.md, AGENTS.md)`), fC.join("\n"));
});

test("a corrected disposition's authority must be live text at its range", () => {
  const doc = dietDoc();
  const e = doc.diet.find((d) => d.disposition === "corrected" && d.authority!.at!.startsWith("delivery/decisions/"))!;
  const p = parsePointer(e.authority!.at!)!;
  const real = currentText(p.path)!;
  const lines = real.split("\n");
  assert.deepEqual(checkDiet(doc).filter((m) => m.startsWith(`${e.id}:`)), []);
  const wrap = (open: string, close: string) =>
    [...lines.slice(0, p.a - 1), open, ...lines.slice(p.a - 1, p.b), close, ...lines.slice(p.b)].join("\n");
  // Member A: the authority's lines inside an HTML comment (the pointer moves down one line).
  const inComment = clone(doc);
  inComment.diet.find((d) => d.id === e.id)!.authority!.at = `${p.path}:${p.a + 1}-${p.b + 1}`;
  const fA = checkDiet(inComment, { current: withFile(p.path, wrap("<!--", "-->")) });
  assert.ok(fA.includes(`${e.id}: authority quote is not at ${p.path}:${p.a + 1}-${p.b + 1} in live text`), fA.join("\n"));
  // Member B: the same lines inside a fenced block.
  const fB = checkDiet(inComment, { current: withFile(p.path, wrap("```", "```")) });
  assert.ok(fB.includes(`${e.id}: authority quote is not at ${p.path}:${p.a + 1}-${p.b + 1} in live text`), fB.join("\n"));
});

test("a mechanically-enforced disposition must name a CI-run script inside the named test's own body", () => {
  const doc = dietDoc();
  // A fixture world: the rule file, one real CI-run script, and synthetic test sites.
  const script = "scripts/check-authored-bytes.mjs";
  const e = clone(doc.diet.find((d) => d.file === "CLAUDE.md" && d.disposition === "history-moved")!);
  e.id = "diet-fixture-enforced";
  e.disposition = "mechanically-enforced";
  delete e.history;
  delete e.retires;
  e["enforced-by"] = { script, test: "the enforcer", asserts: "control byte 0x00" };
  const fixture = clone(doc);
  fixture.diet = [e];
  const sites = (extra: Record<string, string>) => () =>
    new Map<string, TestSite[]>(
      Object.entries({
        "the enforcer": `test("the enforcer", () => { run("${script}"); assert.match(err, /control byte 0x00/); });`,
        ...extra,
      }).map(([t, body]) => [t, [{ file: "test/fixture.test.ts", body }]]),
    );
  const mine = (f: string[]) => f.filter((m) => m.startsWith("diet-fixture-enforced:"));
  assert.deepEqual(mine(checkDiet(fixture, { tests: sites({}) })), [], "control: the right test passes");
  // Member A, the second hazard review's: the right script, a SIBLING test that only shares the file.
  const sibling = clone(fixture);
  sibling.diet[0]["enforced-by"] = { script, test: "a sibling", asserts: "plain ASCII" };
  const fA = mine(checkDiet(sibling, { tests: sites({ "a sibling": `test("a sibling", () => { run(root); expect("plain ASCII"); });` }) }));
  assert.ok(fA.includes(`diet-fixture-enforced: enforced-by test does not name check-authored-bytes.mjs in its own body`), fA.join("\n"));
  // Member B, the first hazard review's: an unrelated script and an unrelated test.
  const unrelated = clone(fixture);
  unrelated.diet[0]["enforced-by"] = { script: "scripts/check-agents-references.mjs", test: "the enforcer", asserts: "nothing like this" };
  const fB = mine(checkDiet(unrelated, { tests: sites({}) }));
  assert.ok(fB.includes("diet-fixture-enforced: enforced-by test does not name check-agents-references.mjs in its own body"), fB.join("\n"));
  assert.ok(fB.includes("diet-fixture-enforced: enforced-by asserts fragment is not in the body of the named test"), fB.join("\n"));
  // The CI arm, two members: a script CI does not run, and CI text with the script removed.
  const notRun = clone(fixture);
  notRun.diet[0]["enforced-by"] = { script: "scripts/check-retirement-inventory.mjs", test: "the enforcer", asserts: "control byte 0x00" };
  const bare = ciText();
  const fC = mine(checkDiet(notRun, { tests: sites({}), ci: () => bare.split("check-retirement-inventory").join("") }));
  assert.ok(fC.includes("diet-fixture-enforced: enforced-by script scripts/check-retirement-inventory.mjs is not run by any workflow or manifest gate"), fC.join("\n"));
  const fD = mine(checkDiet(fixture, { tests: sites({}), ci: () => bare.split("check-authored-bytes").join("") }));
  assert.ok(fD.includes(`diet-fixture-enforced: enforced-by script ${script} is not run by any workflow or manifest gate`), fD.join("\n"));
});

test("a status disposition is refused on a rule file, and its supersede quote needs the rule floor", () => {
  const doc = dietDoc();
  // A CLAUDE.md rule disposed as a STATE-style status block with a one-word quote.
  const rule = clone(doc);
  const e = rule.diet.find((d) => d.file === "CLAUDE.md" && d.disposition === "history-moved")!;
  e.disposition = "superseded-status";
  e.reason = "stale";
  e["superseded-by"] = { file: "CLAUDE.md", quote: "binding" };
  const e2 = clone(e);
  e2.id = "diet-fixture-archived";
  e2.disposition = "archived";
  rule.diet.push(e2);
  const f = checkDiet(rule);
  assert.ok(f.includes(`${e.id}: superseded-status is a status disposition and is allowed only for delivery/STATE.md`), f.join("\n"));
  assert.ok(f.includes("diet-fixture-archived: archived is a status disposition and is allowed only for delivery/STATE.md"), f.join("\n"));
  // A real STATE.md status entry whose supersede quote is cut to one word.
  const state = clone(doc);
  const s = state.diet.find((d) => d.disposition === "superseded-status" && d["superseded-by"]?.rev === undefined)!;
  s["superseded-by"] = { file: s["superseded-by"]!.file, quote: normalise(s["superseded-by"]!.quote!).split(" ")[1] };
  const g = checkDiet(state);
  assert.ok(g.some((m) => m.startsWith(`${s.id}: superseded-by quote is under ${MIN_RULE_WORDS} words`)), g.join("\n"));
});

test("STATE.md status evidence is pinned or stable, never read from text a standing update rewrites", () => {
  const doc = dietDoc();
  const pinned = doc.diet.find((d) => d["superseded-by"]?.rev !== undefined)!;
  assert.ok(pinned !== undefined, "the register carries a pinned status quote");
  // Member A: a quote into the volatile standing text, as fix round 1 left diet-state-13.
  const volatile = clone(doc);
  volatile.diet.find((d) => d.id === pinned.id)!["superseded-by"] = {
    file: STATE_FILE,
    quote: "The full runnable text of every open action is in the register below.",
  };
  const fA = checkDiet(volatile);
  assert.ok(fA.some((m) => m.startsWith(`${pinned.id}: superseded-by quote is in ${STATE_FILE} only outside its stable sections`)), fA.join("\n"));
  // Member B: a pin to any other revision, here a branch head, which a squash
  // merge would orphan from `main`.
  const stray = clone(doc);
  stray.diet.find((d) => d.id === pinned.id)!["superseded-by"]!.rev = "HEAD";
  const fB = checkDiet(stray);
  assert.ok(fB.includes(`${pinned.id}: superseded-by revision HEAD is not the diet baseline ${DIET_BASELINE}, the only pinnable commit`), fB.join("\n"));
  // Member C: a pin whose quote is not at its range at that revision.
  const off = clone(doc);
  const q = off.diet.find((d) => d.id === pinned.id)!["superseded-by"]!;
  q.at = q.at!.replace(/:(\d+)(?:-(\d+))?$/, (_, x: string) => `:${Number(x) + 400}`);
  const fC = checkDiet(off);
  assert.ok(fC.some((m) => m.startsWith(`${pinned.id}: superseded-by quote is not at`) || m.startsWith(`${pinned.id}: superseded-by pointer`)), fC.join("\n"));
});

test("a routine standing update keeps every diet and STATE check green, and a lost owner action still reddens", () => {
  const doc = dietDoc();
  const base = atRevision(DIET_BASELINE, STATE_FILE);
  assert.ok(base !== null);
  const now = currentText(STATE_FILE) ?? "";
  // The update an orchestrator makes every few hours: a new standing date and
  // head, a count changed, the re-verification paragraph rewritten, a table row added.
  let upd = now.replace(/^## M5 standing at .*$/m, "## M5 standing at 2026-09-24, 09:00 UTC, `main` at 1a2b3c4");
  upd = upd.replace("**TWO CLAUDE.md AMENDMENTS ARE STILL QUEUED.**", "**ONE CLAUDE.md AMENDMENT IS STILL QUEUED.**");
  upd = upd.replace(/^Re-verified 2026-09-23[\s\S]*?\n\n/m, "Re-verified 2026-09-24 against `main` at 1a2b3c4. Nothing closed since the last reading.\n\n");
  upd = upd.replace("| M5-P3, live review evidence |", "| M5-P9, a later phase | #299 | 1a2b3c4 | gates 1 success |\n| M5-P3, live review evidence |");
  for (const probe of ["2026-09-24, 09:00 UTC", "ONE CLAUDE.md AMENDMENT", "Nothing closed since the last reading", "M5-P9, a later phase"]) {
    assert.ok(upd.includes(probe), `the simulated update applied: ${probe}`);
  }
  assert.ok(!upd.includes("Four items closed since they"), "the re-verification paragraph was rewritten");
  assert.deepEqual(checkDiet(doc, { current: withFile(STATE_FILE, upd) }), [], "the diet register survives the update");
  assert.deepEqual(checkState(upd, base), [], "the STATE shape checks survive the update");
  // Next to it, the dangerous state: the same update also loses A-15's runnable text.
  const lines = upd.split("\n");
  const a = lines.findIndex((l) => /^- \*\*A-15\b/.test(l));
  let b = a + 1;
  while (b < lines.length && !/^(?:\d+[a-z]?\.|-) |^#|^<!--|^\*\*/.test(lines[b])) b++;
  const lost = [...lines.slice(0, a), ...lines.slice(b)].join("\n");
  assert.ok(checkState(lost, base).includes("open owner action A-15 has no register item"));
});

test("the archived block's pointer is derived from its own range", () => {
  const doc = dietDoc();
  const e = doc.diet.find((d) => d.disposition === "archived")!;
  const now = currentText(STATE_FILE) ?? "";
  const want = `lines ${e.lines![0]} to ${e.lines![1]}`;
  assert.ok(normalise(now).includes(want));
  // Member A: the pointer's range rewritten in the file.
  const gone = now.replace(new RegExp(want.split(" ").join("\\s+")), "lines elsewhere");
  assert.notEqual(gone, now);
  const fA = checkDiet(doc, { current: withFile(STATE_FILE, gone) });
  assert.ok(fA.some((m) => m.startsWith(`${e.id}: ${STATE_FILE} carries no paragraph pointing at`)), fA.join("\n"));
  // Member B: the entry's range changed while the file's pointer stayed.
  const moved = clone(doc);
  moved.diet.find((d) => d.id === e.id)!.lines = [e.lines![0], e.lines![1] - 1];
  moved.diet.find((d) => d.id === e.id)!.last = (atRevision(DIET_BASELINE, STATE_FILE) ?? "").split("\n")[e.lines![1] - 2];
  const fB = checkDiet(moved);
  assert.ok(fB.some((m) => m.startsWith(`${e.id}: ${STATE_FILE} carries no paragraph pointing at`)), fB.join("\n"));
});

test("STATE.md begins with the current standing, carries no superseded daily block, and keeps every owner-action id", () => {
  const base = atRevision(DIET_BASELINE, "delivery/STATE.md");
  assert.ok(base !== null);
  assert.deepEqual(checkState(currentText("delivery/STATE.md") ?? "", base), []);
});

test("a STATE.md with a surviving daily block or a lost owner action is refused", () => {
  const base = atRevision(DIET_BASELINE, "delivery/STATE.md");
  assert.ok(base !== null);
  // The baseline itself is the first dangerous state: daily blocks first, standing buried.
  const old = checkState(base, base);
  assert.ok(old.some((m) => m.startsWith("the first section is not the current standing")), old.join("\n"));
  assert.ok(old.some((m) => m.includes("NEWEST BLOCK")), old.join("\n"));
  // The second: a current file that drops an owner action id.
  const now = currentText("delivery/STATE.md") ?? "";
  const lost = checkState(now.replace(/\bA-7\b/g, "an action"), base);
  assert.ok(lost.includes("owner action A-7 is lost"), lost.join("\n"));
});

test("an open owner action whose register text is deleted or cut to its lead is refused", () => {
  const base = atRevision(DIET_BASELINE, "delivery/STATE.md");
  assert.ok(base !== null);
  const now = currentText("delivery/STATE.md") ?? "";
  assert.deepEqual(openActionFindings(now), []);
  const lines = now.split("\n");
  const a = lines.findIndex((l) => /^- \*\*A-15\b/.test(l));
  assert.ok(a >= 0, "the register carries an A-15 item");
  let b = a + 1;
  while (b < lines.length && !/^(?:\d+[a-z]?\.|-) |^#|^<!--|^\*\*/.test(lines[b])) b++;
  // Member A, the criteria review's: the whole A-15 item deleted. Its id survives in the standing list.
  const deleted = [...lines.slice(0, a), ...lines.slice(b)].join("\n");
  assert.ok(/\bA-15\b/.test(deleted));
  assert.ok(checkState(deleted, base).includes("open owner action A-15 has no register item"));
  // Member B: the item kept, cut back to its lead line, so the runnable commands are gone.
  const cut = [...lines.slice(0, a + 1), ...lines.slice(b)].join("\n");
  const f = checkState(cut, base);
  assert.ok(f.includes(`open owner action A-15's register item is under ${MIN_ACTION_WORDS} words`), f.join("\n"));
  assert.ok(f.includes("open owner action A-15's register item carries no runnable text (no code span)"), f.join("\n"));
});

test("the open-action exemption is an id list, so a bullet's wording exempts nothing", () => {
  const now = currentText("delivery/STATE.md") ?? "";
  const lines = now.split("\n");
  const a = lines.findIndex((l) => /^- \*\*A-15\b/.test(l));
  let b = a + 1;
  while (b < lines.length && !/^(?:\d+[a-z]?\.|-) |^#|^<!--|^\*\*/.test(lines[b])) b++;
  // Member A, the delta verifier's probe: A-15's item deleted and its open bullet
  // reworded to say its entry is not yet on `main`, which round 1 exempted.
  const reworded = [...lines.slice(0, a), ...lines.slice(b)]
    .join("\n")
    .replace(/^- A-15: .*$/m, "- A-15: tag and release v0.2.0. The tag is not yet on `main`.");
  assert.ok(reworded.includes("The tag is not yet on `main`."));
  assert.ok(openActionFindings(reworded).includes("open owner action A-15 has no register item"));
  // Member B: the exempt id itself is exempt only while it is on the list.
  assert.deepEqual(openActionFindings(now), []);
  assert.ok(openActionFindings(now, []).includes("open owner action A-14 has no register item"));
});
