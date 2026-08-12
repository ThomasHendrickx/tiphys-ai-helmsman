/**
 * THE CLEAN-ROOM-REVIEWER BRIEF TESTS (kernel plan M3, M3-P6 criteria 1, 7,
 * 9(c), 9(d) and 10).
 *
 * Carries: the two review contracts, declared and distinguishable, in both
 * directions; the clause round trip over BOTH briefs this phase ships, both
 * directions; the proof that each brief INCLUDES the one shared dispatch block
 * rather than carrying a copy of it; and the text-specificity assertion that
 * separates the two dispatch clauses from the sentiments they are routinely
 * softened into, under two structurally different weakenings.
 *
 * WHY THE DISPATCH-CLAUSE ASSERTIONS LIVE HERE AND NOT ONLY IN
 * `test/roles.test.ts`. That file already pins the phrases in the SHARED SOURCE
 * and in the composed output of every brief in `roles/`, and because its brief
 * set is read off disk at run time it covers these two the day they land. What
 * it does not do is name the two structurally different WEAKENINGS criterion
 * 9(d) requires, and a weakening that nothing reddens against is a phrase
 * nobody is stopping. Those are here.
 *
 * `src` is imported through the computed-URL dynamic import pattern (CLAUDE.md
 * standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const rolesDir = join(repoRoot, "roles");
const sharedPath = join(rolesDir, "_shared-dispatch-contract.md");
const PLAN = "templates/plan.example.yaml";
const PHASE_ID = "M9-P1";
const BOUNDED_MS = 60_000;

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

const rolesModule = (await import(new URL("../src/roles.ts", import.meta.url).href)) as {
  REVIEW_CONTRACTS: readonly string[];
  clauseAnchors: (body: string) => string[];
  reviewContractClause: (contract: string) => string;
};

/**
 * THE TWO BRIEFS THIS PHASE SHIPS, and the reason they are named here rather
 * than derived from `roles/` is that this phase's criteria are ABOUT these two.
 * `test/roles.test.ts` carries the derived-from-disk assertions that must hold
 * for every brief present and future; duplicating that derivation here would
 * make the two files assert the same property twice and neither of them assert
 * criterion 9(d), which is a claim about a named pair.
 */
