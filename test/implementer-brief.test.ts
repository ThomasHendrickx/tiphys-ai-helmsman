/**
 * THE IMPLEMENTER-BRIEF TESTS (kernel plan M3, M3-P6 criteria 2, 3, 4, 5, 8,
 * 8b, 9(a), 9(b) and 11).
 *
 * Carries: the six R-033a sections in both directions, one witness per section;
 * the generated gate-list block, compared against the registry's own rendering
 * and against the drift check in both directions; the absence of any
 * instruction the credentials forbid; the fleet warnings file in both its
 * present and absent states; the mechanism index and the destructive-authority
 * manifest path, each resolved through the SAME mandated-reading check and each
 * in both directions; the two revision-2 clause texts; and the CI wiring, which
 * is EXTRACTED AND EXECUTED rather than asserted about.
 *
 * `src` is imported through the computed-URL dynamic import pattern, because a
 * literal relative import of a `src` module from `test/` fails the build with
 * TS2878 under `rewriteRelativeImportExtensions` across the project reference
 * (CLAUDE.md standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
const briefPath = join(repoRoot, "roles", "implementer.md");
const PLAN = "templates/plan.example.yaml";
const PHASE_ID = "M9-P1";
const BOUNDED_MS = 60_000;

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

const rolesModule = (await import(new URL("../src/roles.ts", import.meta.url).href)) as {
  R033A_SECTIONS: readonly string[];
  sectionAnchors: (body: string) => string[];
  locateGateBlock: (
    text: string,
    path: string,
  ) => { ok: true; mode: string; block: string } | { ok: false; reason: string };
  renderBriefGateBlock: (
    registry: unknown,
    mode: string,
  ) => { text: string; units: number };
  BRIEF_GATE_BLOCK_MODE: string;
  briefGateBlockBeginMarker: (mode: string) => string;
};

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

/**
 * A scratch kernel root: enough of the tree for the CLI to run and for
 * `kernelRoot()` to resolve to the COPY rather than to this repository.
 *
 * NECESSARY AND NOT A CONVENIENCE. Every both-directions arm below needs a
 * brief with a section deleted, a mandated-reading path removed, or a registry
 * carrying a gate this repository does not declare. None of those may be
 * committed, because each would make the shipped brief fail its own contract.
 *
 * The staged set is DERIVED from the brief's own mandated-reading list plus the
 * three trees the CLI needs, rather than hand-listed. A hand-listed staging is
 * the shape CLAUDE.md records being found only by execution: M3-P1's test
 * helper staged four directories by name and a later phase's rows named a file
 * at the repository root.
 */
