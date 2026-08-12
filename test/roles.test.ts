/**
 * THE ROLE-BRIEF TESTS (kernel plan M3, M3-P5 criteria 1, 4, 6b).
 *
 * Carries: frontmatter validation of the three authoring briefs; the clause
 * round trip in both directions, including the case that matters most, a
 * clause deleted from the SINGLE SHARED dispatch-contract file; the
 * text-specificity assertion that separates the incremental-output RULE from
 * the sentiment it is routinely softened into; and the SC-001 agreement
 * between the reviewer brief and the process document's role table.
 *
 * `src` is imported through the computed-URL dynamic import pattern, because
 * a literal relative import of a `src` module from `test/` fails the build
 * with TS2878 under `rewriteRelativeImportExtensions` across the project
 * reference (CLAUDE.md standing warning 4).
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const rolesDir = join(repoRoot, "roles");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

const rolesModule = (await import(new URL("../src/roles.ts", import.meta.url).href)) as {
  ROLE_IDS: readonly string[];
  clauseAnchors: (body: string) => string[];
};

/** The three briefs this phase ships. */
const AUTHORING_ROLES = ["investigator", "plan-writer", "adversarial-plan-reviewer"];

/**
 * The reviewer's settled visibility, SC-001 and plan v1 D-14. One string,
 * asserted to occur in two documents, so the two cannot silently diverge
 * again the way the process document and the blueprint did.
 */
const SETTLED_VISIBILITY = "the input report, the plan, and the code";

/** The original role-table wording the SC-001 footnote must preserve. */
const ORIGINAL_VISIBILITY = "The plan + the code, nothing else";

function runCli(
  args: string[],
  cwd = repoRoot,
): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-roles-"));
}

/** A writable copy of `roles/`, so a brief can be defanged without touching the tree. */
function stageRoles(): string {
  const dir = scratch();
  cpSync(rolesDir, join(dir, "roles"), { recursive: true });
  return dir;
}

function briefText(role: string): string {
  return readFileSync(join(rolesDir, `${role}.md`), "utf8");
}

