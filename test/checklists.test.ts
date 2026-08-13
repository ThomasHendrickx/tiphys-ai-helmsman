/**
 * THE CHECKLIST TESTS (kernel plan M3, M3-P7 criteria 1, 2, 3, 3b, 3c, 4c,
 * 4d, 4e and 5).
 *
 * Two witness disciplines are used and they are not interchangeable.
 * Section 2.3 rule 3: a KIND B criterion is witnessed by deregistering and
 * restoring the CHECK, never a schema keyword, because a Kind B criterion
 * offering a keyword witness has misclassified itself.
 * Criterion 3b's specificity tests are neither: they are properties of PROSE
 * in a shipped artifact, so the witness is weakening the probe text in a
 * scratch copy and seeing the assertion fail.
 *
 * NOTHING HERE MUTATES A SHIPPED FILE. `gate-registry.yaml` is a merged M3-P2
 * deliverable and is not on this phase's declaration, so every mutation
 * happens in a staged context directory that the checks engine resolves
 * against (`readContextDocument` joins the context directory to the relative
 * path). Editing the real registry and putting it back would be a red scope
 * gate, and `git checkout --` in a tree holding uncommitted work is
 * destructive with no safe narrow form.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const checklistsDir = join(repoRoot, "checklists");
const fixturesDir = join(repoRoot, "test", "fixtures");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

interface DerivedCheck {
  id: string;
  type: string;
  requiresContext: boolean;
  run: (
    instance: unknown,
    contextDirectory: string | undefined,
  ) => { violations: { pointer: string; message: string }[]; reports: string[] };
}

const checksModule = (await import(
  new URL("../src/checks.ts", import.meta.url).href
)) as {
  runChecks: (
    type: string,
    instance: unknown,
    contextDirectory: string | undefined,
  ) => { lines: string[]; failed: boolean };
  registerCheck: (check: DerivedCheck) => void;
  deregisterCheck: (id: string) => boolean;
  checklistProbeIdsUnique: DerivedCheck;
  gateProbesResolve: DerivedCheck;
  checklistFramingIdsUnique: DerivedCheck;
};

const checklistsModule = (await import(
  new URL("../src/checklists.ts", import.meta.url).href
)) as {
  shippedChecklistIds: () => string[];
  projectChecklist: (
    document: unknown,
    path: string,
    source: string,
  ) => { ok: true; value: Checklist } | { ok: false; reason: string };
  orderUnderFraming: (probes: readonly Probe[], framing: Framing) => Probe[];
  resolveChecklist: (request: {
    checklist: Checklist;
    extra?: Checklist;
    framingId?: string;
  }) => { ok: true; value: { probes: Probe[] } } | { ok: false; reasons: string[] };
  extraFramingRefusals: (canonical: Checklist, extra: Checklist) => string[];
};

interface Probe {
  id: string;
  probe: string;
  appliesTo: string;
  evidenceRequired: boolean;
  verifiesGate?: string;
  source: string;
}
interface Framing {
  id: string;
  entryPoint: string;
  ordersProbes: string[];
}
interface Checklist {
  id: string;
  appliesTo: string;
  probes: Probe[];
  framings: Framing[];
  raw: unknown;
  path: string;
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-checklists-"));
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** The shipped checklist document, decoded. Never edited in place. */
function readShipped(id: string): Record<string, unknown> {
  return yamlModule.parse(
    readFileSync(join(checklistsDir, `${id}.yaml`), "utf8"),
  ) as Record<string, unknown>;
}

function probesOf(document: Record<string, unknown>): Record<string, unknown>[] {
  return document["probes"] as Record<string, unknown>[];
}

/** The probe carrying an id, from a decoded shipped document. */
function probeById(
  document: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const found = probesOf(document).find((probe) => probe["id"] === id);
  assert.ok(found !== undefined, `no probe ${id} in the shipped document`);
  return found as Record<string, unknown>;
}

/**
 * Stage a context directory holding a COPY of `gate-registry.yaml`.
 *
 * The real one is never touched. Callers that need a mutated registry mutate
 * the copy; callers that only need the check to RUN rather than SKIP get the
 * shipped bytes.
 */
function stageContext(dir: string): string {
  copyFileSync(join(repoRoot, "gate-registry.yaml"), join(dir, "gate-registry.yaml"));
  return dir;
}

function writeYaml(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, yamlModule.stringify(value));
  return path;
}

/* ------------------------------------------------------------------ */
/* Criterion 1: every shipped checklist validates                       */
/* ------------------------------------------------------------------ */

