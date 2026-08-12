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
const workflowPath = join(repoRoot, ".github", "workflows", "gates.yml");
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

test("adding a gate to the registry without re-rendering makes check-brief-drift --check exit nonzero naming the gate, and --write returns it to 0", () => {
  const dir = stageKernel("tiphys-impl-drift-");
  try {
    const registryPath = join(dir, "gate-registry.yaml");
    const original = readFileSync(registryPath, "utf8");
    const green = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir);
    assert.equal(green.status, 0, `${green.stdout}${green.stderr}`);

    /* MEMBER ONE: a gate ADDED to the registry. This is the direction a
       compare-the-block-to-itself check cannot detect, which is exactly why
       criterion 3 names it. */
    writeFileSync(
      registryPath,
      original.replace(
        "\ndestructiveCommands:",
        "\n  - id: invented-probe\n" +
          "    command: [node, scripts/invented.mjs]\n" +
          "    unitLabel: inventions counted\n" +
          "    applicability: required\n" +
          "    verified-by: script\n" +
          "    modes: [full]\n" +
          "    events: [pull_request]\n" +
          "\ndestructiveCommands:",
      ),
    );
    const red = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir);
    assert.notEqual(red.status, 0, "a gate was added to the registry and the drift check stayed green");
    assert.match(red.stdout, /invented-probe/);

    const written = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--write"], dir);
    assert.equal(written.status, 0, `${written.stdout}${written.stderr}`);
    const after = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir);
    assert.equal(after.status, 0, `${after.stdout}${after.stderr}`);
    assert.match(readFileSync(briefAt(dir), "utf8"), /invented-probe/);

    /* MEMBER TWO, STRUCTURALLY DIFFERENT: the registry is untouched and the
       BRIEF's block is edited instead. Both directions of one drift, and a
       check that only re-rendered on registry change would be green here. */
    writeFileSync(registryPath, original);
    const briefText = readFileSync(briefAt(dir), "utf8");
    writeFileSync(briefAt(dir), briefText.replace("| `suite` |", "| `suite-renamed` |"));
    const other = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir);
    assert.notEqual(other.status, 0, "the brief's block was edited by hand and the check stayed green");
    assert.match(other.stdout, /suite-renamed/);
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

