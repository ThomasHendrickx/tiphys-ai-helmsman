/**
 * THE AGENTS.md POLICY TESTS (kernel plan M3, M3-P9 criteria 1, 2, 2b, 3, 4,
 * 5, 5b, 6, 7c and 8).
 *
 * WHICH OF THESE ARE TEXT ASSERTIONS, SAID ONCE AT THE TOP RATHER THAN LEFT
 * FOR A READER TO WORK OUT (D-M3-28's honesty rule). Criteria 5, 5b, 6, 7c and
 * 8 assert that a prose clause SAYS a thing. They prove the sentence is there.
 * They prove nothing about whether an orchestrator obeys it, and no test in
 * this repository can. What they buy is that a future editor who softens the
 * clause has to make a red test green again, in the open, rather than doing it
 * silently in a document nothing reads.
 *
 * Criteria 1, 2, 2b, 3 and 4 are not text assertions: they EXECUTE the shipped
 * validator and the shipped checker and read exit codes.
 *
 * EVERY MUTATION RUNS AGAINST A STAGED COPY OF THE TREE, never against the
 * working tree, and the checker's `--root` is what makes that possible
 * (delivery/plan/m3-p9-dispatch-read.md:43). Criterion 2b names
 * `roles/implementer.md` and `assurance-modes.yaml` as its two targets and
 * neither belongs to this phase; mutating them in place would be a red scope
 * gate, and restoring them with `git checkout --` is destructive in a tree
 * holding uncommitted work, with no safe narrow form (CLAUDE.md:773).
 *
 * `src` is imported through the computed-URL dynamic import pattern, because a
 * literal relative import of a `src` module from `test/` fails the build with
 * TS2878 under `rewriteRelativeImportExtensions` across the project reference
 * (CLAUDE.md standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const checkerPath = join(repoRoot, "scripts", "check-agents-references.mjs");
const agentsPath = join(repoRoot, "AGENTS.md");

const rolesModule = (await import(new URL("../src/roles.ts", import.meta.url).href)) as {
  clauseAnchors: (body: string) => string[];
  expandIncludes: (
    body: string,
    baseDirectory: string,
    label: string,
  ) => { ok: true; text: string } | { ok: false; reason: string };
  splitFrontmatter: (
    text: string,
    label: string,
  ) => { ok: true; frontmatter: string; body: string } | { ok: false; reason: string };
};

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

const AGENTS = readFileSync(agentsPath, "utf8");

/** The frontmatter and the include-expanded body, split once. */
function split(): { frontmatter: Record<string, unknown>; body: string } {
  const parts = rolesModule.splitFrontmatter(AGENTS, "AGENTS.md");
  assert.equal(parts.ok, true, "AGENTS.md does not open with a frontmatter fence");
  const ok = parts as { ok: true; frontmatter: string; body: string };
  const expanded = rolesModule.expandIncludes(ok.body, repoRoot, "AGENTS.md");
  assert.equal(expanded.ok, true, "AGENTS.md include did not expand");
  return {
    frontmatter: yamlModule.parse(ok.frontmatter) as Record<string, unknown>,
    body: (expanded as { ok: true; text: string }).text,
  };
}

const { frontmatter, body } = split();

/**
 * Collapse every run of whitespace to one space.
 *
 * THIS IS NOT COSMETIC AND IT IS THE MECHANISM, NOT AN INSTANCE FIX. Every
 * assertion in this file is a pattern over HARD-WRAPPED PROSE, and a phrase
 * that straddles a wrap is invisible to a pattern written as one line. Four
 * assertions here were red on their first run for exactly that reason, on
 * phrases the document genuinely carries ("costly to reverse" wrapped between
 * `costly` and `to`).
 *
 * The repository has already paid for this shape one level up: CLAUDE.md:381
 * records the binding claim grep missing an over-claim because the sentence
 * wrapped between `way` and `to`. The correct response there was a second,
 * wrap-insensitive command, and the correct response here is to flatten before
 * matching. REFLOWING THE PROSE TO SUIT THE PATTERNS would have been the
 * instance fix: it makes these four green and leaves every future assertion in
 * this file one edit away from the same silent miss.
 */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * The text under one clause anchor: from the line after the heading to the
 * line before the next heading of any depth.
 *
 * SCOPED TO THE CLAUSE ON PURPOSE. A grep over the whole document would let a
 * word required in clause A be satisfied by clause B, which is exactly how a
 * "the document says it somewhere" assertion becomes worthless. Every
 * clause-scoped assertion below uses this, and most then `flatten` the result.
 */