const PHASE_BRIEFS = ["implementer", "clean-room-reviewer"];

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(entry: string, args: string[], cwd: string): Run {
  const result = spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf8",
    cwd,
    timeout: BOUNDED_MS,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function briefText(role: string): string {
  return readFileSync(join(rolesDir, `${role}.md`), "utf8");
}

function frontmatterOf(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const close = lines.indexOf("---", 1);
  return yamlModule.parse(lines.slice(1, close).join("\n")) as Record<string, unknown>;
}

function mandatedReadingOf(role: string): string[] {
  return frontmatterOf(briefText(role))["mandated-reading"] as string[];
}

/** A scratch kernel root, staged from every path the two briefs actually need. */
function stageKernel(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const entry of ["src", "bin", "roles", "schemas", "templates", "scripts"]) {
    cpSync(join(repoRoot, entry), join(dir, entry), { recursive: true });
  }
  cpSync(join(repoRoot, "gate-registry.yaml"), join(dir, "gate-registry.yaml"));
  for (const role of PHASE_BRIEFS) {
    for (const entry of mandatedReadingOf(role)) {
      const to = join(dir, entry);
      mkdirSync(dirname(to), { recursive: true });
      cpSync(join(repoRoot, entry), to, { recursive: true });
    }
  }
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

function composeAt(dir: string, role: string, extra: string[] = []): Run {
  return run(
    join(dir, "bin", "tiphys.ts"),
    ["brief", "compose", "--role", role, "--phase", PLAN, "--phase-id", PHASE_ID, ...extra],
    dir,
  );
}

function compose(role: string, extra: string[] = []): Run {
  return run(
    cliEntry,
    ["brief", "compose", "--role", role, "--phase", PLAN, "--phase-id", PHASE_ID, ...extra],
    repoRoot,
  );
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clauseSection(text: string, clauseId: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) =>
    new RegExp(`^#{1,6}[ \\t]+clause[ \\t]+${clauseId}(?:[ \\t]*:|[ \\t]*$)`).test(line),
  );
  assert.notEqual(start, -1, `no anchor for clause ${clauseId}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}[ \t]/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/* ------------------------------------------------------------------ */
/* Criterion 1: the clean-room brief validates                          */
/* ------------------------------------------------------------------ */

test("tiphys validate --type role-brief exits 0 on both briefs this phase ships", () => {
  for (const role of PHASE_BRIEFS) {
    const green = run(cliEntry, ["validate", "--type", "role-brief", `roles/${role}.md`], repoRoot);
    assert.equal(green.status, 0, `${role}: ${green.stdout}${green.stderr}`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 7: the clause round trip over this phase's two briefs       */
/* ------------------------------------------------------------------ */

test("every clause id in both new briefs occurs exactly once as a body anchor, and every anchor is declared, in both directions", () => {
  const sharedAnchors = rolesModule.clauseAnchors(readFileSync(sharedPath, "utf8"));
  for (const role of PHASE_BRIEFS) {
    const declared = frontmatterOf(briefText(role))["clauses"] as string[];
    const anchors = [...rolesModule.clauseAnchors(briefText(role)), ...sharedAnchors];
    assert.deepEqual(
      [...declared].sort(),
      [...anchors].sort(),
      `${role}'s declared clauses and its anchors disagree`,
    );
    /* EXACTLY ONCE, which a set comparison does not check: two anchors for one
       declared id compare equal as sets and are a brief saying one thing twice
       with the clause map resolving to whichever came first. */
    for (const id of declared) {
      assert.equal(
        anchors.filter((anchor) => anchor === id).length,
        1,
        `${role} declares ${id} and has more than one anchor for it`,
      );
    }
  }

  /* THE REVERSE DIRECTION, THROUGH THE SHIPPED VALIDATOR rather than through
     this file's own parser: an anchor nothing declares must be refused. */
  const dir = stageKernel("tiphys-cr-roundtrip-");
  try {
    for (const role of PHASE_BRIEFS) {
      const path = join(dir, "roles", `${role}.md`);
      const original = readFileSync(path, "utf8");
      writeFileSync(path, `${original}\n## clause undeclared-clause\n\nText.\n`);
      const stray = run(join(dir, "bin", "tiphys.ts"), ["validate", "--type", "role-brief", path], dir);
      assert.notEqual(stray.status, 0, `${role} accepted an undeclared anchor`);
      assert.match(stray.stdout, /undeclared-clause is not declared in frontmatter/);

      /* AND THE ORPHAN DIRECTION: a declared id with no text behind it. */
      const declared = frontmatterOf(original)["clauses"] as string[];
      const own = rolesModule.clauseAnchors(original);
      const localClause = declared.find((id) => own.includes(id)) as string;
      writeFileSync(
        path,
        original.replace(
          new RegExp(`^#{1,6}[ \\t]+clause[ \\t]+${localClause}[^\\n]*$`, "m"),
          "## A heading with no clause marker",
        ),
      );
      const orphan = run(join(dir, "bin", "tiphys.ts"), ["validate", "--type", "role-brief", path], dir);
      assert.notEqual(orphan.status, 0, `${role} accepted an orphaned clause id`);
      assert.match(orphan.stdout, new RegExp(localClause));
      assert.match(orphan.stdout, /orphaned/);

      writeFileSync(path, original);
      assert.equal(
        run(join(dir, "bin", "tiphys.ts"), ["validate", "--type", "role-brief", path], dir).status,
        0,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 10: the two review contracts                                */
/* ------------------------------------------------------------------ */

test("both review contracts compose, declare themselves, and differ in their first instruction; an unknown contract exits nonzero naming it", () => {
  const composed = new Map<string, string>();
  for (const contract of rolesModule.REVIEW_CONTRACTS) {
    const emitted = compose("clean-room-reviewer", ["--review-contract", contract]);
    assert.equal(emitted.status, 0, `${contract}: ${emitted.stderr}`);
    assert.match(
      emitted.stdout,
      new RegExp(`^review-contract: ${contract}$`, "m"),
      `the ${contract} brief does not declare which contract it is running`,
    );
    composed.set(contract, emitted.stdout);
  }

  /* THE FIRST INSTRUCTION DIFFERS, and "first instruction" is given a
     mechanical meaning rather than an impressionistic one: the first clause
     anchor of the composed body. A brief carrying BOTH contracts would have the
     same first anchor for both values, which is exactly the state this
     criterion exists to refuse. */
  const firstClause = (text: string): string =>
    rolesModule.clauseAnchors(text.slice(text.indexOf("# Brief body")))[0] as string;
  for (const contract of rolesModule.REVIEW_CONTRACTS) {
    assert.equal(
      firstClause(composed.get(contract) as string),
      rolesModule.reviewContractClause(contract),
      `the ${contract} brief does not open on its own contract clause`,
    );
    /* AND THE OTHER CONTRACT'S CLAUSE IS GONE, not merely later. A composed
       brief carrying both has told the reviewer to start from the criteria and
       not to start from the criteria. */
    for (const other of rolesModule.REVIEW_CONTRACTS.filter((id) => id !== contract)) {
      assert.equal(
        (composed.get(contract) as string).includes(rolesModule.reviewContractClause(other)),
        false,
        `the ${contract} brief still carries the ${other} contract's clause`,
      );
    }
  }

  const unknown = compose("clean-room-reviewer", ["--review-contract", "vibes"]);
  assert.notEqual(unknown.status, 0, "an unknown review contract composed");
  assert.match(unknown.stderr, /vibes/);

  /* THE FLAG BELONGS TO ONE ROLE. Accepting it silently elsewhere would let a
     dispatch believe it had selected a contract for a role that has none. */
  const wrongRole = compose("investigator", ["--review-contract", "criteria"]);
  assert.notEqual(wrongRole.status, 0, "--review-contract was accepted for a role with no contracts");
  assert.match(wrongRole.stderr, /investigator/);
});

test("the hazard brief instructs the reviewer not to begin from the criteria, and the criteria brief refuses to be a completeness claim", () => {
  const hazard = compose("clean-room-reviewer", ["--review-contract", "hazard"]);
  assert.equal(hazard.status, 0, hazard.stderr);
  const hazardText = flatten(hazard.stdout);
  assert.ok(
    hazardText.includes("DO NOT BEGIN FROM THE ACCEPTANCE CRITERIA"),
    "the hazard brief does not instruct the reviewer to start elsewhere",
  );
  assert.ok(
    hazardText.includes("Your starting question is the phase's declared hazard classes"),
    "the hazard brief does not name the hazard classes as the starting question",
  );

  const criteria = compose("clean-room-reviewer", ["--review-contract", "criteria"]);
  assert.equal(criteria.status, 0, criteria.stderr);
  const criteriaText = flatten(criteria.stdout);
  assert.ok(
    criteriaText.includes('"all acceptance criteria met" is ONE INPUT and never a terminal green'),
    "the criteria brief does not carry the sentence that a criteria verdict is not completeness",
  );

  /* BOTH DIRECTIONS: the criteria brief must NOT tell the reviewer to start
     from the hazards, and the hazard brief must NOT be the criteria walk. If
     both strings appeared in both briefs the selection did nothing. */
  assert.equal(
    criteriaText.includes("DO NOT BEGIN FROM THE ACCEPTANCE CRITERIA"),
    false,
    "the criteria brief carries the hazard contract's instruction",
  );
  assert.equal(
    hazardText.includes('"all acceptance criteria met" is ONE INPUT'),
    false,
    "the hazard brief carries the criteria contract's sentence",
  );
});

test("a clean-room brief whose selected contract clause is missing is refused, rather than composing without it", () => {
  const dir = stageKernel("tiphys-cr-missing-");
  try {
    const path = join(dir, "roles", "clean-room-reviewer.md");
    const original = readFileSync(path, "utf8");
    assert.equal(composeAt(dir, "clean-room-reviewer", ["--review-contract", "hazard"]).status, 0);
    writeFileSync(
      path,
      original.replace(/^#{1,6}[ \t]+clause[ \t]+review-contract-hazard[^\n]*$/m, "## Hazards"),
    );
    const red = composeAt(dir, "clean-room-reviewer", ["--review-contract", "hazard"]);
    assert.notEqual(red.status, 0, "a brief with no hazard clause composed a hazard brief");
    assert.match(red.stderr, /review-contract-hazard/);
    writeFileSync(path, original);
    assert.equal(composeAt(dir, "clean-room-reviewer", ["--review-contract", "hazard"]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 9(d): the dispatch clause TEXT, in both briefs              */
/* ------------------------------------------------------------------ */

/**
 * The phrases that make `incremental-output` a RULE rather than a sentiment,
 * and `beacon-is-not-a-claim` a FRESHNESS guard rather than a liveness probe.
 *
 * READ OUT OF THE SHARED SOURCE IS NOT AN OPTION HERE, and that is the point:
 * a test that derived its expected phrases from the file under test would be
 * green against any wording whatever. These are pinned, and criterion 9(d)'s
 * two weakenings below are what proves the pinning bites.
 */
const FIRST_MINUTES_RULE = "within the FIRST MINUTES";
const MTIME_CONSEQUENCE = "modification time is your beacon";
const FRESHNESS_RULE = ["NEWEST MODIFICATION TIME", "never existence and", "never completion"];

test("both briefs' composed dispatch clauses name the first-minutes rule, the mtime consequence and the freshness guard", () => {
  for (const role of PHASE_BRIEFS) {
    const composed = compose(role);
    assert.equal(composed.status, 0, composed.stderr);
    const incremental = flatten(clauseSection(composed.stdout, "incremental-output"));
    assert.ok(
      incremental.includes(FIRST_MINUTES_RULE),
      `${role}'s composed brief does not name the artifact-within-the-first-minutes rule`,
    );
    assert.ok(
      incremental.includes(MTIME_CONSEQUENCE),
      `${role}'s composed brief does not name the mtime-as-beacon consequence`,
    );
    const beacon = flatten(clauseSection(composed.stdout, "beacon-is-not-a-claim"));
    for (const phrase of FRESHNESS_RULE) {
      assert.ok(
        beacon.includes(phrase),
        `${role}'s composed beacon clause does not state: ${phrase}`,
      );
    }
  }
});

test("weakening the incremental-output clause to a generic restatement reddens for both briefs", () => {
  const dir = stageKernel("tiphys-cr-weakened-generic-");
  try {
    const shared = join(dir, "roles", "_shared-dispatch-contract.md");
    const original = readFileSync(shared, "utf8");
    for (const role of PHASE_BRIEFS) {
      const before = composeAt(dir, role);
      assert.equal(before.status, 0, before.stderr);
      assert.ok(flatten(clauseSection(before.stdout, "incremental-output")).includes(FIRST_MINUTES_RULE));
    }

    /* MEMBER ONE OF THE CLASS: a GENERIC RESTATEMENT. It is unspecific, it
       sounds like the same rule, and there is nothing in it an agent can be
       found not to have done. This is the phrasing criterion 9(d) names. */
    writeFileSync(
      shared,
      original.replace(
        /(^## clause incremental-output:[^\n]*\n)[\s\S]*?(?=^## clause )/m,
        "$1\nReport your progress as you work rather than only at the end.\n\n",
      ),
    );
    for (const role of PHASE_BRIEFS) {
      const composed = composeAt(dir, role);
      assert.equal(composed.status, 0, composed.stderr);
      const text = flatten(clauseSection(composed.stdout, "incremental-output"));
      assert.equal(
        text.includes(FIRST_MINUTES_RULE),
        false,
        `${role}: the weakening did not remove the artifact-within-the-first-minutes rule, so this arm proves nothing`,
      );
      assert.equal(
        text.includes(MTIME_CONSEQUENCE),
        false,
        `${role}: the weakening did not remove the mtime-as-beacon consequence, so this arm proves nothing`,
      );
      assert.ok(text.includes("Report your progress as you work"), `${role}: the weakening was not applied`);
    }

    writeFileSync(shared, original);
    for (const role of PHASE_BRIEFS) {
      const restored = composeAt(dir, role);
      assert.equal(restored.status, 0, restored.stderr);
      const text = flatten(clauseSection(restored.stdout, "incremental-output"));
      assert.ok(text.includes(FIRST_MINUTES_RULE));
      assert.ok(text.includes(MTIME_CONSEQUENCE));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("weakening the beacon clause to a liveness probe reddens for both briefs, which a vagueness check would not catch", () => {
  const dir = stageKernel("tiphys-cr-weakened-liveness-");
  try {
    const shared = join(dir, "roles", "_shared-dispatch-contract.md");
    const original = readFileSync(shared, "utf8");
    for (const role of PHASE_BRIEFS) {
      const before = composeAt(dir, role);
      assert.equal(before.status, 0, before.stderr);
      for (const phrase of FRESHNESS_RULE) {
        assert.ok(flatten(clauseSection(before.stdout, "beacon-is-not-a-claim")).includes(phrase));
      }
    }

    /* MEMBER TWO, STRUCTURALLY DIFFERENT, AND IT IS THE ONE THAT MATTERS. This
       weakening is SPECIFIC AND WRONG rather than vague: "check that the agent
       is still working" is a LIVENESS probe, which is the constraint C-2
       violation the first watchdog written after that incident actually
       shipped, and it was green and worthless. A test tuned to catch vagueness
       is green against it, which is why one weakening is not a class. */
    writeFileSync(
      shared,
      original.replace(
        /(^## clause beacon-is-not-a-claim:[^\n]*\n)[\s\S]*/m,
        "$1\nThe supervisor arms a guard that checks that the agent is still working.\n",
      ),
    );
    for (const role of PHASE_BRIEFS) {
      const composed = composeAt(dir, role);
      assert.equal(composed.status, 0, composed.stderr);
      const text = flatten(clauseSection(composed.stdout, "beacon-is-not-a-claim"));
      for (const phrase of FRESHNESS_RULE) {
        assert.equal(
          text.includes(phrase),
          false,
          `${role}: the liveness weakening left "${phrase}" in place, so this arm proves nothing`,
        );
      }
      assert.ok(text.includes("still working"), `${role}: the liveness weakening was not applied`);
    }

    writeFileSync(shared, original);
    for (const role of PHASE_BRIEFS) {
      const restored = composeAt(dir, role);
      assert.equal(restored.status, 0, restored.stderr);
      const text = flatten(clauseSection(restored.stdout, "beacon-is-not-a-claim"));
      for (const phrase of FRESHNESS_RULE) {
        assert.ok(text.includes(phrase));
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("both briefs INCLUDE the one shared dispatch block and do not carry a copy of it", () => {
  const includeLine = "$include: _shared-dispatch-contract.md";
  for (const role of PHASE_BRIEFS) {
    const text = briefText(role);
    assert.ok(text.includes(includeLine), `${role} does not include the shared dispatch block`);
    /* THE PROOF THAT IT IS AN INCLUDE AND NOT A COPY: the two shared clause
       anchors must be absent from the brief's OWN body and present in its
       composed output. A brief that inlined the block would carry the anchors
       in both places, which also duplicates the clause ids and fails the round
       trip; asserting it here says which of the two failures happened. */
    const own = rolesModule.clauseAnchors(text);
    for (const clause of ["incremental-output", "beacon-is-not-a-claim"]) {
      assert.equal(
        own.includes(clause),
        false,
        `${role} carries its own copy of the ${clause} clause instead of including the shared block`,
      );
    }
    const composed = compose(role);
    assert.equal(composed.status, 0, composed.stderr);
    for (const clause of ["incremental-output", "beacon-is-not-a-claim"]) {
      assert.ok(
        rolesModule.clauseAnchors(composed.stdout).includes(clause),
        `${role}'s composed brief has no ${clause} clause`,
      );
    }
  }

  /* AND THERE IS EXACTLY ONE SOURCE. Derived from `roles/` rather than
     asserted: any OTHER file carrying those anchors is a second copy, which is
     the state the shared block exists to make impossible. */
  const carriers = readdirSync(rolesDir)
    .filter((name) => name.endsWith(".md"))
    .filter((name) =>
      rolesModule.clauseAnchors(readFileSync(join(rolesDir, name), "utf8")).includes("incremental-output"),
    );
  assert.deepEqual(carriers, ["_shared-dispatch-contract.md"]);
});