test("every shipped checklist validates through the CLI with a context", () => {
  /* ENUMERATED BY READDIR, not by a hand-written list of five. A fixed list
     names the documents that exist today and keeps naming exactly those, so
     a checklist a later phase drops into the directory would pass by not
     being looked at, which is the defect M2-P1's own self-check had to fix
     and the reason binding convention 5 forbids counting registry rows. */
  const ids = checklistsModule.shippedChecklistIds();
  assert.ok(ids.length > 0, "the shipped checklists directory is empty");
  const failures: string[] = [];
  for (const id of ids) {
    const run = runCli([
      "validate",
      "--type",
      "checklist",
      "--context",
      repoRoot,
      join(checklistsDir, `${id}.yaml`),
    ]);
    if (run.status !== 0) {
      failures.push(`${id}: exit ${String(run.status)}\n${run.stdout}${run.stderr}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("--type auto resolves a checklist from its own kind field", () => {
  const run = runCli([
    "validate",
    "--type",
    "auto",
    "--context",
    repoRoot,
    join(checklistsDir, "clean-room.yaml"),
  ]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

/* ------------------------------------------------------------------ */
/* Criterion 1: two probes sharing an id, Kind B, both directions       */
/* ------------------------------------------------------------------ */

test("a checklist with two probes sharing an id is rejected naming the id and the check, and is accepted with the check deregistered", () => {
  const dir = scratch();
  try {
    stageContext(dir);
    /* THE DANGEROUS INSTANCE, and it is structurally plausible (section 2.3
       rule 1): well formed YAML, every required field present, two probes
       whose ids collide and whose QUESTIONS differ, which is precisely what
       `uniqueItems` cannot see because it compares whole items. `checklist
       resolve` looks a probe up by id, so the resolved list depends on which
       one the lookup reached. */
    const document = readShipped("flake-playbook");
    const probes = probesOf(document);
    probes.push({
      id: (probes[0] as Record<string, unknown>)["id"],
      probe: "A second question wearing the first probe's identity.",
      "applies-to": "judge",
      "evidence-required": true,
    });
    const file = writeYaml(dir, "duplicate.yaml", document);

    const rejected = runCli(["validate", "--type", "checklist", "--context", dir, file]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      /^INVALID #\/probes\/\d+\/id probe id flake-failure-extracted .*\(check: checklist-probe-ids-unique\)$/m,
      rejected.stdout,
    );

    /* THE OTHER DIRECTION: the SAME fixture with the CHECK deregistered.
       Removing the check rather than a schema keyword is what makes this a
       Kind B witness. */
    assert.equal(checksModule.deregisterCheck("checklist-probe-ids-unique"), true);
    const withoutCheck = checksModule.runChecks("checklist", document, dir);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));

    /* RESTORED, and red again. */
    checksModule.registerCheck(checksModule.checklistProbeIdsUnique);
    const restored = checksModule.runChecks("checklist", document, dir);
    assert.equal(restored.failed, true);
    assert.ok(
      restored.lines.some((line) => line.includes("(check: checklist-probe-ids-unique)")),
      restored.lines.join("\n"),
    );

    /* CONTROL: the unmutated document passes. Without it this check could be
       rejecting every checklist. */
    const control = runCli([
      "validate",
      "--type",
      "checklist",
      "--context",
      dir,
      join(checklistsDir, "flake-playbook.yaml"),
    ]);
    assert.equal(control.status, 0, control.stdout + control.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2: probe injection, all directions (R-054)                 */
/* ------------------------------------------------------------------ */

test("checklist resolve merges an extra probe file and prints the merged list", () => {
  const dir = scratch();
  try {
    const extra = writeYaml(dir, "extra.yaml", {
      kind: "checklist",
      id: "phase-extra",
      "applies-to": "the probes the orchestrator wrote for this phase alone",
      probes: [
        {
          id: "phase-extra-lease-renewal",
          probe: "Does the renewal path advance expiresAt strictly, and what happens at exactly equal?",
          "applies-to": "changed-code",
          "evidence-required": true,
        },
      ],
    });
    const merged = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      extra,
    ]);
    assert.equal(merged.status, 0, merged.stdout + merged.stderr);
    assert.match(merged.stdout, /phase-extra-lease-renewal/);

    /* The merged count is DERIVED from the two documents rather than pinned,
       because pinning it would be a claim about every future phase that
       appends a probe. */
    const canonical = readShipped("clean-room");
    assert.match(
      merged.stdout,
      new RegExp(`^probes ${String(probesOf(canonical).length + 1)}$`, "m"),
      merged.stdout,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an extra file reusing a canonical probe id is a collision naming both sources", () => {
  const dir = scratch();
  try {
    const extra = writeYaml(dir, "extra.yaml", {
      kind: "checklist",
      id: "phase-extra",
      "applies-to": "an extra file that silently overrides a canonical probe",
      probes: [
        {
          /* THE DANGEROUS INSTANCE the phase's hazard class names: an
             extra-probe merge that OVERRIDES a canonical probe instead of
             colliding. Last-wins here would let a per-phase file quietly
             replace the standing blast-radius probe with a weaker one. */
          id: "blast-radius-consumers",
          probe: "Did you think about consumers?",
          "applies-to": "blast-radius",
          "evidence-required": true,
        },
      ],
    });
    const run = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      extra,
    ]);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /probe id blast-radius-consumers is declared in checklists\/clean-room\.yaml and again in /);
    assert.match(run.stderr, new RegExp(extra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an extra probe that requires no evidence is refused, whether the field is absent or false", () => {
  const dir = scratch();
  try {
    /* TWO STRUCTURALLY DIFFERENT MEMBERS of one class (section 2.3 rule 6,
       CLAUDE.md's one-witness-is-not-a-class rule): the field ABSENT fails in
       the schema, and the field present and FALSE passes the schema and is
       refused by the merge. One witness would have covered whichever arm the
       implementer happened to write. */
    const absent = writeYaml(dir, "absent.yaml", {
      kind: "checklist",
      id: "phase-extra",
      "applies-to": "an extra probe with no evidence policy at all",
      probes: [
        {
          id: "phase-extra-no-policy",
          probe: "Is the retry ceiling reachable?",
          "applies-to": "changed-code",
        },
      ],
    });
    const absentRun = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      absent,
    ]);
    assert.notEqual(absentRun.status, 0);
    assert.match(absentRun.stderr, /required property evidence-required is missing/);

    const declaredFalse = writeYaml(dir, "false.yaml", {
      kind: "checklist",
      id: "phase-extra",
      "applies-to": "an extra probe that declares it needs no evidence",
      probes: [
        {
          id: "phase-extra-opinion-only",
          probe: "Is the retry ceiling reachable?",
          "applies-to": "changed-code",
          "evidence-required": false,
        },
      ],
    });
    const falseRun = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      declaredFalse,
    ]);
    assert.notEqual(falseRun.status, 0);
    assert.match(
      falseRun.stderr,
      /probe id phase-extra-opinion-only .* does not require evidence/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3: gate-probes-resolve, registry to checklist              */
/* ------------------------------------------------------------------ */

test("a registry entry naming a probe the checklist does not declare is rejected naming the gate and the probe, and passes with the check deregistered", () => {
  const dir = scratch();
  try {
    stageContext(dir);
    /* THE DANGEROUS INSTANCE is a DELETED PROBE, which is the state the join
       M3-P2 left open would have hidden: the registry declares a gate that
       nothing can ever verify, and no script on either side noticed. */
    const document = readShipped("clean-room");
    document["probes"] = probesOf(document).filter(
      (probe) => probe["id"] !== "unit-tests-for-changed-service-methods",
    );
    const file = writeYaml(dir, "deleted-probe.yaml", document);

    const rejected = runCli(["validate", "--type", "checklist", "--context", dir, file]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      /^INVALID #\/probes gate unit-tests-for-changed-service-methods in .* names probe unit-tests-for-changed-service-methods, which no probe in this checklist declares \(check: gate-probes-resolve\)$/m,
      rejected.stdout,
    );

    /* RESTORING THE PROBE returns exit 0, which is the third capture the
       criterion asks for and is what proves the red came from the deletion
       rather than from the staging. */
    const restoredFile = writeYaml(dir, "restored.yaml", readShipped("clean-room"));
    const restored = runCli([
      "validate",
      "--type",
      "checklist",
      "--context",
      dir,
      restoredFile,
    ]);
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);

    /* DEREGISTERED: the deleted-probe fixture passes. Kind B witness. */
    assert.equal(checksModule.deregisterCheck("gate-probes-resolve"), true);
    const withoutCheck = checksModule.runChecks("checklist", document, dir);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));
    checksModule.registerCheck(checksModule.gateProbesResolve);
    const reRegistered = checksModule.runChecks("checklist", document, dir);
    assert.equal(reRegistered.failed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checklist the registry does not name is not asserted against, so the rule applies where the registry points it", () => {
  /* THE VACUOUS-PASS GUARD IN THE OTHER POLARITY. `verified-by:
     clean-room-checklist` names the checklist whose id is `clean-room`, and a
     check that demanded those probes of every checklist would redden
     `plan-review.yaml` for probes that document never claimed to carry. */
  const dir = scratch();
  try {
    stageContext(dir);
    const outcome = checksModule.runChecks("checklist", readShipped("plan-review"), dir);
    assert.equal(outcome.failed, false, outcome.lines.join("\n"));
    /* And it is not vacuous on the document the registry DOES name: the same
       check on `clean-room` with a probe removed is red, which the test above
       captures. */
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a probe the registry names that carries no verifies-gate back-reference is rejected", () => {
  const dir = scratch();
  try {
    stageContext(dir);
    /* Step 1's if/then: every probe NAMED BY a registry entry must carry the
       back-reference. Without it, criterion 3c's direction cannot see the
       probe at all, so the orphan stays invisible BY CONSTRUCTION. */
    const document = readShipped("clean-room");
    delete probeById(document, "fixtures-for-changed-component-states")["verifies-gate"];
    const file = writeYaml(dir, "no-back-reference.yaml", document);
    const run = runCli(["validate", "--type", "checklist", "--context", dir, file]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(
      run.stdout,
      /carries no verifies-gate, so the checklist-to-registry direction cannot see it \(check: gate-probes-resolve\)/,
      run.stdout,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3c: checklist to registry, two structurally different      */
/* members, plus the deregistration witness                             */
/* ------------------------------------------------------------------ */

test("a gate RENAMED in the registry orphans the probe that verifies it, and restoring the name returns exit 0", () => {
  const dir = scratch();
  try {
    stageContext(dir);
    /* MEMBER ONE of the class: the gate id is RENAMED, so the probe points at
       a name that NEVER EXISTED. Mutated in the staged COPY; the merged M3-P2
       registry is never touched. */
    const registryPath = join(dir, "gate-registry.yaml");
    const original = readFileSync(registryPath, "utf8");
    writeFileSync(
      registryPath,
      original.replace(
        "  - id: unit-tests-for-changed-service-methods\n",
        "  - id: unit-tests-for-changed-service-methods-v2\n",
      ),
    );
    assert.notEqual(readFileSync(registryPath, "utf8"), original, "the rename did not apply");

    const shipped = join(checklistsDir, "clean-room.yaml");
    const rejected = runCli(["validate", "--type", "checklist", "--context", dir, shipped]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      /^INVALID #\/probes\/\d+\/verifies-gate probe unit-tests-for-changed-service-methods verifies gate unit-tests-for-changed-service-methods, which .* does not declare \(check: gate-probes-resolve\)$/m,
      rejected.stdout,
    );

    /* RESTORING THE NAME returns exit 0. */
    writeFileSync(registryPath, original);
    const restored = runCli(["validate", "--type", "checklist", "--context", dir, shipped]);
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);

    /* DEREGISTERED: the renamed-gate fixture passes. */
    writeFileSync(
      registryPath,
      original.replace(
        "  - id: unit-tests-for-changed-service-methods\n",
        "  - id: unit-tests-for-changed-service-methods-v2\n",
      ),
    );
    assert.equal(checksModule.deregisterCheck("gate-probes-resolve"), true);
    const withoutCheck = checksModule.runChecks("checklist", readShipped("clean-room"), dir);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));
    checksModule.registerCheck(checksModule.gateProbesResolve);
    const reRegistered = checksModule.runChecks("checklist", readShipped("clean-room"), dir);
    assert.equal(reRegistered.failed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a gate DELETED from the registry orphans the probe that verifies it", () => {
  const dir = scratch();
  try {
    stageContext(dir);
    /* MEMBER TWO of the class, and it is STRUCTURALLY DIFFERENT from the
       rename: the probe points at a name that USED TO EXIST, and the entry is
       gone rather than renamed, so it fails through the absence of the gate
       rather than through a mismatch with a sibling. One witness is not a
       class (CLAUDE.md), and these are the two ways a registry edit orphans a
       probe. */
    const registryPath = join(dir, "gate-registry.yaml");
    const original = readFileSync(registryPath, "utf8");
    const decoded = yamlModule.parse(original) as Record<string, unknown>;
    const gates = decoded["gates"] as Record<string, unknown>[];
    const before = gates.length;
    decoded["gates"] = gates.filter(
      (gate) => gate["id"] !== "fixtures-for-changed-component-states",
    );
    assert.equal(
      (decoded["gates"] as unknown[]).length,
      before - 1,
      "the deletion removed no gate, so this member would be vacuous",
    );
    writeFileSync(registryPath, yamlModule.stringify(decoded));

    const shipped = join(checklistsDir, "clean-room.yaml");
    const rejected = runCli(["validate", "--type", "checklist", "--context", dir, shipped]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      /probe fixtures-for-changed-component-states verifies gate fixtures-for-changed-component-states, which .* does not declare \(check: gate-probes-resolve\)/,
      rejected.stdout,
    );

    writeFileSync(registryPath, original);
    const restored = runCli(["validate", "--type", "checklist", "--context", dir, shipped]);
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gate-probes-resolve requires a context and is SKIPPED rather than passing without one", () => {
  /* A cross-document rule must never be able to pass BY NOT RUNNING, which is
     the vacuous shape the whole derived-check mechanism exists against. */
  const outcome = checksModule.runChecks("checklist", readShipped("clean-room"), undefined);
  assert.equal(outcome.failed, true);
  assert.ok(
    outcome.lines.includes("SKIPPED gate-probes-resolve no context"),
    outcome.lines.join("\n"),
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 3b: probe-text specificity, both directions                */
/* ------------------------------------------------------------------ */

/**
 * Assert a shipped probe's text carries the substrings the plan's steps
 * demand, then WEAKEN it in a decoded copy and assert the same predicate
 * fails.
 *
 * THE WEAKENING IS THE WITNESS. A specificity test that only asserted the
 * positive would be green against a probe text that happened to contain the
 * word by accident, and against a generic rewrite that kept one of the words.
 * `generic` is the phrasing the plan names as the failure: a question
 * answerable without opening anything.
 */
function assertProbeTextSpecific(
  checklistId: string,
  probeId: string,
  required: readonly (string | RegExp)[],
  generic: string,
): void {
  const document = readShipped(checklistId);
  const text = String(probeById(document, probeId)["probe"]);
  const holds = (candidate: string): boolean =>
    required.every((needle) =>
      typeof needle === "string" ? candidate.includes(needle) : needle.test(candidate),
    );
  assert.ok(
    holds(text),
    `probe ${probeId} in ${checklistId} is missing one of ${JSON.stringify(required.map(String))}: ${text}`,
  );
  assert.equal(
    holds(generic),
    false,
    `the generic phrasing for ${probeId} satisfies the predicate, so this assertion is not a witness`,
  );
}

test("the R-027 probe carries the process document's own zero illustration and the state that can no longer exit", () => {
  assertProbeTextSpecific(
    "plan-review",
    "fix-shape-state-that-cannot-exit",
    ["ZERO", "no longer be exited", "transition"],
    "Check that each fix is safe and does not leave the system in a bad state.",
  );
});

test("the R-055 correctness probes are separate entries naming negative, zero, empty and unicode", () => {
  const document = readShipped("clean-room");
  const ids = probesOf(document).map((probe) => String(probe["id"]));
  /* SEPARATE ENTRIES, not one generic row (criterion 3b). A single "check the
     edge cases" probe is answerable without opening anything, which is
     exactly the hazard class. */
  for (const id of [
    "correctness-negative-values",
    "correctness-zero",
    "correctness-empty",
    "correctness-unicode",
    "correctness-state-that-cannot-exit",
  ]) {
    assert.ok(ids.includes(id), `the R-055 probe set is missing ${id}`);
  }
  assertProbeTextSpecific(
    "clean-room",
    "correctness-negative-values",
    ["NEGATIVE"],
    "Check the edge cases.",
  );
  assertProbeTextSpecific("clean-room", "correctness-zero", ["ZERO"], "Check the edge cases.");
  assertProbeTextSpecific("clean-room", "correctness-empty", ["EMPTY"], "Check the edge cases.");
  assertProbeTextSpecific(
    "clean-room",
    "correctness-unicode",
    ["non-ASCII", "UTF-16"],
    "Check the edge cases.",
  );
});

test("the destructive-authority probe names all three of its questions and cites destructiveCommands by name", () => {
  assertProbeTextSpecific(
    "clean-room",
    "destructive-authority-declared",
    ["(1)", "(2)", "(3)", "destructiveCommands", "gates.manifest.json"],
    "Check whether any destructive command in the diff declares its authority.",
  );
  /* AND THE NAMED LIST IS REAL. A probe telling a reviewer to open a list
     that does not exist is worse than a generic one, because it reads as
     precise. */
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, "gates.manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.ok(
    Array.isArray(manifest["destructiveCommands"]),
    "gates.manifest.json declares no destructiveCommands array for the probe to cite",
  );
});

test("the R-059 and R-093 probes name a consumer-search action rather than asking a bare question", () => {
  assertProbeTextSpecific(
    "clean-room",
    "blast-radius-consumers",
    ["grep", "paste the hit list"],
    "Who else consumes what this changed?",
  );
  assertProbeTextSpecific(
    "clean-room",
    "shared-consumer-render-and-decide",
    ["Search for each such field name", "renders and decides is two fields"],
    "Does any field both render and decide?",
  );
});

test("the R-066 flake-playbook probes name the three-consecutive-reds threshold", () => {
  assertProbeTextSpecific(
    "flake-playbook",
    "flake-three-consecutive-reds",
    ["THREE CONSECUTIVE REDS", "R-067"],
    "Stop re-kicking after a few reds and fix the flake.",
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 4f: the two unexecuted-claim probes (T-006)                */
/* ------------------------------------------------------------------ */

test("the impossibility probe names the falsify-versus-BUILD distinction and cites T-006", () => {
  assertProbeTextSpecific(
    "clean-room",
    "claim-impossibility-constructed",
    ["FALSIFY", "BUILD", "T-006", "symlinkSync"],
    "Check claims are supported.",
  );
});

test("the coverage probe names construction of the covered case and cites T-006", () => {
  assertProbeTextSpecific(
    "clean-room",
    "claim-coverage-constructed",
    ["CONSTRUCTING", "T-006", "never by reading the guard"],
    "Check claims are supported.",
  );
});

test("the class-witness probe asks for two structurally different members", () => {
  assertProbeTextSpecific(
    "clean-room",
    "class-witness-has-two-members",
    ["TWO structurally different members", "M1-P6"],
    "Check that class tests are adequate.",
  );
});

/* ------------------------------------------------------------------ */
/* Criteria 4c and 4d: framings, and the fix-round ordering             */
/* ------------------------------------------------------------------ */

test("the two exercised framings both resolve and their first probes differ", () => {
  const criteria = runCli([
    "checklist",
    "resolve",
    "--checklist",
    "clean-room",
    "--framing",
    "criteria-contract",
  ]);
  const destructive = runCli([
    "checklist",
    "resolve",
    "--checklist",
    "clean-room",
    "--framing",
    "destructive-paths",
  ]);
  assert.equal(criteria.status, 0, criteria.stdout + criteria.stderr);
  assert.equal(destructive.status, 0, destructive.stdout + destructive.stderr);
  const firstOf = (stdout: string): string => {
    const match = /^1\. (\S+) /m.exec(stdout);
    assert.ok(match !== null, `no first probe line in:\n${stdout}`);
    return (match as RegExpExecArray)[1] as string;
  };
  /* T-001's second lesson made executable: a framing that reordered without
     changing the ENTRY POINT would be cosmetic, and the phase's own hazard
     class names that. */
  assert.notEqual(firstOf(criteria.stdout), firstOf(destructive.stdout));
  assert.equal(firstOf(criteria.stdout), "criteria-walked-with-evidence");
  assert.equal(firstOf(destructive.stdout), "destructive-authority-declared");
});

/* ------------------------------------------------------------------ */
/* Fix round 2, H-2: a framing id is a lookup key with no guard         */
/* ------------------------------------------------------------------ */

/* MEMBER 1 of the class, intra-file, reached through `tiphys validate`. */
test("a checklist with two framings sharing an id is rejected naming the id and the check, and is accepted with the check deregistered", () => {
  const dir = scratch();
  try {
    stageContext(dir);
    /* THE DANGEROUS INSTANCE, and it is structurally plausible: well formed
       YAML, every required field present, two framings sharing an id and
       differing in their ENTRY POINT and their scope order, which is exactly
       what `uniqueItems` cannot see because it compares whole items.
       `resolveChecklist` uses `.find()`, so which entry point a reviewer is
       handed is decided by file position and nothing says so. */
    const document = readShipped("clean-room");
    const framings = document["framings"] as Record<string, unknown>[];
    const shadowed = String((framings[0] as Record<string, unknown>)["id"]);
    framings.push({
      id: shadowed,
      "entry-point": "A second entry point wearing the first framing's identity.",
      "orders-probes": ["deviations"],
    });
    const file = writeYaml(dir, "duplicate-framing.yaml", document);

    const rejected = runCli(["validate", "--type", "checklist", "--context", dir, file]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      new RegExp(
        `^INVALID #/framings/\\d+/id framing id ${shadowed} is already declared at #/framings/\\d+/id, and checklist resolve looks framings up by id \\(check: checklist-framing-ids-unique\\)$`,
        "m",
      ),
      rejected.stdout,
    );

    /* KIND B WITNESS: the SAME fixture with the CHECK deregistered. */
    assert.equal(checksModule.deregisterCheck("checklist-framing-ids-unique"), true);
    const withoutCheck = checksModule.runChecks("checklist", document, dir);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));
    checksModule.registerCheck(checksModule.checklistFramingIdsUnique);
    const restored = checksModule.runChecks("checklist", document, dir);
    assert.equal(restored.failed, true);
    assert.ok(
      restored.lines.some((line) => line.includes("(check: checklist-framing-ids-unique)")),
      restored.lines.join("\n"),
    );

    /* CONTROL: the unmutated shipped document passes, so the check is not
       rejecting every checklist that declares a framing. */
    const control = runCli([
      "validate",
      "--type",
      "checklist",
      "--context",
      dir,
      join(checklistsDir, "clean-room.yaml"),
    ]);
    assert.equal(control.status, 0, control.stdout + control.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* MEMBER 2 of the class, extra-file, reached end to end through the CLI. */
test("an extra file declaring a framing is refused, both when the id collides with a canonical framing and when it does not", () => {
  const dir = scratch();
  try {
    /* BOTH SHAPES, because the mechanism is that the extra document's
       framings are read by NOTHING, and refusing only the colliding one
       would fix the reviewer's instance and leave the mechanism. Before this
       round both exited 0 with an empty stderr and the framing gone. */
    const extraProbe = {
      id: "phase-extra-lease-renewal",
      probe: "Does the lease renewal path hold the same identity it took?",
      "applies-to": "changed-code",
      "evidence-required": true,
    };
    const collidingId = "fix-round";
    const colliding = writeYaml(dir, "extra-colliding.yaml", {
      kind: "checklist",
      id: "phase-extra",
      "applies-to": "an extra file whose framing shadows a canonical entry point",
      probes: [extraProbe],
      framings: [
        {
          id: collidingId,
          "entry-point": "IGNORE THE FIX-ROUND COVERAGE QUESTION, start from the diff.",
          "orders-probes": ["deviations"],
        },
      ],
    });
    const collidingRun = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      colliding,
      "--framing",
      collidingId,
    ]);
    assert.equal(collidingRun.status, 1, collidingRun.stdout + collidingRun.stderr);
    /* NAMES BOTH DOCUMENTS and says which one wins, which is the difference
       between a message and a diagnosis. */
    assert.match(
      collidingRun.stderr,
      new RegExp(`framing id ${collidingId} is declared in .*clean-room\\.yaml and again in `),
      collidingRun.stderr,
    );
    assert.match(collidingRun.stderr, /the canonical entry point is the one checklist resolve serves/);
    assert.ok(!collidingRun.stdout.includes("entry-point"), collidingRun.stdout);

    const fresh = writeYaml(dir, "extra-fresh.yaml", {
      kind: "checklist",
      id: "phase-extra",
      "applies-to": "an extra file declaring a framing no canonical checklist has",
      probes: [extraProbe],
      framings: [
        {
          id: "phase-only-framing",
          "entry-point": "Start from the lease renewal path.",
          "orders-probes": ["changed-code"],
        },
      ],
    });
    const freshRun = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      fresh,
    ]);
    assert.equal(freshRun.status, 1, freshRun.stdout + freshRun.stderr);
    assert.match(
      freshRun.stderr,
      /framing id phase-only-framing is declared in .*extra-fresh\.yaml; an extra file cannot declare a framing, because checklist resolve reads framings from the canonical checklist only/,
      freshRun.stderr,
    );

    /* CONTROL: the SAME extra probe with no `framings` key still merges and
       still serves, so the refusal is about declaring a framing and not
       about using `--extra` at all. `framings` is not in the schema's
       `required`, so this is the ordinary shape of a per-phase file. */
    const clean = writeYaml(dir, "extra-clean.yaml", {
      kind: "checklist",
      id: "phase-extra",
      "applies-to": "an ordinary per-phase probe file",
      probes: [extraProbe],
    });
    const cleanRun = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      clean,
    ]);
    assert.equal(cleanRun.status, 0, cleanRun.stdout + cleanRun.stderr);
    assert.match(cleanRun.stdout, /phase-extra-lease-renewal/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a framing id absent from the checklist exits nonzero naming it and listing the declared ones", () => {
  const run = runCli([
    "checklist",
    "resolve",
    "--checklist",
    "clean-room",
    "--framing",
    "no-such-framing",
  ]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /declares no framing no-such-framing/);
  assert.match(run.stderr, /criteria-contract/);
});