function stageKernel(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const entry of ["src", "bin", "roles", "schemas", "templates", "scripts"]) {
    cpSync(join(repoRoot, entry), join(dir, entry), { recursive: true });
  }
  cpSync(join(repoRoot, "gate-registry.yaml"), join(dir, "gate-registry.yaml"));
  for (const entry of mandatedReading()) {
    const from = join(repoRoot, entry);
    const to = join(dir, entry);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

function frontmatterOf(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const close = lines.indexOf("---", 1);
  return yamlModule.parse(lines.slice(1, close).join("\n")) as Record<string, unknown>;
}

function mandatedReading(): string[] {
  return frontmatterOf(readFileSync(briefPath, "utf8"))["mandated-reading"] as string[];
}

function composeIn(dir: string, extra: string[] = [], cwd = dir): Run {
  return run(
    join(dir, "bin", "tiphys.ts"),
    ["brief", "compose", "--role", "implementer", "--phase", PLAN, "--phase-id", PHASE_ID, ...extra],
    cwd,
  );
}

function compose(): Run {
  return run(
    cliEntry,
    ["brief", "compose", "--role", "implementer", "--phase", PLAN, "--phase-id", PHASE_ID],
    repoRoot,
  );
}

/** Prose wraps, so every text assertion here compares flattened strings. */
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

function briefAt(dir: string): string {
  return join(dir, "roles", "implementer.md");
}

/* ------------------------------------------------------------------ */
/* Criterion 2: the six R-033a sections, one witness per section         */
/* ------------------------------------------------------------------ */

test("the composed implementer brief carries all six R-033a sections, each non-empty", () => {
  const composed = compose();
  assert.equal(composed.status, 0, composed.stderr);
  assert.deepEqual(
    [...rolesModule.sectionAnchors(composed.stdout)].sort(),
    [...rolesModule.R033A_SECTIONS].sort(),
    "the composed brief's section anchors are not exactly R-033a's six",
  );
  for (const section of rolesModule.R033A_SECTIONS) {
    const heading = new RegExp(`^#{1,6}[ \\t]+section[ \\t]+${section}\\b`, "m");
    const start = composed.stdout.search(heading);
    assert.notEqual(start, -1, `no anchor for section ${section}`);
    const rest = composed.stdout.slice(start).split("\n").slice(1);
    const end = rest.findIndex((line) => /^#{1,6}[ \t]/.test(line));
    const body = (end === -1 ? rest : rest.slice(0, end)).join("\n");
    assert.notEqual(body.trim(), "", `section ${section} is empty in the composed brief`);
  }
});

test("deleting any one R-033a section makes brief compose exit nonzero naming that section, and restoring it returns 0", () => {
  const dir = stageKernel("tiphys-impl-sections-");
  try {
    const path = briefAt(dir);
    const original = readFileSync(path, "utf8");
    assert.equal(composeIn(dir).status, 0, composeIn(dir).stderr);

    /* ONE WITNESS PER SECTION, which criterion 2 asks for in as many words.
       Deleting one section at a time is what makes each of the six a guarded
       row rather than the list as a whole being guarded by whichever one the
       test happened to pick. */
    for (const section of rolesModule.R033A_SECTIONS) {
      const heading = new RegExp(`^#{1,6}[ \\t]+section[ \\t]+${section}(?:[ \\t]*:[^\\n]*)?$`, "m");
      assert.match(original, heading, `roles/implementer.md has no ${section} anchor to delete`);
      writeFileSync(path, original.replace(heading, "## A heading with no section marker"));
      const red = composeIn(dir);
      assert.notEqual(red.status, 0, `${section} deleted and compose still exited 0`);
      assert.match(red.stderr, new RegExp(section));
      writeFileSync(path, original);
      assert.equal(composeIn(dir).status, 0, `${section} restored and compose did not return 0`);
    }

    /* THE DANGEROUS STATE THAT IS NOT A DELETION, and it is the one that reads
       complete: the heading survives and the instruction under it does not. A
       check that counted anchors is green here and red on the loop above, so
       both arms are needed. */
    const emptied = original.replace(
      /(^#{1,6}[ \t]+section[ \t]+gate-list[^\n]*\n)[\s\S]*?(?=^#{1,6}[ \t])/m,
      "$1\n",
    );
    assert.notEqual(emptied, original, "the gate-list section could not be emptied");
    writeFileSync(path, emptied);
    const hollow = composeIn(dir);
    assert.notEqual(hollow.status, 0, "a brief with an empty gate-list section composed");
    assert.match(hollow.stderr, /gate-list/);
    assert.match(hollow.stderr, /empty/);

    writeFileSync(path, original);
    assert.equal(composeIn(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3: the generated gate-list block                            */
/* ------------------------------------------------------------------ */

test("the composed brief's gate-list block is byte-identical to the block gate-registry.yaml renders for the declared mode", () => {
  const composed = compose();
  assert.equal(composed.status, 0, composed.stderr);
  const located = rolesModule.locateGateBlock(composed.stdout, "the composed brief");
  assert.ok(located.ok, located.ok ? "" : located.reason);

  /* THE COMPARISON IS AGAINST THE REGISTRY, NOT AGAINST THE BRIEF FILE. Reading
     the committed block and comparing it to the composed one would compare the
     block to itself with an extra step, which is the hazard this phase names for
     this criterion by name. The registry is decoded here and rendered by the
     SHIPPED renderer, so a renderer that dropped a column would redden. */
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  );
  const rendered = rolesModule.renderBriefGateBlock(registry, located.mode);
  assert.equal(located.block, rendered.text);
  assert.ok(rendered.units > 0, "the rendering compared zero rows");
});

test("adding a gate to the project's gate-registry.yaml adds its row to the composed brief, and a registry selecting no gate for the brief's mode refuses to compose", () => {
  const dir = stageKernel("tiphys-impl-gate-list-");
  try {
    const registryPath = join(dir, "gate-registry.yaml");
    const original = readFileSync(registryPath, "utf8");
    const before = composeIn(dir);
    assert.equal(before.status, 0, before.stderr);
    assert.doesNotMatch(before.stdout, /invented-probe/);

    /* MEMBER ONE: a gate ADDED to the project's registry reaches the composed
       brief with no edit to the brief, because the brief carries no copy. */
    writeFileSync(
      registryPath,
      original.replace(
        "\ndestructiveCommands:",
        "\n  - id: invented-probe\n" +
          "    command: [node, scripts/invented.mjs]\n" +
          "    unitLabel: inventions counted\n" +
          "    applicability: required\n" +
          "    prevents: a fixture failure nobody else catches\n" +
          "    verified-by: script\n" +
          "    modes: [full]\n" +
          "    events: [pull_request]\n" +
          "\ndestructiveCommands:",
      ),
    );
    const after = composeIn(dir);
    assert.equal(after.status, 0, after.stderr);
    assert.match(after.stdout, /^\| `invented-probe` \| script \| required \| inventions counted \|$/m);

    /* MEMBER TWO, STRUCTURALLY DIFFERENT: a registry whose gates declare no
       mode the brief lists. Compose refuses rather than emitting a gate-list
       section that lists no gate. */
    writeFileSync(registryPath, original.replace(/modes: \[[^\]]*\]/g, "modes: [local-only]"));
    const empty = composeIn(dir);
    assert.notEqual(empty.status, 0, "a registry selecting no gate for the brief's mode composed");
    assert.match(empty.stderr, /declares no gate for mode full/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3, fix round 1: the check's SUBJECT cannot be narrowed      */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM THESE THREE TESTS GUARD, named rather than left as three
 * instances: A CHECK WHOSE SUBJECT IS SELECTED BY A VALUE READ FROM THE
 * ARTIFACT IT AUDITS CAN BE SILENTLY NARROWED BY EDITING THAT ARTIFACT, and a
 * unit count that does not measure what was compared cannot make the vacuity
 * guard fire. Two clean-room contracts reached the same defect from opposite
 * directions on 16bab6f, one by forcing the narrowing and one by deriving the
 * unit arithmetic, and neither was asked to look for it.
 *
 * Before the fix the brief's declared mode was pinned only INCIDENTALLY: the
 * two tests above plant a gate declared `modes: [full]`, so a narrowed brief
 * filters the planted gate out and they fail for the wrong reason. Changing the
 * planted gate's modes would have removed the guard without touching anything
 * that looks like a mode assertion.
 */

test("the composed brief's gate-list block declares the mode the kernel pins, and that mode selects every gate any mode in the registry selects", () => {
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as { gates: { id: string; modes: string[] }[] };

  const composed = compose();
  assert.equal(composed.status, 0, composed.stderr);
  const located = rolesModule.locateGateBlock(composed.stdout, "the composed brief");
  assert.ok(located.ok, located.ok ? "" : located.reason);
  assert.equal(
    located.mode,
    rolesModule.BRIEF_GATE_BLOCK_MODE,
    "the composed brief's begin marker declares a mode the kernel does not pin",
  );

  /* WHY THAT MODE IS THE RIGHT ONE, DERIVED FROM THE REGISTRY rather than
     asserted as a literal a second time. The hazard is NARROWING, so the pinned
     mode must be one no other mode can be wider than. Derived per mode and per
     gate, never by count, because the registry is append-only and a pinned
     count is a claim about every future phase. */
  const selects = (mode: string): Set<string> =>
    new Set(registry.gates.filter((gate) => (gate.modes ?? []).includes(mode)).map((g) => g.id));
  const pinned = selects(rolesModule.BRIEF_GATE_BLOCK_MODE);
  assert.ok(pinned.size > 0, "the pinned mode selects no gate at all");
  const declaredModes = new Set(registry.gates.flatMap((gate) => gate.modes ?? []));
  assert.ok(declaredModes.size > 1, "the registry declares one mode, so narrowing is untestable");
  for (const mode of declaredModes) {
    for (const id of selects(mode)) {
      assert.ok(
        pinned.has(id),
        `mode ${mode} selects ${id} and the pinned mode ${rolesModule.BRIEF_GATE_BLOCK_MODE} ` +
          "does not, so the brief's gate table is not the widest the registry declares",
      );
    }
  }
});

/**
 * THE THIRD SEAT, AND THE ONE NO CALLER OF THE RENDERER CAN CLOSE (M3-P6 fix
 * round 2, DV-1).
 *
 * The mechanism one level above the three tests before this one: A CHECK THAT
 * COMPARES A GENERATED ARTIFACT AGAINST ITS OWN GENERATOR CAN ONLY SEE DRIFT
 * BETWEEN THE TWO, so a narrowing INSIDE the generator is a fixed point of the
 * loop and is silent. Test 3 above compares the composed brief to a rendering,
 * but THROUGH `renderBriefGateBlock`, so it agrees with such a narrowing by
 * construction. Test 5 derives from the registry independently, which is right,
 * but it only compares mode against mode and never against the rows the shipped
 * brief actually carries.
 *
 * So this test reads the SHIPPED FILE, parses the registry itself, and never
 * calls `renderBriefGateBlock`, `locateGateBlock` or anything else from `src`.
 * That is deliberate duplication of the SELECTION and the FIELD LIST, never of
 * the rendering: a shared helper with the script would put both statements back
 * inside one loop, and the whole property being bought is that the two fail
 * independently. Deleting the script's own copy leaves this one standing.
 *
 * TWO STRUCTURALLY DIFFERENT MEMBERS, because one witness is not a class, and
 * they are caught for DIFFERENT REASONS rather than by one code path wearing two
 * hats. Dropping ROWS is caught by set equality and is invisible to any per-field
 * assertion, since an absent row has no fields. Dropping a COLUMN leaves the row
 * set identical, all fifteen ids present, and is invisible to set equality. Both
 * are exercised below against the real script.
 */
test("the composed brief's gate rows are exactly the gates the pinned mode selects, each carrying its registry fields, derived without the renderer", () => {
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as {
    gates: {
      id: string;
      modes: string[];
      applicability: string;
      unitLabel: string;
      probe?: string;
      "verified-by": string;
    }[];
  };

  /* THE BLOCK IS SLICED HERE, not located by the kernel's locator, so this test
     depends on no `src` function at all. The markers are matched by their
     literal opening text; a change to their shape should redden this. */
  const composed = compose();
  assert.equal(composed.status, 0, composed.stderr);
  const brief = composed.stdout;
  const begin = brief.indexOf("<!-- BEGIN GENERATED GATE LIST");
  const end = brief.indexOf("<!-- END GENERATED GATE LIST -->");
  assert.ok(begin !== -1, "the shipped brief carries no generated gate-list begin marker");
  assert.ok(end > begin, "the shipped brief carries no matching end marker after the begin marker");
  const block = brief.slice(begin, end);

  const selected = registry.gates.filter((gate) =>
    (gate.modes ?? []).includes(rolesModule.BRIEF_GATE_BLOCK_MODE),
  );
  assert.ok(selected.length > 0, "the pinned mode selects no gate at all");

  const rows = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = /^\| `([^`]+)` \|(.*)$/.exec(line);
    if (match !== null) {
      rows.set(match[1] as string, match[2] as string);
    }
  }

  /* SET EQUALITY, NOT CONTAINMENT, and NEVER BY COUNT: the registry is
     append-only, so a pinned number would be a claim about every future phase. */
  const expectedIds = new Set(selected.map((gate) => gate.id));
  for (const id of expectedIds) {
    assert.ok(
      rows.has(id),
      `the pinned mode selects ${id} and the shipped brief's gate table has no row for it`,
    );
  }
  for (const id of rows.keys()) {
    assert.ok(
      expectedIds.has(id),
      `the shipped brief's gate table carries a row for ${id}, which the pinned mode does not select`,
    );
  }

  /* AND EVERY REGISTRY FIELD OF THAT GATE IS IN A CELL OF ITS OWN. This is the
     half that survives a renderer which keeps every row and drops a column. */
  for (const gate of selected) {
    const cells = (rows.get(gate.id) as string).split("|").map((cell) => cell.trim());
    const fields: [string, string][] = [
      ["verified-by", gate["verified-by"]],
      ["applicability", gate.applicability],
      ["unitLabel", gate.unitLabel],
    ];
    for (const [field, value] of fields) {
      assert.ok(
        cells.some((cell) => cell === value || cell.startsWith(`${value} (probe \``)),
        `${gate.id}'s row in the shipped brief carries no cell holding its registry ${field} "${value}"`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4: the brief does not instruct what the credentials forbid  */
/* ------------------------------------------------------------------ */

test("the composed implementer brief contains no instruction to create or merge a pull request", () => {
  const composed = compose();
  assert.equal(composed.status, 0, composed.stderr);
  for (const forbidden of ["gh pr create", "pr merge", "open the PR"]) {
    assert.equal(
      composed.stdout.includes(forbidden),
      false,
      `the composed implementer brief instructs "${forbidden}", which the credentials M2-P8 scopes forbid`,
    );
  }
  /* AND THE POSITIVE HALF, so this is not only an absence: the brief must SAY
     the implementer does neither, because a brief silent on it produces an
     agent that tries and fails confusingly. */
  const flat = flatten(composed.stdout);
  assert.ok(
    flat.includes("You do not open a pull request and you do not merge"),
    "the brief does not state that the implementer neither opens a pull request nor merges",
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the fleet warnings file, in both states                  */
/* ------------------------------------------------------------------ */

test("the composed brief carries the fleet warnings file's full text when one exists and exactly the brief text when none does", () => {
  const dir = stageKernel("tiphys-impl-warnings-");
  try {
    const without = composeIn(dir);
    assert.equal(without.status, 0, without.stderr);
    assert.equal(
      without.stdout.includes("# Environment warnings"),
      false,
      "a composition with no warnings file emitted a warnings section",
    );

    const body = [
      "# Fleet warnings",
      "",
      "1. The staging remote rejects force pushes on Tuesdays.",
      "2. A NUL byte in a fixture makes git call the file binary.",
    ].join("\n");
    writeFileSync(join(dir, "warnings.md"), `${body}\n`);
    const withFile = composeIn(dir);
    assert.equal(withFile.status, 0, withFile.stderr);
    assert.ok(
      withFile.stdout.includes(body),
      "the composed brief does not carry the warnings file's full text",
    );
    /* FULL TEXT, not a reference to it and not the first line. Asserting the
       LAST line separately is what distinguishes "the file was read" from "the
       file was truncated", which is the failure a substring check on the header
       alone would pass. */
    assert.ok(
      withFile.stdout.includes("2. A NUL byte in a fixture makes git call the file binary."),
      "the warnings text is truncated in the composed brief",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criteria 8 and 8b: the mechanism index and the manifest path          */
/* ------------------------------------------------------------------ */

test("the implementer brief names the mechanism index by path and carries the two T-005 clauses", () => {
  const text = readFileSync(briefPath, "utf8");
  const reading = mandatedReading();
  assert.ok(
    reading.includes("tuition/mechanism-index.yaml"),
    "the mechanism index is not on the implementer brief's mandated reading",
  );
  const clauses = frontmatterOf(text)["clauses"] as string[];
  for (const clause of ["mechanism-lookup", "mechanism-sibling", "destructive-authority"]) {
    assert.ok(clauses.includes(clause), `the brief does not declare clause ${clause}`);
  }
});

test("deleting the seed mechanism index makes brief compose exit nonzero naming the path, and restoring it returns 0", () => {
  const dir = stageKernel("tiphys-impl-index-");
  try {
    assert.equal(composeIn(dir).status, 0);
    const index = join(dir, "tuition", "mechanism-index.yaml");
    const original = readFileSync(index, "utf8");
    rmSync(index);
    const red = composeIn(dir);
    assert.notEqual(red.status, 0, "the mechanism index was deleted and compose still exited 0");
    assert.match(red.stderr, /tuition\/mechanism-index\.yaml/);
    writeFileSync(index, original);
    assert.equal(composeIn(dir).status, 0, "the index was restored and compose did not return 0");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the destructive-authority clause names all three conjuncts and the registry path, and a moved registry makes compose exit nonzero", () => {
  const clause = flatten(clauseSection(readFileSync(briefPath, "utf8"), "destructive-authority"));
  assert.ok(
    clause.includes("gate-registry.yaml"),
    "the destructive-authority clause does not name the registry by path",
  );
  assert.ok(clause.includes("destructiveCommands"), "the clause does not name the list");
  /* THE THREE CONJUNCTS, each asserted by the thing that makes it a rule rather
     than a sentiment: state it, do not inherit it, register it. */
  assert.ok(
    clause.includes("State the destructive authority explicitly in the command's OWN contract"),
    "conjunct 1 (state it in the command's own contract) is missing or weakened",
  );
  assert.ok(
    clause.includes("Never inherit force semantics from a caller"),
    "conjunct 2 (never inherit force semantics) is missing or weakened",
  );
  assert.ok(
    clause.includes("Add the command to the `destructiveCommands` list"),
    "conjunct 3 (register the command) is missing or weakened",
  );

  const dir = stageKernel("tiphys-impl-manifest-");
  try {
    assert.equal(composeIn(dir).status, 0);
    const manifest = join(dir, "gate-registry.yaml");
    const original = readFileSync(manifest, "utf8");
    rmSync(manifest);
    const red = composeIn(dir);
    assert.notEqual(red.status, 0, "the registry was moved and compose still exited 0");
    assert.match(red.stderr, /gate-registry\.yaml/);
    writeFileSync(manifest, original);
    assert.equal(composeIn(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the seed mechanism index validates, and its mechanism keys are a superset of the interim index's, naming any that is missing", () => {
  /* `--context` ADDED BY M3-P8, which registers a derived check for this type
     (`mechanism-rule-evidence-resolves`) that resolves each rule's citations
     against the tree. A context-requiring check with no context is reported
     SKIPPED rather than passing silently (M3-P1's rule; since kernel 0.2.1 a
     skipped-only run exits 0). The subject of this test, that the index
     validates and its keys are a superset of the interim file's, is
     unchanged. */
  const validated = run(
    cliEntry,
    [
      "validate",
      "--type",
      "mechanism-index",
      "--context",
      repoRoot,
      "tuition/mechanism-index.yaml",
    ],
    repoRoot,
  );
  assert.equal(validated.status, 0, `${validated.stdout}${validated.stderr}`);

  /* THE EXPECTED SET IS DERIVED FROM THE INTERIM FILE, NEVER WRITTEN HERE. A
     list of twelve names in this file would be a third source, and the property
     under test is precisely that the seed did not silently drop a row of the
     SECOND one. The derivation is the interim table's own first column.

     REPOINTED BY M3-P8, which DELETES the interim file (its step 2b) and
     checks in the verbatim capture this now reads (its criterion 4c). The
     capture is `037477e`, and its mechanism-name column was compared against
     the deleted file's before the swap and found identical, so this test's
     subject is unchanged. A test whose input the next phase deletes stops
     meaning anything the moment it is needed, which is why the criterion
     required the capture rather than the live file. */
  const interim = readFileSync(
    join(repoRoot, "test", "fixtures", "mechanisms-interim.md"),
    "utf8",
  );
  const interimNames = interim
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("|---") && !line.startsWith("| Mechanism"))
    .map((line) => (line.split("|")[1] as string).trim())
    .filter((name) => name !== "");
  assert.ok(
    interimNames.length >= 12,
    `the interim index parsed to ${String(interimNames.length)} rows, so the derivation is wrong`,
  );

  const seed = yamlModule.parse(
    readFileSync(join(repoRoot, "tuition", "mechanism-index.yaml"), "utf8"),
  ) as { mechanisms: { key: string; name: string; evidence: string[] }[] };
  const seededNames = new Set(seed.mechanisms.map((entry) => entry.name));
  for (const name of interimNames) {
    assert.ok(
      seededNames.has(name),
      `the seed index has lost the interim mechanism: ${name}`,
    );
  }

  /* AND THE KEY IS DERIVED FROM THE NAME rather than invented, so "the key set
     is a superset" follows from the names rather than being a second claim. */
  for (const entry of seed.mechanisms) {
    const slug = entry.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    assert.equal(entry.key, slug, `key ${entry.key} is not the slug of its own name`);
    assert.ok(entry.evidence.length > 0, `${entry.key} carries no evidence`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 9(a) and 9(b): the two revision-2 clause texts              */
/* ------------------------------------------------------------------ */

/**
 * THE PATTERN IS READ OUT OF `CLAUDE.md`, NEVER RESTATED HERE. Criterion 9(a)
 * requires the clause to carry the grep VERBATIM and requires the comparison to
 * be against the agent-rules file's own pattern; a copy in this file would make
 * the test assert agreement with itself, and the whole point of the clause is
 * that every implementer runs THE SAME grep.
 *
 * LABELLED AS WHAT IT IS, in the criterion's own words: this is a TEXT
 * ASSERTION. It proves the command is shipped, not that anyone runs it.
 */
test("the claim-grep clause carries the CLAUDE.md grep command verbatim, and a paraphrase reddens", () => {
  const rules = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
  /* EXACTLY ONE, asserted rather than assumed. Taking the FIRST match silently
     picks a different command the day the agent-rules file grows a second
     `-nEi` grep, and this assertion would then still pass while comparing the
     clause against something else entirely: a check whose subject can change
     under it without saying so. Measured at the time of writing: one. */
  const matches = [...rules.matchAll(/grep -nEi '[^']+'/g)].map((match) => match[0]);
  assert.equal(
    matches.length,
    1,
    `CLAUDE.md carries ${String(matches.length)} -nEi grep command(s); this test compares the ` +
      "claim-grep clause against THE claim grep, so a second one makes the subject ambiguous",
  );
  const command = matches[0] as string;

  const clause = clauseSection(readFileSync(briefPath, "utf8"), "claim-grep");
  assert.ok(
    clause.includes(command),
    `the claim-grep clause does not carry the command verbatim; expected ${command}`,
  );

  /* THE OTHER DIRECTION, over a copy in memory: a paraphrase must not satisfy
     the assertion above. Written as an explicit check rather than as a comment,
     because "this would fail if paraphrased" is exactly the claim the red
     witness rule refuses to take on trust. */
  const paraphrased = clause.replace(
    command,
    "grep your work history for words like cannot, always and never",
  );
  assert.equal(
    paraphrased.includes(command),
    false,
    "the paraphrase still contains the command, so this arm proves nothing",
  );
});

/**
 * THE FIX-ROUND CLAUSE'S REQUIREMENTS, AS A PREDICATE THAT CAN BE RE-RUN.
 *
 * IT IS A FUNCTION AND NOT A RUN OF `assert` CALLS ON PURPOSE (M3-P6 fix round
 * 1, finding A-1). The registered arm used to demonstrate its weakening arm IN
 * MEMORY: it built the two-item text with `String.replace` and asserted that
 * the result no longer CONTAINED item 3. That proves a weakening is
 * CONSTRUCTIBLE, not that the check REDDENS against it, and it is the exact
 * shape criterion 11 exists to prevent one file over. Shipping it in the phase
 * that closes prove-in-memory elsewhere is incoherent, so the requirements are
 * lifted into one predicate and the weakenings are written to a FILE, read back
 * off disk, and put through the SAME predicate, whose findings are then
 * observed.
 *
 * It returns the list of unmet requirements rather than throwing, because a
 * weakening arm has to be able to look at what the check SAID, not only at
 * whether it threw.
 */
const FIX_ROUND_ITEMS = [
  "NAME THE MECHANISM, not the finding",
  "PUBLISH THE DERIVATION",
  "STATE WHAT THE DERIVATION DID NOT COVER",
];

function fixRoundClauseFindings(clauseText: string): string[] {
  const clause = flatten(clauseText);
  const findings: string[] = [];
  const require = (held: boolean, finding: string): void => {
    if (!held) {
      findings.push(finding);
    }
  };
  for (const item of FIX_ROUND_ITEMS) {
    require(clause.includes(item), `the fix-round clause does not carry: ${item}`);
  }
  /* THE FULL OUTPUT, not a summary, is the half of item 2 that is routinely
     softened away, so it is checked separately from the item's heading. */
  require(
    clause.includes("together with its FULL output"),
    "the derivation item does not require the full output",
  );
  require(
    clause.includes("The reviewer's FIRST check is item 3"),
    "the clause does not carry the ordering requirement on the reviewer",
  );
  /* THE MEASUREMENT, which is what makes this a finding rather than an opinion:
     sixteen rounds, thirteen re-reviewed, twelve producing a new finding, and
     the counter-example of eleven call sites where a review had listed eight. */
  for (const figure of ["Sixteen", "thirteen", "TWELVE", "ELEVEN call sites", "listed eight"]) {
    require(clause.includes(figure), `the clause does not cite the measurement: ${figure}`);
  }
  return findings;
}

test("the fix-round-mechanism clause names all three items and cites the M1 measurement, and every weakening of it reddens the same check when it is re-run over the weakened file", () => {
  const shipped = clauseSection(readFileSync(briefPath, "utf8"), "fix-round-mechanism");
  assert.deepEqual(
    fixRoundClauseFindings(shipped),
    [],
    "the shipped fix-round clause does not satisfy its own check",
  );

  /* FOUR WEAKENINGS, STRUCTURALLY DIFFERENT, because one witness is not a
     class and the four requirements above fail independently: a dropped ITEM,
     a softened item that keeps its heading, a dropped ORDERING sentence, and a
     dropped MEASUREMENT figure. Each names what it expects the check to say,
     so an arm that reddened for some other reason is caught. */
  const weakenings: { name: string; weaken: (text: string) => string; expect: RegExp }[] = [
    {
      name: "item 3 deleted outright",
      weaken: (text) => text.split(FIX_ROUND_ITEMS[2] as string).join(""),
      expect: /does not carry: STATE WHAT THE DERIVATION DID NOT COVER/,
    },
    {
      name: "item 2 softened to drop the full-output demand, heading intact",
      weaken: (text) => text.split("together with its FULL output").join("with a summary of it"),
      expect: /does not require the full output/,
    },
    {
      name: "the reviewer ordering sentence removed",
      weaken: (text) => text.split("The reviewer's FIRST check is item 3").join(""),
      expect: /ordering requirement on the reviewer/,
    },
    {
      name: "the counter-example figure removed from the measurement",
      weaken: (text) => text.split("ELEVEN call sites").join("several call sites"),
      expect: /does not cite the measurement: ELEVEN call sites/,
    },
  ];

  const dir = mkdtempSync(join(tmpdir(), "tiphys-impl-fixround-"));
  try {
    for (const arm of weakenings) {
      const weakened = arm.weaken(shipped);
      assert.notEqual(weakened, shipped, `the weakening "${arm.name}" changed nothing`);
      /* THROUGH A FILE, so nothing here is a claim about a string this test
         holds in memory: the weakened clause is written, read back, and the
         same predicate is executed over what was read. */
      const path = join(dir, "clause.md");
      writeFileSync(path, weakened);
      const findings = fixRoundClauseFindings(readFileSync(path, "utf8"));
      assert.notEqual(
        findings.length,
        0,
        `the weakening "${arm.name}" left the check with nothing to report`,
      );
      assert.ok(
        findings.some((finding) => arm.expect.test(finding)),
        `the weakening "${arm.name}" reddened for the wrong reason: ${findings.join("; ")}`,
      );
    }

    /* AND BACK TO GREEN over the same path, so the arms above are not green
       because the predicate reports findings for everything it is handed. */
    const path = join(dir, "clause.md");
    writeFileSync(path, shipped);
    assert.deepEqual(fixRoundClauseFindings(readFileSync(path, "utf8")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