function clauseText(source: string, clause: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) =>
    new RegExp(`^#{1,6}[ \\t]+clause[ \\t]+${clause}[ \\t]*(:|$)`).test(line),
  );
  assert.notEqual(start, -1, `AGENTS.md carries no clause anchor ${clause}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}[ \t]+/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** A scratch directory holding a `git archive` of HEAD, removed by the caller. */
function stage(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `tiphys-${label}-`));
  const archive = spawnSync("git", ["archive", "HEAD"], {
    cwd: repoRoot,
    maxBuffer: 256 * 1024 * 1024,
    encoding: "buffer",
  });
  assert.equal(archive.status, 0, "git archive HEAD failed");
  const extract = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
  assert.equal(extract.status, 0, "tar extract failed");
  /* THE WORKING TREE'S OWN AGENTS.md AND CHECKER, not HEAD's. A staged tree
     built only from the last commit would test the last commit, and this file
     is edited in the same round as the document it checks. */
  cpSync(agentsPath, join(dir, "AGENTS.md"));
  return dir;
}

/** Run the shipped checker against a staged root. */
function runChecker(root: string): { status: number; stdout: string } {
  const run = spawnSync(
    process.execPath,
    [checkerPath, "--root", root, "--document", join(root, "AGENTS.md")],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return { status: run.status ?? -1, stdout: `${run.stdout}${run.stderr}` };
}

/* ------------------------------------------------------------------ */
/* Criterion 1: the frontmatter validates as a role brief               */
/* ------------------------------------------------------------------ */

test("AGENTS.md validates as a role brief declaring role orchestrator, and a changed role is refused", () => {
  const run = spawnSync(
    process.execPath,
    [cliEntry, "validate", "--type", "role-brief", "AGENTS.md"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.equal(frontmatter["role"], "orchestrator");

  /* THE OTHER DIRECTION, because exit 0 alone does not show the command can
     refuse this document at all. `role` is a closed enum and the orchestrator
     is the value this file is for. */
  const dir = stage("agents-role");
  try {
    writeFileSync(
      join(dir, "AGENTS.md"),
      AGENTS.replace(/^role: orchestrator$/m, "role: quartermaster"),
    );
    const refused = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "role-brief", join(dir, "AGENTS.md")],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(refused.status, 0);
    assert.match(`${refused.stdout}${refused.stderr}`, /#\/role/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4: the clause round trip, both directions                  */
/* ------------------------------------------------------------------ */

test("every AGENTS.md clause id has exactly one body anchor and every anchor is declared, and both directions are refused when broken", () => {
  const declared = frontmatter["clauses"] as string[];
  const anchors = rolesModule.clauseAnchors(body);

  /* DERIVED, NEVER PINNED. `clauses[]` grows when a later phase adds a duty,
     so a count here would be a claim about every future edit (CLAUDE.md:233).
     What is asserted is the SET RELATION, which stays true at any size. */
  assert.deepEqual([...declared].sort(), [...anchors].sort());
  assert.equal(new Set(anchors).size, anchors.length, "an anchor occurs twice");
  assert.ok(declared.length > 0, "the frontmatter declares no clauses at all");

  const dir = stage("agents-round-trip");
  try {
    const validate = (path: string) =>
      spawnSync(
        process.execPath,
        [cliEntry, "validate", "--type", "role-brief", path],
        { cwd: repoRoot, encoding: "utf8" },
      );
    const staged = join(dir, "AGENTS.md");

    /* DIRECTION 1: a declared clause whose body heading is gone is ORPHANED. */
    writeFileSync(
      staged,
      AGENTS.replace(
        /^## clause escalation-threshold:.*$/m,
        "## When the owner is involved",
      ),
    );
    const orphaned = validate(staged);
    assert.notEqual(orphaned.status, 0);
    assert.match(
      `${orphaned.stdout}${orphaned.stderr}`,
      /clause id escalation-threshold is declared in frontmatter and has no body heading anchor/,
    );

    /* DIRECTION 2: a body anchor nothing declares is STRAY. The mirror
       failure, and a different message, so the two cannot be confused. */
    writeFileSync(
      staged,
      AGENTS.replace(
        /^  - escalation-threshold$/m,
        "  - stalled-phase-response-duplicate-removed",
      ),
    );
    const stray = validate(staged);
    assert.notEqual(stray.status, 0);
    assert.match(
      `${stray.stdout}${stray.stderr}`,
      /body heading anchor escalation-threshold is not declared in frontmatter/,
    );

    /* RESTORED. */
    writeFileSync(staged, AGENTS);
    assert.equal(validate(staged).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the eleven M3-P9 inventory rows resolve to clause ids present as AGENTS.md body headings", () => {
  /* DERIVED FROM THE INVENTORY, not from a literal list here, so this test
     cannot agree with itself. Appendix A of the plan is authored by a
     different act from the document under test, which is what makes the
     comparison mean anything (scripts/check-clause-map.mjs:20 area). */
  const inventory = readFileSync(
    join(repoRoot, "delivery", "plan", "kernel-plan-m3.md"),
    "utf8",
  );
  const rows: string[] = [];
  for (const line of inventory.split("\n")) {
    const match = /^\|\s*(R-[0-9]+[a-z]?)\s*\|\s*M3-P9\s*\|/.exec(line);
    if (match !== null && !rows.includes(match[1] as string)) {
      rows.push(match[1] as string);
    }
  }
  assert.ok(rows.length > 0, "the inventory yielded no M3-P9 rows, so this test would pass vacuously");

  const anchors = new Set(rolesModule.clauseAnchors(body));
  const map = JSON.parse(
    readFileSync(join(repoRoot, "delivery", "requirements", "clause-map.json"), "utf8"),
  ) as Record<string, { phase: string; artifact: string; clause: string }>;
  for (const row of rows) {
    assert.ok(anchors.has(row), `${row} has no clause anchor in AGENTS.md`);
    assert.equal(map[row]?.phase, "M3-P9", `${row} has no M3-P9 clause-map entry`);
    assert.equal(map[row]?.artifact, "AGENTS.md");
    assert.equal(map[row]?.clause, row);
  }
});

/* ------------------------------------------------------------------ */
/* Criteria 2 and 2b: references resolve to a path AND to an anchor     */
/* ------------------------------------------------------------------ */

test("every AGENTS.md reference resolves, and deleting a referenced file makes the checker exit nonzero naming it", () => {
  const dir = stage("agents-ref-file");
  try {
    const clean = runChecker(dir);
    assert.equal(clean.status, 0, clean.stdout);
    assert.match(clean.stdout, /check-agents-references: green/);

    /* CRITERION 2, the LOUD failure: the file is gone. */
    rmSync(join(dir, "roles", "investigator.md"));
    const red = runChecker(dir);
    assert.equal(red.status, 1, red.stdout);
    assert.match(red.stdout, /roles\/investigator\.md#[A-Za-z0-9-]+ names roles\/investigator\.md, which is not a readable file/);

    /* RESTORED, from the archive rather than from the working tree. */
    const restore = spawnSync("git", ["archive", "HEAD", "roles/investigator.md"], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "buffer",
    });
    assert.equal(restore.status, 0);
    assert.equal(
      spawnSync("tar", ["-x", "-C", dir], { input: restore.stdout }).status,
      0,
    );
    assert.equal(runChecker(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/*
 * CRITERION 2b's TWO MEMBERS ARE TWO TESTS, one each, and that is deliberate.
 * They are structurally different because the checker LOCATES them by different
 * means: member A scans heading text and compares slugs, member B DECODES the
 * document and walks a key path. A checker could implement one and not the
 * other, which is the criterion's own reason for naming both targets. Splitting
 * them also gives each of the two registered behaviours its own resolving test
 * name, which `test/behaviors.json` requires.
 */

test("a reference whose markdown heading anchor moved is refused while the target file is still present", () => {
  const dir = stage("agents-ref-anchor-md");
  try {
    assert.equal(runChecker(dir).status, 0);

    /* MEMBER A: a heading anchor removed from a MARKDOWN target, file present. */
    const implementer = join(dir, "roles", "implementer.md");
    const before = readFileSync(implementer, "utf8");
    const withoutHeading = before.replace(
      /^## clause fix-round-mechanism:.*$/m,
      "## How to run a fix round",
    );
    assert.notEqual(withoutHeading, before, "the member A mutation did not apply");
    writeFileSync(implementer, withoutHeading);
    const memberA = runChecker(dir);
    assert.equal(memberA.status, 1, memberA.stdout);
    assert.match(
      memberA.stdout,
      /roles\/implementer\.md#clause-fix-round-mechanism names heading anchor clause-fix-round-mechanism, which no heading in roles\/implementer\.md carries/,
    );
    writeFileSync(implementer, before);
    assert.equal(runChecker(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a reference whose YAML field pointer key was renamed is refused while the target file is still present", () => {
  const dir = stage("agents-ref-anchor-yaml");
  try {
    assert.equal(runChecker(dir).status, 0);

    /* MEMBER B: a field pointer whose KEY was renamed inside a YAML target,
       file present. The file is still there, still decodes, and still says the
       same thing to a human; only the key a reference names has moved. This is
       the SILENT half of criterion 2b: nothing about the file looks wrong. */
    const modes = join(dir, "assurance-modes.yaml");
    const modesBefore = readFileSync(modes, "utf8");
    const renamed = modesBefore.replace(
      /^(\s*)merge-authority: delegated-under-conditions$/m,
      "$1merge-authority-regime: delegated-under-conditions",
    );
    assert.notEqual(renamed, modesBefore, "the member B mutation did not apply");
    writeFileSync(modes, renamed);
    const memberB = runChecker(dir);
    assert.equal(memberB.status, 1, memberB.stdout);
    assert.match(
      memberB.stdout,
      /assurance-modes\.yaml#modes\.full\.merge-authority names field pointer modes\.full\.merge-authority, which stops resolving at merge-authority/,
    );
    writeFileSync(modes, modesBefore);
    assert.equal(runChecker(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3: no duplicated policy data                               */
/* ------------------------------------------------------------------ */

test("pasting a gate list, a mode table or a model-tier table into AGENTS.md makes the checker exit nonzero, and reverting returns it to green", () => {
  const dir = stage("agents-duplication");
  const staged = join(dir, "AGENTS.md");
  try {
    assert.equal(runChecker(dir).status, 0);

    /* MEMBER 1: the REAL rendered gate table, lifted out of CLAUDE.md's
       generated block rather than hand-written, so what is pasted is the thing
       an editor would actually paste. */
    const rules = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    const block = (rules.split("<!-- BEGIN GENERATED GATE LIST")[1] as string).split(
      "<!-- END GENERATED GATE LIST",
    )[0] as string;
    writeFileSync(staged, `${AGENTS}\n## The gates\n${block}`);
    const gates = runChecker(dir);
    assert.equal(gates.status, 1, gates.stdout);
    assert.match(gates.stdout, /distinct gate ids occur in list or table rows/);
    writeFileSync(staged, AGENTS);
    assert.equal(runChecker(dir).status, 0);

    /* MEMBER 2: a MODE table carrying NO gate id at all, so the second
       detector is shown to fire on its own rather than only alongside the
       first. One witness is not a class. */
    writeFileSync(
      staged,
      `${AGENTS}\n## Modes\n\n- full: everything\n- direct-pr: implement plus gates\n- local-only: no remote\n`,
    );
    const modes = runChecker(dir);
    assert.equal(modes.status, 1, modes.stdout);
    assert.match(modes.stdout, /distinct mode ids occur in list or table rows/);
    assert.doesNotMatch(modes.stdout, /distinct gate ids/);
    writeFileSync(staged, AGENTS);
    assert.equal(runChecker(dir).status, 0);

    /* MEMBER 3: a MODEL-TIER table. */
    writeFileSync(
      staged,
      `${AGENTS}\n## Tiers\n\n| role | tier |\n|---|---|\n| orchestrator | strongest |\n| implementer | cheaper |\n`,
    );
    const tiers = runChecker(dir);
    assert.equal(tiers.status, 1, tiers.stdout);
    assert.match(tiers.stdout, /roles occur in a list or table row carrying a model tier/);
    writeFileSync(staged, AGENTS);
    assert.equal(runChecker(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the duplication detectors read their vocabularies out of the real artifacts, so an unreadable source is a problem and never a quiet pass", () => {
  /* THE VACUOUS-PASS ARM. A detector whose vocabulary came back empty would
     find nothing in any document, and a green from it would mean "the rule did
     not run" while printing what "the rule found nothing" prints. That is the
     SC-011 shape, one level down, and it is the arm nothing else here reaches. */
  const dir = stage("agents-source-missing");
  try {
    assert.equal(runChecker(dir).status, 0);
    rmSync(join(dir, "role-model-config.yaml"));
    const red = runChecker(dir);
    assert.equal(red.status, 1, red.stdout);
    assert.match(
      red.stdout,
      /the duplication detector for roles could not run: role-model-config\.yaml is not a readable file/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a document carrying no references at all is refused rather than reported as green", () => {
  /* THE OTHER VACUOUS ARM, and it is the one a REWRITE would reach: a version
     of this document with every reference removed resolves zero references,
     and zero of zero is a green in any check that only counts failures. */
  const dir = stage("agents-no-references");
  try {
    writeFileSync(join(dir, "AGENTS.md"), "---\nrole: orchestrator\n---\n\n# Orchestrator\n\nNothing is referenced here.\n");
    const red = runChecker(dir);
    assert.equal(red.status, 1, red.stdout);
    assert.match(red.stdout, /carries no path references at all/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: no process-liveness vocabulary                          */
/* ------------------------------------------------------------------ */

/**
 * The forbidden vocabulary, and it is the same list `test/assurance-modes.test.ts`
 * applies to `assurance-modes.yaml` plus the two the criterion names that the
 * M3-P3 list did not carry.
 *
 * THE RESIDUE IS THE PLAN'S OWN AND IS REPEATED HERE. This is a FIXED-TOKEN
 * PRESENCE CHECK. An instruction that depended on process liveness WITHOUT
 * using any of these words passes it. The tokens are the vocabulary C-2 and
 * C-3 are written in, which is what makes them the right first line, and the
 * second line is the hazard review contract, which is prose-reading rather
 * than grep (delivery/plan/kernel-plan-m3.md:2374).
 */
const LIVENESS_TOKENS = ["pid", "kill", "daemon", "background", "signal", "/proc"];

function livenessHits(text: string): string[] {
  const lower = text.toLowerCase();
  return LIVENESS_TOKENS.filter((token) => lower.includes(token));
}

test("AGENTS.md carries no process-liveness vocabulary, and inserting one line of it is caught", () => {
  /* THE RAW FILE AND THE INCLUDE-EXPANDED BODY BOTH. The raw file is what
     "AGENTS.md contains" means; the expanded body is what an agent composed
     from it actually reads, and a violating sentence could arrive through the
     shared include without the raw file carrying it. */
  assert.deepEqual(livenessHits(AGENTS), [], "AGENTS.md as committed");
  assert.deepEqual(livenessHits(body), [], "AGENTS.md include-expanded");

  /* THE OTHER DIRECTION, one line per token, so the check is shown able to see
     each of them rather than only the first. */
  for (const token of LIVENESS_TOKENS) {
    assert.deepEqual(
      livenessHits(`${AGENTS}\nWait until the ${token} clears before continuing.\n`),
      [token],
      token,
    );
  }
});

test("the supervision clauses name lease freshness and the beacon", () => {
  const supervision = flatten(
    [
      clauseText(body, "dispatch-requires-a-beacon"),
      clauseText(body, "dispatch-requires-a-guard"),
      clauseText(body, "notification-is-not-liveness"),
    ].join(" "),
  );
  const section = flatten(AGENTS.slice(AGENTS.indexOf("## Supervision")));
  assert.match(section, /lease freshness/i);
  assert.match(supervision, /beacon/i);
  assert.match(supervision, /freshness/i);
});

/* ------------------------------------------------------------------ */
/* Criterion 7c: the guard clause tests FRESHNESS                       */
/* ------------------------------------------------------------------ */

test("the dispatch-requires-a-guard clause names FRESHNESS and the newest mtime and does not make existence or completion the watched condition", () => {
  /* A TEXT ASSERTION, AND IT SAYS SO. It proves the clause says the thing, not
     that an orchestrator obeys it. What makes it more than decoration is the
     vocabulary scan above, which forbids the liveness vocabulary in the same
     document (criterion 5). */
  const guard = flatten(clauseText(body, "dispatch-requires-a-guard"));
  assert.match(guard, /FRESHNESS/);
  assert.match(guard, /newest mtime/i);

  /* THE WATCHED CONDITION IS NOT existence AND NOT completion. The clause is
     allowed to NAME them, because the recorded failure it carries is precisely
     a guard that tested existence, and a clause forbidden from naming its own
     counterexample could not carry the warning. What it may not do is make
     either the thing watched, so the assertion is on the sentence that says
     what it watches. */
  const watches = guard
    .split(/(?<=\.)\s+/)
    .filter((sentence) => /\bwatches\b/i.test(sentence))
    .join(" ");
  assert.ok(watches !== "", "the guard clause has no sentence saying what it watches");
  /* THE SPLIT IS BY SENTENCE AND NOT BY LINE, and the difference is not
     cosmetic: `flatten` has already removed the line breaks, so a line-based
     filter would return the WHOLE CLAUSE and the two `doesNotMatch` assertions
     below would then be asserting that the clause never names its own
     counterexample, which it must. Measured: that is exactly how this
     assertion failed on its first run. */
  assert.match(watches, /newest mtime/i);
  assert.doesNotMatch(watches, /\bexists\b/i);
  assert.doesNotMatch(watches, /\bcompletion\b/i);

  /* THE OTHER DIRECTION: the weakening the criterion names. */
  const weakened = body.replace(
    clauseText(body, "dispatch-requires-a-guard"),
    "\nCheck that the agent has produced output, and if it has, it is alive.\n",
  );
  assert.notEqual(weakened, body, "the weakening did not apply");
  const weakenedClause = flatten(clauseText(weakened, "dispatch-requires-a-guard"));
  assert.doesNotMatch(weakenedClause, /FRESHNESS/);
  assert.doesNotMatch(weakenedClause, /newest mtime/i);
});

test("the three supervision clauses are declared in frontmatter and present as body headings", () => {
  const declared = new Set(frontmatter["clauses"] as string[]);
  const anchors = new Set(rolesModule.clauseAnchors(body));
  for (const clause of [
    "dispatch-requires-a-beacon",
    "dispatch-requires-a-guard",
    "notification-is-not-liveness",
  ]) {
    assert.ok(declared.has(clause), `${clause} is not declared in frontmatter`);
    assert.ok(anchors.has(clause), `${clause} has no body heading anchor`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5b: the merge-completion clause                            */
/* ------------------------------------------------------------------ */

/**
 * The four elements criterion 5b requires of `merge-is-not-complete-until`,
 * each with the pattern that reads it out of the clause. Declared as data so
 * the two weakening members below can both be driven from one list rather than
 * from two hand-maintained copies of it.
 */
const MERGE_COMPLETION_ELEMENTS: readonly { name: string; pattern: RegExp }[] = [
  { name: "the event is push", pattern: /EVENT is `push`/ },
  { name: "the head sha equals the new tip", pattern: /head sha equals the new [a-z-]* ?tip/i },
  { name: "observed to completion with the watchdog discipline", pattern: /OBSERVED TO COMPLETION[\s\S]*watchdog discipline/ },
  {
    name: "a pull_request check does not discharge it",
    pattern: /`pull_request` check on the source branch DOES NOT DISCHARGE THIS/,
  },
];

test("the merge-is-not-complete-until clause states the event, the head sha, observation to completion, and that a pull request check does not discharge it", () => {
  const clause = flatten(clauseText(body, "merge-is-not-complete-until"));
  for (const element of MERGE_COMPLETION_ELEMENTS) {
    assert.match(clause, element.pattern, element.name);
  }
});

test("weakening the merge-completion clause is caught, both by the vague rewrite and by the specific one that keeps the tip and drops the event", () => {
  /* TWO STRUCTURALLY DIFFERENT MEMBERS (section 2.3 rule 6), chosen because
     the two ways this clause degrades are different. */
  const clause = flatten(clauseText(body, "merge-is-not-complete-until"));

  /* MEMBER 1, the VAGUE weakening: all four elements go at once. */
  const vague = "\nConfirm CI is green on main after merging.\n";
  const vagueMissing = MERGE_COMPLETION_ELEMENTS.filter(
    (element) => !element.pattern.test(vague),
  ).map((element) => element.name);
  assert.deepEqual(
    vagueMissing,
    MERGE_COMPLETION_ELEMENTS.map((element) => element.name),
    "the vague weakening was expected to drop every element",
  );

  /* MEMBER 2, the SPECIFIC weakening, and it is the more likely edit: it KEEPS
     "observe the run on the new tip" and drops the EVENT NAME. This is exactly
     the state T-009 records, where the pull-request check and the push run were
     both real runs on related shas and the wrong one was read. A test that only
     had member 1 would be green against it. */
  const specific = clause
    .replace(/the run whose EVENT is `push`, whose/, "the run whose")
    .replace(/`pull_request` check on the source branch DOES NOT DISCHARGE THIS/, "check on the source branch is not the same run");
  assert.notEqual(specific, clause, "the specific weakening did not apply");
  const specificMissing = MERGE_COMPLETION_ELEMENTS.filter(
    (element) => !element.pattern.test(specific),
  ).map((element) => element.name);
  assert.deepEqual(specificMissing, [
    "the event is push",
    "a pull_request check does not discharge it",
  ]);
  /* AND THE ELEMENTS IT KEEPS ARE STILL THERE, which is what makes it the
     dangerous member rather than a second copy of member 1. */
  assert.match(specific, /head sha equals the new [a-z-]* ?tip/i);
});

test("the merge-completion clause cites T-009 by id, and the general scoping rule ships beside it", () => {
  assert.match(clauseText(body, "merge-is-not-complete-until"), /T-009/);
  const general = flatten(clauseText(body, "gate-result-is-scoped-to-its-run"));
  assert.match(general, /never a complete sentence/i);
  assert.match(general, /names the EVENT and the HEAD SHA/i);
  assert.match(general, /BOTH arms need a witness/i);
});

/* ------------------------------------------------------------------ */
/* Criterion 6: the four plan-assigned duties carry their source        */
/* ------------------------------------------------------------------ */

/**
 * The four duties of step 2 and the citation tokens each must carry. The
 * criterion names the pairs (D-4/PR-012, D-6/SC-008, D-8/SC-010, PR-201) and
 * the assertion is CLAUSE-SCOPED rather than document-scoped, because a token
 * anywhere in a long document says nothing about the duty it belongs to.
 */
const PLAN_ASSIGNED_DUTIES: readonly { clause: string; tokens: string[] }[] = [
  { clause: "fleet-state-commit-discipline", tokens: ["D-4", "PR-012", "SC-002"] },
  { clause: "merge-authority", tokens: ["D-6", "SC-008"] },
  { clause: "projects-read-only", tokens: ["D-8", "SC-010"] },
  { clause: "fleet-resume-specification", tokens: ["PR-201"] },
];

test("each of the four plan-assigned duties is present and cites its source record inside its own clause", () => {
  for (const duty of PLAN_ASSIGNED_DUTIES) {
    const text = flatten(clauseText(body, duty.clause));
    for (const token of duty.tokens) {
      assert.ok(
        text.includes(token),
        `clause ${duty.clause} does not cite ${token}`,
      );
    }
  }
});

test("the fleet-resume clause declares itself a specification rather than reading as a description of something that runs", () => {
  /* The plan says this half is "explicitly marked as specification with the
     machinery deferred". Unmarked, it is a clause a reader takes for a
     description of a mechanism that does not exist. */
  const text = flatten(clauseText(body, "fleet-resume-specification"));
  assert.match(text, /SPECIFICATION AND NOT A MECHANISM/);
  assert.match(text, /deferred/i);
});

/* ------------------------------------------------------------------ */
/* Criterion 8: clauses encoding a reversal cite the record             */
/* ------------------------------------------------------------------ */

/**
 * Every clause that encodes a decision REVERSING an earlier written position,
 * and the id it must cite. An untraceable clause gives a future reader nothing
 * to weigh a softening against, and this project has a recorded instance of the
 * shape: a plan carried a removed owner action for a day because the removal
 * lived in a record the plan did not cite.
 */
const REVERSAL_CITATIONS: readonly { clause: string; tokens: string[] }[] = [
  { clause: "decorrelated-review", tokens: ["DR-0012", "T-001"] },
  { clause: "merge-authority", tokens: ["DR-0015"] },
  { clause: "escalation-threshold", tokens: ["DR-0016"] },
  { clause: "stalled-phase-response", tokens: ["DR-0016"] },
  { clause: "two-review-contracts", tokens: ["T-007"] },
  { clause: "merge-is-not-complete-until", tokens: ["T-009"] },
];

test("every clause that encodes a reversed position cites its record by id, inside that clause", () => {
  for (const row of REVERSAL_CITATIONS) {
    const text = flatten(clauseText(body, row.clause));
    for (const token of row.tokens) {
      assert.ok(text.includes(token), `clause ${row.clause} does not cite ${token}`);
    }
  }
  /* T-008 belongs to the supervision SECTION rather than to one clause of it,
     which is where the plan puts it, so it is asserted against the section. */
  const supervision = flatten(
    AGENTS.slice(
      AGENTS.indexOf("## Supervision"),
      AGENTS.indexOf("## A green result is scoped"),
    ),
  );
  assert.ok(supervision.includes("T-008"), "the supervision section does not cite T-008");
});

test("the escalation-threshold clause carries both limbs, the ordering rule, and the measured cost", () => {
  const text = flatten(clauseText(body, "escalation-threshold"));
  assert.match(text, /genuinely comparable/i);
  assert.match(text, /costly to reverse/i);
  assert.match(text, /write your recommendation FIRST/i);
  /* THE COST IS THE HALF THAT GETS DROPPED, and a threshold with no cost
     attached is one that gets widened until it means nothing. */
  assert.match(text, /4\.7 hours/);
});

test("the two-review-contracts clause names two CONTRACTS and says why two models are not sufficient", () => {
  const text = flatten(clauseText(body, "two-review-contracts"));
  assert.match(text, /TWO REVIEW CONTRACTS/);
  assert.match(text, /WHY TWO MODELS ARE NOT SUFFICIENT/);
  /* THE RESIDUE T-007 asks this clause to carry. */
  assert.match(text, /never a terminal green/i);
});

test("the salvage clause carries the exact WIP prefix, verbatim and including its colon", () => {
  /* T-002's whole point is the EXACT string: a paraphrased marker cannot be
     searched for, and the next reader of a salvaged branch is entitled to find
     every unreviewed commit with one command. */
  assert.ok(
    flatten(clauseText(body, "salvage-discipline")).includes(
      "WIP-UNREVIEWED (do not treat as reviewed):",
    ),
  );
});

/* ------------------------------------------------------------------ */
/* The checker's own resolution rules, unit-level                       */
/* ------------------------------------------------------------------ */

const checkerModule = (await import(
  new URL("../scripts/check-agents-references.mjs", import.meta.url).href
)) as {
  headingSlug: (text: string) => string;
  anchorResolves: (anchor: string, slugs: string[]) => boolean;
  resolveFieldPointer: (
    document: unknown,
    pointer: string,
  ) => { found: boolean; at?: string };
  collectReferences: (text: string) => { path: string; anchor: string; token: string }[];
  documentBody: (text: string) => string;
};

test("a markdown anchor resolves on the stable clause id and not on the reworded title, and a deleted heading resolves to nothing", () => {
  /* The slug is COMPUTED by the shipped function from a real heading line, not
     hand-written, so this test cannot agree with a copy of the rule. */
  const slug = checkerModule.headingSlug(
    "clause fix-round-mechanism: name the mechanism, publish the derivation, state what it missed",
  );
  assert.equal(
    slug,
    "clause-fix-round-mechanism-name-the-mechanism-publish-the-derivation-state-what-it-missed",
  );
  assert.equal(checkerModule.anchorResolves("clause-fix-round-mechanism", [slug]), true);
  /* REWORDING THE TITLE AFTER THE COLON MUST NOT BREAK IT: that text is prose
     and is expected to change, and a reference that broke on it would train
     people to stop referencing anchors at all. */
  assert.equal(
    checkerModule.anchorResolves("clause-fix-round-mechanism", [
      "clause-fix-round-mechanism-a-completely-different-sentence",
    ]),
    true,
  );
  /* RENAMING THE ID MUST BREAK IT. */
  assert.equal(
    checkerModule.anchorResolves("clause-fix-round-mechanism", [
      "clause-fix-round-method-name-the-mechanism",
    ]),
    false,
  );
  /* AND A PREFIX THAT IS NOT HYPHEN-BOUNDED IS NOT A MATCH, which is what stops
     `clause-R-07` resolving against `clause-R-074`. */
  assert.equal(checkerModule.anchorResolves("clause-r-07", ["clause-r-074-something"]), false);
});

test("a field pointer walks objects by key and arrays by identity, and names the segment where it stops", () => {
  const document = {
    modes: [
      { id: "full", "merge-authority": "delegated-under-conditions" },
      { id: "direct-pr", "merge-authority": "owner" },
    ],
    roles: [{ role: "orchestrator", tier: "strongest" }],
  };
  assert.deepEqual(
    checkerModule.resolveFieldPointer(document, "modes.full.merge-authority"),
    { found: true },
  );
  assert.deepEqual(
    checkerModule.resolveFieldPointer(document, "roles.orchestrator.tier"),
    { found: true },
  );
  assert.deepEqual(
    checkerModule.resolveFieldPointer(document, "modes.full.merge-authority-regime"),
    { found: false, at: "merge-authority-regime" },
  );
  assert.deepEqual(
    checkerModule.resolveFieldPointer(document, "modes.nonexistent.merge-authority"),
    { found: false, at: "nonexistent" },
  );
});

test("the duplication detectors read the body and not the frontmatter, so this document can declare its own verifiers", () => {
  /* The frontmatter's `verifiers` names the gate ids that verify THIS file.
     Counting them as duplicated policy data would make the document unable to
     declare what checks it. The frontmatter is schema-closed, so a table
     cannot be hidden there. */
  const stripped = checkerModule.documentBody(AGENTS);
  assert.ok(!stripped.includes("verifiers:"), "the frontmatter was not stripped");
  assert.ok(stripped.includes("# Orchestrator"), "the body was stripped away");
});

test("the reference scanner finds every backticked path, anchored or not, while a bare path and a line citation remain outside it", () => {
  /* THIS TEST ASSERTED THE BLIND SPOT AS A FEATURE and CR-002 is what it cost.
     The old contract was "only `path#anchor` is a reference", so a backticked
     path with NO anchor matched nothing: never resolved, never counted, never
     reported. The reviewer who found CR-002 measured the consequence and it is
     as sharp as this failure gets: of the 14 paths `AGENTS.md` named, the 12
     anchored ones all existed and all shipped, and the 2 anchorless ones were
     exactly the 2 that did neither. The blind spot and the defect were the same
     set.

     WHAT STAYS OUTSIDE, and both exclusions are deliberate rather than
     leftovers. A BARE path (no backticks) is prose, and treating prose as a
     reference would make every sentence mentioning a directory a resolution
     failure. A LINE CITATION (`path.ext:LINE`, outside backticks) belongs to
     the citations gate, which resolves it against line numbers; this scanner
     claiming it too would give one token two owners. */
  const found = checkerModule.collectReferences(
    "see `roles/implementer.md#clause-R-074` and roles/implementer.md:143 and " +
      "`roles/implementer.md` and `roles/implementer.md#clause-R-074` and " +
      "`scripts/check-dual-review.mjs` and roles/investigator.md",
  );
  assert.deepEqual(
    found.map((entry) => entry.token),
    [
      "roles/implementer.md#clause-R-074",
      "roles/implementer.md",
      "scripts/check-dual-review.mjs",
    ],
  );
  /* AND THE ANCHOR IS REPORTED AS ABSENT rather than as an empty string, which
     is the same distinction the decorrelation repair turns on: every consumer
     below branches on `anchor === undefined`, so an anchorless reference cannot
     be silently walked as a pointer to nothing. */
  assert.equal(found[1]?.anchor, undefined);
  assert.equal(found[0]?.anchor, "clause-R-074");
});

test("a reference to a path the package does not publish is refused even though the file exists", () => {
  /* CR-002's MECHANISM, and it is a different question from "does the file
     exist". `AGENTS.md` is itself in the tarball, so every path it names is an
     instruction a consumer follows from inside `node_modules`; a path that
     resolves in this repository and not in the package is dead exactly where it
     is used. Existence was checked and shippability was not, which is how two
     dead references reached a shipped document.

     BOTH DIRECTIONS, against a REAL staged tree, and the added reference is a
     real repository file (`scripts/check-dual-review.mjs`) rather than an
     invented name, so the only property under test is publication. */
  const dir = stage("agents-unshipped-reference");
  try {
    /* THE BASELINE FIRST. A red arm with no green control cannot tell a defect
       from a broken probe, and this round has already been bitten once by a
       probe whose every row reddened for a reason that had nothing to do with
       the subject. */
    const baseline = runChecker(dir);
    assert.equal(baseline.status, 0, baseline.stdout);

    /* THE FILE REALLY IS THERE UNDER THE STAGED ROOT, read rather than assumed,
       so a refusal below cannot be the "not a readable file" arm wearing the
       wrong message. */
    const staged = readFileSync(join(dir, "scripts", "check-dual-review.mjs"), "utf8");
    assert.ok(staged.length > 0);

    writeFileSync(
      join(dir, "AGENTS.md"),
      `${AGENTS}\n\nSee \`scripts/check-dual-review.mjs\` for the runner.\n`,
    );
    const refused = runChecker(dir);
    assert.equal(refused.status, 1, refused.stdout);
    assert.match(
      refused.stdout,
      /scripts\/check-dual-review\.mjs, which exists here and is NOT in the published package/,
    );
    assert.doesNotMatch(refused.stdout, /is not a readable file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The gate wiring                                                      */
/* ------------------------------------------------------------------ */

test("check-agents-references is declared in the gate registry on both CI events and runs as a workflow step with no event narrowing", () => {
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as { gates: { id: string; events?: string[]; command?: string[] }[] };
  const entry = registry.gates.find((gate) => gate.id === "check-agents-references");
  assert.ok(entry !== undefined, "the gate is not declared in gate-registry.yaml");
  /* BOTH ARMS. A broken reference on the default branch is the state that
     matters, not only one proposed in a pull request (T-009). */
  assert.deepEqual(entry.events, ["pull_request", "push"]);

  const workflow = yamlModule.parse(
    readFileSync(join(repoRoot, ".github", "workflows", "gates.yml"), "utf8"),
  ) as { jobs: Record<string, { steps: { name?: string; run?: string; if?: string }[] }> };
  const steps = workflow.jobs["gates"]?.steps ?? [];
  const step = steps.find((candidate) =>
    (candidate.run ?? "").includes("check-agents-references.mjs"),
  );
  assert.ok(step !== undefined, "no workflow step runs the checker");
  /* NO `if:`. Adding one would be the defang shape section 2.3 rule 7 lists,
     and it is what would silently drop the push arm. */
  assert.equal(step.if, undefined);
  /* AND ONE JOB, named `gates`, per DR-0017 and DR-0004. */
  assert.deepEqual(Object.keys(workflow.jobs), ["gates"]);
});

test("the checker exits nonzero when the gate wiring is defanged with a trailing true, so the workflow step can actually fail the job", () => {
  /* A step that cannot fail the job is a gate that cannot go red, which is
     worse than none because it is trusted. This runs the STEP TEXT rather
     than asserting about it. */
  const workflow = yamlModule.parse(
    readFileSync(join(repoRoot, ".github", "workflows", "gates.yml"), "utf8"),
  ) as { jobs: Record<string, { steps: { run?: string }[] }> };
  const step = (workflow.jobs["gates"]?.steps ?? []).find((candidate) =>
    (candidate.run ?? "").includes("check-agents-references.mjs"),
  );
  assert.ok(step !== undefined);

  const dir = mkdtempSync(join(tmpdir(), "tiphys-agents-workflow-"));
  try {
    /* THE STEP TEXT AS WRITTEN, executed. */
    const live = spawnSync("bash", ["-c", step.run as string], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(live.status, 0, `${live.stdout}${live.stderr}`);

    /* THE SAME STEP TEXT, pointed at a BROKEN document. The command is not
       rewritten: a `--document` argument is appended to the step's own text, so
       what runs is the shipped invocation and not a stand-in for it. The
       working tree is untouched; the broken document lives in a scratch
       directory. */
    const broken = join(dir, "AGENTS.md");
    writeFileSync(
      broken,
      `${AGENTS}\n## Modes\n\n- full: everything\n- direct-pr: gates only\n- local-only: no remote\n`,
    );
    const failed = spawnSync(
      "bash",
      ["-c", `${step.run as string} --document ${JSON.stringify(broken)}`],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(failed.status, 0, `${failed.stdout}${failed.stderr}`);
    assert.match(failed.stdout, /distinct mode ids occur in list or table rows/);

    /* AND THE DEFANG, so this test can tell the live step from a disabled one.
       A step text ending in `|| true` swallows the failure, and a guard whose
       condition cannot distinguish the two is worthless. */
    const defanged = spawnSync(
      "bash",
      ["-c", `${step.run as string} --document ${JSON.stringify(broken)} || true`],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(defanged.status, 0, "the defang did not apply, so the arms are not distinguishable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