test("the fix-round framing resolves fix-round-not-covered first, and moving that probe later in the file changes the resolved head", () => {
  const run = runCli([
    "checklist",
    "resolve",
    "--checklist",
    "clean-room",
    "--framing",
    "fix-round",
  ]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(
    run.stdout,
    /^1\. fix-round-not-covered /m,
    `CLAUDE.md's "the reviewer's FIRST check is item 3" is a property of the RESOLVED output:\n${run.stdout}`,
  );

  /* THE OTHER DIRECTION, and it is what makes the ordering a property of
     POSITION rather than of a comment. The probe is MOVED LATER in a decoded
     copy of the shipped file, the resolution is recomputed through the same
     resolver the command uses, and the head changes. A framing that named
     probe ids instead of scopes would pin the head wherever the probe sat,
     and this assertion would be green against exactly the artifact the hazard
     class describes. */
  const document = readShipped("clean-room");
  const probes = probesOf(document);
  const index = probes.findIndex((probe) => probe["id"] === "fix-round-not-covered");
  assert.notEqual(index, -1);
  const [moved] = probes.splice(index, 1);
  const nextFixRound = probes.findIndex((probe) => probe["applies-to"] === "fix-round");
  assert.notEqual(nextFixRound, -1, "no second fix-round probe, so the move could not change the head");
  probes.splice(nextFixRound + 1, 0, moved as Record<string, unknown>);

  const projected = checklistsModule.projectChecklist(document, "moved.yaml", "moved.yaml");
  assert.equal(projected.ok, true);
  const resolved = checklistsModule.resolveChecklist({
    checklist: (projected as { ok: true; value: Checklist }).value,
    framingId: "fix-round",
  });
  assert.equal(resolved.ok, true);
  const head = (resolved as { ok: true; value: { probes: Probe[] } }).value.probes[0] as Probe;
  assert.notEqual(
    head.id,
    "fix-round-not-covered",
    "moving the probe later left the resolved head unchanged, so the ordering is not a property of position",
  );
  assert.equal(head.id, "fix-round-mechanism-named");

  /* THE ARM NEITHER DIRECTION ABOVE REACHES, and the red-witness gate is what
     found that rather than a reader. `fix-round-not-covered` is ALSO probe 1
     in the shipped FILE, and the fix-round framing's first scope is that
     probe's scope, so file order and framing order agree head for head. Both
     assertions above are therefore satisfied by a resolver that applies no
     framing at all: measured, defanging the scope match in orderUnderFraming
     and bypassing the call entirely BOTH leave them green.

     That is the phase's own hazard class exactly ("first in the file and not
     first in the resolved output"), so the criterion needs a construction the
     file order cannot satisfy. A NON-fix-round probe is hoisted to the FRONT
     of a decoded copy, which makes the file head and the framing head
     disagree; only a resolver that orders by the framing's scopes still puts
     `fix-round-not-covered` first. */
  const hoistedDocument = readShipped("clean-room");
  const hoistedProbes = probesOf(hoistedDocument);
  const criteriaIndex = hoistedProbes.findIndex(
    (probe) => probe["id"] === "criteria-walked-with-evidence",
  );
  assert.notEqual(criteriaIndex, -1);
  const [hoisted] = hoistedProbes.splice(criteriaIndex, 1);
  hoistedProbes.unshift(hoisted as Record<string, unknown>);
  assert.notEqual(
    (hoistedProbes[0] as Record<string, unknown>)["applies-to"],
    "fix-round",
    "the hoisted probe must not be fix-round scoped, or the file and the framing would agree again and this assertion would reach nothing",
  );

  const hoistedProjected = checklistsModule.projectChecklist(
    hoistedDocument,
    "hoisted.yaml",
    "hoisted.yaml",
  );
  assert.equal(hoistedProjected.ok, true);
  const hoistedResolved = checklistsModule.resolveChecklist({
    checklist: (hoistedProjected as { ok: true; value: Checklist }).value,
    framingId: "fix-round",
  });
  assert.equal(hoistedResolved.ok, true);
  const hoistedHead = (hoistedResolved as { ok: true; value: { probes: Probe[] } }).value
    .probes[0] as Probe;
  assert.equal(
    hoistedHead.id,
    "fix-round-not-covered",
    `with a non-fix-round probe first in the file the head follows the framing only if the resolver orders by scope, and it resolved ${hoistedHead.id}`,
  );
});

test("a framing drops no probe, it only reorders", () => {
  /* A framing that FILTERED would let an entry point silently retire a probe,
     which is the same shape as an extra file silently overriding one. */
  const canonical = readShipped("clean-room");
  const declared = probesOf(canonical).map((probe) => String(probe["id"])).sort();
  for (const framing of ["criteria-contract", "destructive-paths", "fix-round"]) {
    const run = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--framing",
      framing,
    ]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const resolvedIds = [...run.stdout.matchAll(/^\d+\. (\S+) /gm)].map((match) => match[1]);
    assert.deepEqual([...resolvedIds].sort(), declared, `framing ${framing} changed the probe set`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4e: the hazard checklist is not the criteria one reworded  */
/* ------------------------------------------------------------------ */

test("the hazard checklist's probe-id set is disjoint from the clean-room checklist's", () => {
  /* T-007's failure reproduced while appearing to be fixed is a hazard
     checklist that is the criteria checklist reworded. Disjoint ids is what a
     test CAN assert; that a renamed rewording would pass is stated in the
     plan's own residue and is carried by dual-review decorrelation at M3-P9. */
  const hazard = new Set(probesOf(readShipped("hazard-review")).map((probe) => String(probe["id"])));
  const criteria = probesOf(readShipped("clean-room")).map((probe) => String(probe["id"]));
  const shared = criteria.filter((id) => hazard.has(id));
  assert.deepEqual(shared, [], `these probe ids appear in both checklists: ${shared.join(", ")}`);

  /* THE WITNESS: adding a criteria probe to the hazard file makes the same
     assertion fail naming the shared id, and removing it returns green. */
  const withShared = new Set(hazard);
  withShared.add(criteria[0] as string);
  const sharedNow = criteria.filter((id) => withShared.has(id));
  assert.deepEqual(sharedNow, [criteria[0]]);
  withShared.delete(criteria[0] as string);
  assert.deepEqual(
    criteria.filter((id) => withShared.has(id)),
    [],
  );
});

test("the hazard checklist's first probe is hazard-classes-addressed, by position", () => {
  const run = runCli(["checklist", "resolve", "--checklist", "hazard-review"]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^1\. hazard-classes-addressed /m, run.stdout);
});

test("each hazard-family probe names a construction rather than asking a bare question", () => {
  /* T-007 asks for constructions: a real mkfifo, a forced concurrency, a
     killed process mid-write, a destroy on a branch carrying committed
     unpushed work. A bare question is answerable from an armchair. */
  assertProbeTextSpecific("hazard-review", "hazard-what-can-block", ["mkfifo"], "What can block?");
  assertProbeTextSpecific(
    "hazard-review",
    "hazard-what-can-be-lost",
    ["SIGKILL"],
    "What can be lost?",
  );
  assertProbeTextSpecific(
    "hazard-review",
    "hazard-what-can-never-exit",
    ["Force the contention"],
    "What can never exit?",
  );
  assertProbeTextSpecific(
    "hazard-review",
    "hazard-what-can-destroy",
    ["COMMITTED UNPUSHED WORK"],
    "What can destroy work?",
  );
});

test("the four deferral-target probes section 2.6 names are present in the hazard checklist", () => {
  const ids = probesOf(readShipped("hazard-review")).map((probe) => String(probe["id"]));
  /* Section 2.6 forbids a deferral that names no instrument, and four hazard
     rows in other phases' maps defer here by name. A missing one turns those
     deferrals into deferrals to nothing. */
  for (const id of [
    "c2-liveness-vocabulary",
    "clause-text-matches-row",
    "honest-failure-substance",
    "contract-avoidance",
  ]) {
    assert.ok(ids.includes(id), `section 2.6 defers to ${id} and the hazard checklist has no such probe`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the fixture is a real captured harness evidence file     */
/* ------------------------------------------------------------------ */

test("the R-028a and R-056a probes name the harness evidence file as the accepted proof", () => {
  assertProbeTextSpecific(
    "clean-room",
    "test-red-without-the-fix",
    ["witness-records.json", "exitCode", "failedNamedTests"],
    "Would the test fail if the fix were reverted?",
  );
  assertProbeTextSpecific(
    "plan-review",
    "testability-claim-tested",
    ["witness-records.json", "exitCode"],
    "Are the testability claims in this plan supported?",
  );
});

test("the red-witness fixture is a real captured harness evidence file, not an authored string", () => {
  const record = JSON.parse(
    readFileSync(join(fixturesDir, "red-witness-evidence.json"), "utf8"),
  ) as Record<string, unknown>;
  const provenance = readFileSync(join(fixturesDir, "red-witness-evidence.txt"), "utf8");

  /* THE RECORDED COMMAND AND ITS EXIT CODE (criterion 5). */
  assert.match(provenance, /^command: node src\/gates\/red-witness\.ts .*--base \S+ --head \S+$/m);
  assert.match(provenance, /^exit: 0$/m);
  assert.match(provenance, /^red-witness: green \(19 witness\(es\) evaluated/m);

  /* THE PER-RUN EXIT CODES, which is what the probes tell a reviewer to
     read. A hand-written example would satisfy this alone, which is why it is
     not the only assertion. */
  const evaluations = record["evaluations"] as Record<string, unknown>[];
  assert.equal(evaluations.length, 1);
  const evaluation = evaluations[0] as Record<string, unknown>;
  const members = evaluation["members"] as Record<string, unknown>[];
  assert.ok(members.length >= 1);
  let runsSeen = 0;
  for (const member of members) {
    for (const run of member["runs"] as Record<string, unknown>[]) {
      runsSeen += 1;
      assert.equal(typeof run["exitCode"], "number");
      /* `red` AGREES WITH `exitCode` on every run, and `failedNamedTests` is
         non-empty exactly when red. An authored string gets these wrong. */
      assert.equal(run["red"], run["exitCode"] !== 0, JSON.stringify(run));
      assert.equal(
        (run["failedNamedTests"] as unknown[]).length > 0,
        run["red"],
        JSON.stringify(run),
      );
    }
  }
  assert.ok(runsSeen > 0, "the fixture records no run at all, so it witnesses nothing");

  /* ANCHORED TO THIS REPOSITORY, which is what a hand-written substitute
     could not survive. The member the harness mutated must equal the
     dangerous state declared in the real witness spec, and the verbatim
     `appliedDiff` must delete exactly that spec's `find` text. */
  const specPath = String(evaluation["specPath"]);
  const spec = JSON.parse(readFileSync(join(repoRoot, specPath), "utf8")) as Record<
    string,
    unknown
  >;
  assert.deepEqual(
    (members[0] as Record<string, unknown>)["member"],
    (spec["dangerousStates"] as unknown[])[0],
    `${specPath} has changed since this evidence was captured, so the fixture is stale and must be re-captured`,
  );
  const member0 = (members[0] as Record<string, unknown>)["member"] as Record<string, unknown>;
  const appliedDiff = String((members[0] as Record<string, unknown>)["appliedDiff"]);
  assert.match(appliedDiff, /^diff --git a\/\S+ b\/\S+$/m);
  const deleted = appliedDiff
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .map((line) => `${line.slice(1)}\n`)
    .join("");
  assert.equal(
    deleted,
    String(member0["find"]),
    "the captured diff does not delete the spec's find text, so this is not that mutation's output",
  );
  const mutatedLines = (members[0] as Record<string, unknown>)["mutatedLines"] as Record<
    string,
    unknown
  >;
  assert.equal(String(mutatedLines["file"]), String(member0["file"]));
  /* And the mutated file is a file that exists here. */
  assert.doesNotThrow(() => readFileSync(join(repoRoot, String(member0["file"])), "utf8"));
});

/* ------------------------------------------------------------------ */
/* The command's own contract                                           */
/* ------------------------------------------------------------------ */

test("checklist resolve refuses an unknown checklist id and lists the shipped ones", () => {
  const run = runCli(["checklist", "resolve", "--checklist", "no-such-checklist"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /no checklist no-such-checklist is shipped/);
  for (const id of checklistsModule.shippedChecklistIds()) {
    assert.match(run.stderr, new RegExp(id));
  }
});

test("checklist with no subcommand and with an unknown option are usage errors", () => {
  assert.equal(runCli(["checklist"]).status, 64);
  assert.equal(runCli(["checklist", "compose"]).status, 64);
  assert.equal(runCli(["checklist", "resolve"]).status, 64);
  assert.equal(runCli(["checklist", "resolve", "--nope", "x"]).status, 64);
});

test("checklist is registered in the CLI dispatch table and appears in the usage line", () => {
  const run = runCli(["no-such-subcommand"]);
  assert.equal(run.status, 64);
  assert.match(run.stderr, /checklist/);
});

test("an extra file that is not a regular file is refused rather than opened", () => {
  /* D-M3-27: the path is operator-supplied, so it is classified before it is
     opened. A directory here must be a reported refusal, never a read that
     fails somewhere deeper. */
  const dir = scratch();
  try {
    const run = runCli([
      "checklist",
      "resolve",
      "--checklist",
      "clean-room",
      "--extra",
      dir,
    ]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stderr, /tiphys checklist: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Every new behavior resolves by name                                  */
/* ------------------------------------------------------------------ */

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  /* BY NAME, NEVER BY COUNT (binding convention 5). A count is a claim about
     every future phase and is false the moment the next one appends. */
  for (const id of [
    "checklist-validates",
    "checklist-duplicate-probe-id-rejected",
    "checklist-extra-probe-merge",
    "checklist-extra-probe-collision",
    /* Criterion 2 delivers "an extra probe without evidence-required exits
       nonzero" as its own direction, and the plan's new-behaviors list never
       allocated it an id, so the arm was tested and unregistered. Registered
       in fix round 1 because the red-witness split needs a behavior for the
       witness that guards it to name. */
    "checklist-extra-probe-evidence-required",
    "gate-registry-probes-resolve",
    "checklist-framings-differ",
    "checklist-probe-text-specific",
    "checklist-destructive-authority-probe",
    "red-witness-fixture-is-captured",
    "checklist-fix-round-probe-is-first",
    "checklist-hazard-probes-disjoint-from-criteria",
    "checklist-impossibility-probe-specific",
    "checklist-coverage-probe-specific",
    "checklist-class-witness-probe",
    "checklist-probe-verifies-gate-resolves",
    "checklist-orphan-probe-detected-on-gate-rename",
    "checklist-orphan-probe-detected-on-gate-deletion",
    /* FIX ROUND 2, H-2. Two structurally different members of one class:
       an id collision inside one document, and an extra file whose framings
       were read by nothing. */
    "checklist-duplicate-framing-id-rejected",
    "checklist-extra-framing-refused",
  ]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(behaviors, id),
      `behavior ${id} is not registered`,
    );
  }
});