test("the shipped brief's gate-list block declares the mode the kernel pins, and that mode selects every gate any mode in the registry selects", () => {
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as { gates: { id: string; modes: string[] }[] };

  const located = rolesModule.locateGateBlock(readFileSync(briefPath, "utf8"), briefPath);
  assert.ok(located.ok, located.ok ? "" : located.reason);
  assert.equal(
    located.mode,
    rolesModule.BRIEF_GATE_BLOCK_MODE,
    "the shipped brief's begin marker declares a mode the kernel does not pin",
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
test("the shipped brief's gate rows are exactly the gates the pinned mode selects, each carrying its registry fields, derived without the renderer", () => {
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
  const brief = readFileSync(briefPath, "utf8");
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

test("a narrowing inside the renderer is caught by the drift check in --check and refused in --write, under both a dropped row set and a dropped column", () => {
  const dir = stageKernel("tiphys-impl-renderer-");
  try {
    const rolesPath = join(dir, "src", "roles.ts");
    const script = join(dir, "scripts", "check-brief-drift.mjs");
    const pristine = readFileSync(rolesPath, "utf8");

    const green = run(script, ["--check"], dir);
    assert.equal(green.status, 0, `${green.stdout}${green.stderr}`);

    /* MEMBER 1: the ROW SET narrowed, by a strict-subset filter on the
       selection. This is DV-1's own defang. */
    const rowNarrowed = pristine.replace(
      "const selected = registry.gates.filter((gate) => (gate.modes ?? []).includes(mode));",
      "const selected = registry.gates.filter((gate) => (gate.modes ?? []).includes(mode))" +
        '.filter((gate) => gate["verified-by"] === "script");',
    );
    assert.notEqual(rowNarrowed, pristine, "the row-narrowing defang did not apply");
    writeFileSync(rolesPath, rowNarrowed);

    const rowWrite = run(script, ["--write"], dir);
    assert.notEqual(
      rowWrite.status,
      0,
      `--write laundered a row-narrowed renderer into the brief: ${rowWrite.stdout}`,
    );
    const rowCheck = run(script, ["--check"], dir);
    assert.notEqual(rowCheck.status, 0, `--check missed the row narrowing: ${rowCheck.stdout}`);
    assert.match(
      `${rowCheck.stdout}${rowCheck.stderr}`,
      /carries no row for it/,
      "the row narrowing was caught but not named as a missing row",
    );

    /* MEMBER 2: the ROW SET UNTOUCHED and a COLUMN dropped. Every id still
       appears, so anything built only from set membership is green here. */
    writeFileSync(rolesPath, pristine);
    const backToGreen = run(script, ["--check"], dir);
    assert.equal(backToGreen.status, 0, `${backToGreen.stdout}${backToGreen.stderr}`);

    const columnDropped = pristine.replace(
      " | ${gate.applicability} | ${gate.unitLabel} |`,",
      " | ${gate.applicability} |`,",
    );
    assert.notEqual(columnDropped, pristine, "the column-dropping defang did not apply");
    writeFileSync(rolesPath, columnDropped);

    const colWrite = run(script, ["--write"], dir);
    assert.notEqual(
      colWrite.status,
      0,
      `--write laundered a column-dropped renderer into the brief: ${colWrite.stdout}`,
    );
    const colCheck = run(script, ["--check"], dir);
    assert.notEqual(colCheck.status, 0, `--check missed the dropped column: ${colCheck.stdout}`);
    assert.match(
      `${colCheck.stdout}${colCheck.stderr}`,
      /carries no cell holding its registry unitLabel/,
      "the dropped column was caught but not named as a missing field",
    );

    /* AND THE TWO ARE CAUGHT FOR DIFFERENT REASONS rather than by one path: the
       row narrowing never reports a missing field, and the column drop never
       reports a missing row. */
    assert.doesNotMatch(
      `${rowCheck.stdout}${rowCheck.stderr}`,
      /carries no cell holding its registry/,
      "the row narrowing was caught by the field assertion, so the two members share a path",
    );
    assert.doesNotMatch(
      `${colCheck.stdout}${colCheck.stderr}`,
      /carries no row for it/,
      "the column drop was caught by the row assertion, so the two members share a path",
    );

    writeFileSync(rolesPath, pristine);
    const restored = run(script, ["--check"], dir);
    assert.equal(restored.status, 0, `${restored.stdout}${restored.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("narrowing the brief's declared gate-list mode makes the drift check refuse in both --write and --check, rather than re-rendering a smaller table and calling it green", () => {
  const dir = stageKernel("tiphys-impl-mode-");
  try {
    const path = briefAt(dir);
    const original = readFileSync(path, "utf8");
    const located = rolesModule.locateGateBlock(original, path);
    assert.ok(located.ok, located.ok ? "" : located.reason);
    const pinnedMarker = rolesModule.briefGateBlockBeginMarker(located.mode);
    assert.ok(original.includes(pinnedMarker), "the begin marker was not reproduced by the renderer");
    assert.equal(run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir).status, 0);

    /* TWO STRUCTURALLY DIFFERENT MEMBERS OF ONE CLASS, because one witness is
       not a class. They differ in what the narrowed mode is: the first is a
       mode the registry really declares, which renders a SMALLER but non-empty
       and self-consistent table (the shape that was green before this round);
       the second is a mode no gate declares, which renders an EMPTY table and
       is the shape a vacuity guard is supposed to catch. */
    for (const narrowed of ["local-only", "no-such-mode"]) {
      const narrowedText = original.replace(
        pinnedMarker,
        rolesModule.briefGateBlockBeginMarker(narrowed),
      );
      assert.notEqual(narrowedText, original, `the marker could not be narrowed to ${narrowed}`);
      writeFileSync(path, narrowedText);
      const written = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--write"], dir);
      assert.notEqual(
        written.status,
        0,
        `--write re-rendered the block for narrowed mode ${narrowed} instead of refusing`,
      );
      assert.match(written.stdout, new RegExp(narrowed));
      /* AND THE REFUSAL LEFT THE FILE ALONE. `--write` is the command that
         turns a narrowed marker into a self-consistent smaller table, so a
         refusal that had already written would close nothing. */
      assert.equal(
        readFileSync(path, "utf8"),
        narrowedText,
        `--write rewrote the gate table for narrowed mode ${narrowed}`,
      );
      const checked = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir);
      assert.notEqual(
        checked.status,
        0,
        `--check reported no drift for narrowed mode ${narrowed}`,
      );
      assert.match(checked.stdout, new RegExp(narrowed));
      assert.match(checked.stdout, new RegExp(rolesModule.BRIEF_GATE_BLOCK_MODE));
    }

    writeFileSync(path, original);
    assert.equal(run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the rendering counts the gate rows it produced, so a registry declaring no gate for the brief's mode makes the drift check a vacuous error and never a green over an empty table", () => {
  /* ARM ONE, DIRECT: the number the gate reports must measure the thing its
     unitLabel names ("generated brief gate rows compared"). Derived by counting
     the rows in the rendered text, never pinned to a literal. */
  const registryText = readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8");
  const registry = yamlModule.parse(registryText);
  const rendered = rolesModule.renderBriefGateBlock(
    registry,
    rolesModule.BRIEF_GATE_BLOCK_MODE,
  );
  const rows = rendered.text.split("\n").filter((line) => /^\| `/.test(line));
  assert.ok(rows.length > 0, "the rendering produced no gate rows at all");
  assert.equal(
    rendered.units,
    rows.length,
    "the unit count does not equal the number of gate rows rendered, so it cannot make M2-C-2 fire",
  );

  /* ARM TWO, END TO END THROUGH THE GATE: strip the pinned mode from every
     `modes` list in the registry, DERIVED by rewriting each list rather than
     by naming the lists, so the brief's mode selects nothing. `--write` then
     produces a table with a header, a separator and no rows, and `--check`
     finds the brief in perfect agreement with the registry. Before this round
     that was `green (3 generated brief gate rows compared)`: the three
     preflight steps are mode-independent, so units had a floor of three and
     M2-C-2, which rewrites green-with-zero-units and nothing else, could not
     fire over an empty subject. */
  const dir = stageKernel("tiphys-impl-vacuous-");
  try {
    const registryPath = join(dir, "gate-registry.yaml");
    const stripped = registryText.replace(
      /modes: \[([^\]]*)\]/g,
      (_match: string, inner: string) => {
        const kept = inner
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry !== rolesModule.BRIEF_GATE_BLOCK_MODE);
        return `modes: [${kept.join(", ")}]`;
      },
    );
    assert.notEqual(stripped, registryText, "no modes list mentioned the pinned mode");
    writeFileSync(registryPath, stripped);

    const written = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--write"], dir);
    assert.equal(written.status, 0, `${written.stdout}${written.stderr}`);
    const table = rolesModule.locateGateBlock(readFileSync(briefAt(dir), "utf8"), briefAt(dir));
    assert.ok(table.ok, table.ok ? "" : table.reason);
    assert.equal(
      table.block.split("\n").filter((line) => /^\| `/.test(line)).length,
      0,
      "stripping the pinned mode from every gate left rows in the rendered table",
    );

    const resultPath = join(dir, "brief-drift.json");
    const checked = run(
      join(dir, "scripts", "check-brief-drift.mjs"),
      ["--check", "--result", resultPath],
      dir,
    );
    assert.notEqual(checked.status, 0, "the check reported success over an empty gate table");
    const record = JSON.parse(readFileSync(resultPath, "utf8")) as {
      status: string;
      units: number;
      vacuous?: boolean;
    };
    assert.equal(record.units, 0, "an empty gate table was counted as a non-zero number of rows");
    assert.equal(record.status, "error", "an empty gate table did not become an error");
    assert.equal(record.vacuous, true, "M2-C-2 did not mark the empty run vacuous");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the drift check refuses a brief carrying no generated block, rather than reporting no drift", () => {
  const dir = stageKernel("tiphys-impl-nomarker-");
  try {
    const path = briefAt(dir);
    const original = readFileSync(path, "utf8");
    const located = rolesModule.locateGateBlock(original, path);
    assert.ok(located.ok, located.ok ? "" : located.reason);
    writeFileSync(path, original.replace(located.block, "(the gate list used to be here)"));
    const refused = run(join(dir, "scripts", "check-brief-drift.mjs"), ["--check"], dir);
    assert.notEqual(refused.status, 0, "a brief with no block reported no drift");
    assert.match(refused.stdout, /begin marker/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

test("the destructive-authority clause names all three conjuncts and the manifest path, and a moved manifest makes compose exit nonzero", () => {
  const clause = flatten(clauseSection(readFileSync(briefPath, "utf8"), "destructive-authority"));
  assert.ok(
    clause.includes("gates.manifest.json"),
    "the destructive-authority clause does not name the manifest by path",
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
    const manifest = join(dir, "gates.manifest.json");
    const original = readFileSync(manifest, "utf8");
    rmSync(manifest);
    const red = composeIn(dir);
    assert.notEqual(red.status, 0, "the manifest was moved and compose still exited 0");
    assert.match(red.stderr, /gates\.manifest\.json/);
    writeFileSync(manifest, original);
    assert.equal(composeIn(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the seed mechanism index validates, and its mechanism keys are a superset of the interim index's, naming any that is missing", () => {
  const validated = run(
    cliEntry,
    ["validate", "--type", "mechanism-index", "tuition/mechanism-index.yaml"],
    repoRoot,
  );
  assert.equal(validated.status, 0, `${validated.stdout}${validated.stderr}`);

  /* THE EXPECTED SET IS DERIVED FROM THE INTERIM FILE, NEVER WRITTEN HERE. A
     list of twelve names in this file would be a third source, and the property
     under test is precisely that the seed did not silently drop a row of the
     SECOND one. The derivation is the interim table's own first column. */
  const interim = readFileSync(join(repoRoot, "MECHANISMS.md"), "utf8");
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

/* ------------------------------------------------------------------ */
/* Criterion 11: the CI wiring is EXECUTED, not asserted about           */
/* ------------------------------------------------------------------ */

/**
 * THE STEP IS EXTRACTED AND RUN. A text assertion over the workflow catches a
 * DELETED step and misses a DEFANGED one, which is the mechanism the interim
 * index records under "asserting a CI step is wired" and which cost four fix
 * rounds in M1-P6. So the `run:` script is lifted out of the workflow and
 * executed against a staged tree, and its EXIT CODE is what is asserted.
 */
function briefDriftStep(): { name: string; run: string; if?: string } {
  const workflow = yamlModule.parse(readFileSync(workflowPath, "utf8")) as {
    jobs: { gates: { steps: { name?: string; run?: string; if?: string }[] } };
  };
  const steps = workflow.jobs.gates.steps;
  const found = steps.filter((step) => (step.run ?? "").includes("check-brief-drift.mjs"));
  assert.equal(
    found.length,
    1,
    `expected exactly one brief-drift step in the gates job, found ${String(found.length)}`,
  );
  const step = found[0] as { name?: string; run?: string; if?: string };
  assert.ok(step.run !== undefined, "the brief-drift step has no run script");
  return { name: step.name ?? "", run: step.run, ...(step.if === undefined ? {} : { if: step.if }) };
}

test("the brief-drift step wired into the gates workflow is executed against stubs and reddens under two structurally different defangs", () => {
  const step = briefDriftStep();
  /* NO `if:`. Brief drift is a property of the default branch and not only of a
     pull request (T-009), and an added `if:` is the defang shape section 2.3
     rule 7 lists. Asserted because the executions below cannot see it: a step
     that never runs on an arm has no exit code on that arm. */
  assert.equal(step.if, undefined, "the brief-drift step carries an if:, so one CI arm never runs it");

  const dir = stageKernel("tiphys-impl-wired-");
  try {
    const execute = (): Run => {
      const result = spawnSync("bash", ["-c", step.run], {
        encoding: "utf8",
        cwd: dir,
        timeout: BOUNDED_MS,
        env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}` },
      });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    };

    const green = execute();
    assert.equal(green.status, 0, `the wired step failed on a clean tree: ${green.stdout}${green.stderr}`);

    /* DEFANG ONE: the REGISTRY gains a gate and the brief is not re-rendered.
       This is the drift the step exists to catch. */
    const registryPath = join(dir, "gate-registry.yaml");
    const registry = readFileSync(registryPath, "utf8");
    writeFileSync(
      registryPath,
      registry.replace(
        "\ndestructiveCommands:",
        "\n  - id: smuggled-gate\n" +
          "    command: [node, scripts/smuggled.mjs]\n" +
          "    unitLabel: smugglings counted\n" +
          "    applicability: required\n" +
          "    verified-by: script\n" +
          "    modes: [full]\n" +
          "    events: [pull_request]\n" +
          "\ndestructiveCommands:",
      ),
    );
    const drifted = execute();
    assert.notEqual(drifted.status, 0, "the wired step exited 0 with the registry ahead of the brief");
    assert.match(drifted.stdout, /smuggled-gate/);
    writeFileSync(registryPath, registry);
    assert.equal(execute().status, 0);

    /* DEFANG TWO, STRUCTURALLY DIFFERENT: the registry and the brief agree, and
       the BRIEF'S GENERATED BLOCK IS GONE. A check that compared whatever it
       found against whatever it found would report clean here while being red
       on defang one, so one member does not make a class. The failure this
       member is about is a check that cannot find its subject and calls that
       success, which is the guard-condition shape recorded twice in this
       repository. */
    const path = briefAt(dir);
    const brief = readFileSync(path, "utf8");
    const located = rolesModule.locateGateBlock(brief, path);
    assert.ok(located.ok, located.ok ? "" : located.reason);
    writeFileSync(path, brief.replace(located.block, ""));
    const blind = execute();
    assert.notEqual(blind.status, 0, "the wired step reported success with nothing to compare");
    assert.match(blind.stdout, /begin marker/);
    writeFileSync(path, brief);
    assert.equal(execute().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("brief-drift is declared in the gate registry and in the gate manifest, and the registry entry says which CI arm the runner reaches", () => {
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as { gates: { id: string; events: string[]; "verified-by": string }[] };
  const declared = registry.gates.find((gate) => gate.id === "brief-drift");
  assert.ok(declared !== undefined, "brief-drift is not declared in gate-registry.yaml");
  assert.equal(declared["verified-by"], "script");

  const manifest = JSON.parse(
    readFileSync(join(repoRoot, "gates.manifest.json"), "utf8"),
  ) as { gates: { id: string; command: string[] }[] };
  const entry = manifest.gates.find((gate) => gate.id === "brief-drift");
  assert.ok(entry !== undefined, "brief-drift is not an entry in gates.manifest.json");
  assert.ok(
    entry.command.includes("scripts/check-brief-drift.mjs"),
    "the manifest entry does not run the drift script",
  );

  /* THE `events` VALUE IS DERIVED FROM THE HARNESS, not asserted from a memory
     of it, which is the rule test/gate-registry.test.ts:400 already applies to
     every promoted entry. A gate the main bundle's hard-coded --only list does
     not name cannot run on push, whatever the registry claims. */
  const harness = readFileSync(join(repoRoot, "scripts", "m2-exit-test.sh"), "utf8");
  const mainBundle = /--only manifest-self-check[\s\S]*?\) \\/.exec(harness);
  assert.ok(mainBundle !== null, "the main bundle's --only list was not found in the harness");
  const pushGates = new Set(
    [...mainBundle[0].matchAll(/--only ([a-z0-9-]+)/g)].map((match) => match[1] as string),
  );
  assert.equal(
    declared.events.includes("push"),
    pushGates.has("brief-drift"),
    "brief-drift's declared push arm does not match the harness main bundle",
  );
});