function frontmatterOf(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const close = lines.indexOf("---", 1);
  return yamlModule.parse(lines.slice(1, close).join("\n")) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Criterion 1: the frontmatter contract                                */
/* ------------------------------------------------------------------ */

test("tiphys validate --type role-brief exits 0 for every shipped authoring brief and nonzero when a required frontmatter field is removed", () => {
  for (const role of AUTHORING_ROLES) {
    const green = runCli(["validate", "--type", "role-brief", `roles/${role}.md`]);
    assert.equal(green.status, 0, `${role}: ${green.stdout}${green.stderr}`);
  }

  /* THE DANGEROUS STATE IS A BRIEF THAT LOOKS COMPLETE. `model-tier` is
     removed rather than `role`, because a brief with no role is obviously
     broken and a brief with no tier dispatches at whatever the harness
     defaults to, which is the failure that survives a reading. */
  const dir = stageRoles();
  try {
    const path = join(dir, "roles", "investigator.md");
    const original = readFileSync(path, "utf8");
    writeFileSync(path, original.replace("model-tier: strongest\n", ""));
    const red = runCli(["validate", "--type", "role-brief", path]);
    assert.notEqual(red.status, 0);
    assert.match(red.stdout, /model-tier/);

    writeFileSync(path, original);
    assert.equal(runCli(["validate", "--type", "role-brief", path]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the role vocabulary is the same closed set in the schema, the model config and src/roles.ts", () => {
  const schema = JSON.parse(
    readFileSync(join(repoRoot, "schemas", "role-brief.schema.json"), "utf8"),
  ) as { properties: { role: { enum: string[] } } };
  const config = yamlModule.parse(
    readFileSync(join(repoRoot, "role-model-config.yaml"), "utf8"),
  ) as { roles: { role: string }[] };
  const fromConfig = config.roles.map((entry) => entry.role).sort();
  assert.deepEqual([...schema.properties.role.enum].sort(), fromConfig);
  assert.deepEqual([...rolesModule.ROLE_IDS].sort(), fromConfig);
});

test("every shipped authoring brief declares the model tier its role-model-config row binds", () => {
  const config = yamlModule.parse(
    readFileSync(join(repoRoot, "role-model-config.yaml"), "utf8"),
  ) as { roles: { role: string; tier: string }[] };
  for (const role of AUTHORING_ROLES) {
    const bound = config.roles.find((entry) => entry.role === role);
    assert.ok(bound !== undefined, `role-model-config.yaml has no row for ${role}`);
    assert.equal(
      frontmatterOf(briefText(role))["model-tier"],
      bound.tier,
      `${role}'s brief tier disagrees with role-model-config.yaml`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 6b, first half: the clause round trip                      */
/* ------------------------------------------------------------------ */

test("deleting a clause heading orphans its id and a stray anchor is reported, in both directions", () => {
  const dir = stageRoles();
  try {
    const shared = join(dir, "roles", "_shared-dispatch-contract.md");
    const sharedOriginal = readFileSync(shared, "utf8");

    /* MEMBER ONE OF THE CLASS: the clause lives in the SHARED file that all
       three briefs include. If validation did not expand the include, this
       arm could not exist, and a brief that inlined its own copy would be
       indistinguishable from one that included the shared block. */
    writeFileSync(
      shared,
      sharedOriginal.replace(
        /^## clause incremental-output:.*$/m,
        "## Writing as you go",
      ),
    );
    for (const role of AUTHORING_ROLES) {
      const red = runCli([
        "validate",
        "--type",
        "role-brief",
        join(dir, "roles", `${role}.md`),
      ]);
      assert.notEqual(red.status, 0, `${role} stayed green with the clause deleted`);
      assert.match(red.stdout, /incremental-output/);
      assert.match(red.stdout, /orphaned/);
    }
    writeFileSync(shared, sharedOriginal);

    /* MEMBER TWO OF THE CLASS, structurally different: the clause lives in
       the brief's OWN body, so the failure is local rather than shared. */
    const investigator = join(dir, "roles", "investigator.md");
    const briefOriginal = readFileSync(investigator, "utf8");
    writeFileSync(
      investigator,
      briefOriginal.replace(/^## clause R-004:.*$/m, "## The verdict"),
    );
    const localRed = runCli(["validate", "--type", "role-brief", investigator]);
    assert.notEqual(localRed.status, 0);
    assert.match(localRed.stdout, /R-004/);

    /* THE REVERSE DIRECTION: text under a clause id nothing declared. */
    writeFileSync(investigator, `${briefOriginal}\n## clause undeclared-clause\n\nText.\n`);
    const strayRed = runCli(["validate", "--type", "role-brief", investigator]);
    assert.notEqual(strayRed.status, 0);
    assert.match(strayRed.stdout, /undeclared-clause is not declared in frontmatter/);

    /* Restored, and green again in both directions. */
    writeFileSync(investigator, briefOriginal);
    assert.equal(runCli(["validate", "--type", "role-brief", investigator]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every clause id a brief declares occurs exactly once as an anchor of its own body or of the block it includes", () => {
  const sharedAnchors = rolesModule.clauseAnchors(
    readFileSync(join(rolesDir, "_shared-dispatch-contract.md"), "utf8"),
  );
  assert.deepEqual(sharedAnchors, ["incremental-output", "beacon-is-not-a-claim"]);
  for (const role of AUTHORING_ROLES) {
    const declared = frontmatterOf(briefText(role))["clauses"] as string[];
    const own = rolesModule.clauseAnchors(briefText(role));
    const all = [...own, ...sharedAnchors];
    assert.deepEqual(
      [...declared].sort(),
      [...all].sort(),
      `${role}'s declared clauses and its anchors disagree`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 6b, second half: the rule, not the sentiment               */
/* ------------------------------------------------------------------ */

/**
 * What makes `incremental-output` a RULE rather than a sentiment. Each phrase
 * is a thing an agent can do or fail to do; "report as you go" is none of
 * them, which is the difference this assertion exists to hold.
 */
const INCREMENTAL_OUTPUT_RULE = [
  "within the FIRST MINUTES",
  "append to it as you go",
  "modification time is your beacon",
  "PARTIAL RESULT",
];

/** The mtime-as-beacon half, from the supervisor's end (T-008 rule 2). */
const BEACON_RULE = ["NEWEST MODIFICATION TIME", "never existence and", "never completion"];

/**
 * Prose wraps, so every text assertion in this file compares
 * whitespace-normalised strings. Asserting against a hard-wrapped phrase
 * would make a reflow of the same sentence a red test, which is a guard on
 * formatting rather than on content.
 */
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

test("the incremental-output clause text names the artifact-within-the-first-minutes rule in the shared source and in every composed authoring brief", () => {
  const shared = readFileSync(join(rolesDir, "_shared-dispatch-contract.md"), "utf8");
  for (const phrase of INCREMENTAL_OUTPUT_RULE) {
    assert.ok(
      flatten(clauseSection(shared, "incremental-output")).includes(phrase),
      `the shared incremental-output clause does not name: ${phrase}`,
    );
  }
  for (const phrase of BEACON_RULE) {
    assert.ok(
      flatten(clauseSection(shared, "beacon-is-not-a-claim")).includes(phrase),
      `the shared beacon-is-not-a-claim clause does not name: ${phrase}`,
    );
  }

  /* AND IN THE COMPOSED OUTPUT OF EACH BRIEF, which is where a dispatched
     agent actually reads it. A brief that inlined a softened copy instead of
     including the shared block fails here as well as failing the round trip. */
  for (const role of AUTHORING_ROLES) {
    const composed = runCli([
      "brief",
      "compose",
      "--role",
      role,
      "--phase",
      "templates/plan.example.yaml",
      "--phase-id",
      "M9-P1",
    ]);
    assert.equal(composed.status, 0, composed.stderr);
    for (const phrase of INCREMENTAL_OUTPUT_RULE) {
      assert.ok(
        flatten(clauseSection(composed.stdout, "incremental-output")).includes(phrase),
        `${role}'s composed brief does not name: ${phrase}`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4: SC-001, the two documents agree                         */
/* ------------------------------------------------------------------ */

test("the reviewer's settled visibility string occurs in both the role brief and the process document's role table", () => {
  const brief = briefText("adversarial-plan-reviewer");
  const process = readFileSync(
    join(repoRoot, "delivery", "intake", "orchestrated-delivery-process.md"),
    "utf8",
  );

  assert.ok(
    brief.includes(SETTLED_VISIBILITY),
    "the reviewer brief does not state the settled visibility",
  );
  assert.deepEqual(frontmatterOf(brief)["sees"], [SETTLED_VISIBILITY]);

  const row = process
    .split("\n")
    .find((line) => line.startsWith("| **Adversarial plan reviewer**"));
  assert.ok(row !== undefined, "the process document has no reviewer role-table row");
  assert.ok(
    row.includes(SETTLED_VISIBILITY),
    `the process document's role-table row does not state the settled visibility: ${row}`,
  );
  assert.ok(
    !row.includes(ORIGINAL_VISIBILITY),
    "the process document's role-table row still carries the superseded wording",
  );

  /* ANNOTATED, NOT REWRITTEN. The footnote must preserve the original
     wording and cite the finding, or the provenance the footnote exists for
     is gone and the edit is a rewrite wearing a citation. */
  const footnote = flatten(process.slice(process.indexOf("[^sc-001]:")));
  assert.ok(footnote.startsWith("[^sc-001]:"), "the SC-001 footnote is missing");
  assert.ok(
    footnote.includes(ORIGINAL_VISIBILITY),
    "the SC-001 footnote does not quote the original wording",
  );
  assert.match(footnote, /SC-001/);
  assert.match(footnote, /D-14/);
});
