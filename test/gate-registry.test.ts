/**
 * THE CANONICAL GATE REGISTRY (kernel plan M3, M3-P2; R-043, R-044, R-094).
 *
 * Ten behaviors, one test each, and the two that matter most are the two
 * revision 3 added because the M3-P1 review found this phase's own hazard had
 * no criterion behind it: M2-C-2 (a green record carries `units` greater than
 * zero) and M2-C-3 (a check that cannot reach a verdict is `error`, never
 * not-applicable) must SURVIVE the promotion, and surviving is proved by
 * running the real runner over a real registry, never by reading the code.
 *
 * WHERE THE ASSERTIONS LOOK. Every M2-C-2 assertion below reads THE RECORD
 * THE RUNNER INGESTED (`<evidence>/<gate>/result.json` and the row in
 * `summary.json`), never whether `makeGateResult` was called. The realistic
 * way a promotion drops the rule is a `--registry` path that constructs a
 * result literal of its own, and a test that asserted on the constructor
 * would be green against exactly that.
 *
 * THE DANGEROUS STATE IS A HAND-WRITTEN RECORD FILE, not a synthetic switch,
 * because gates are subprocesses that author their own records (M2-D-07) and
 * `scripts/m2-exit-test.sh --self-test` on `main` already uses this fixture
 * shape. The phase reuses it rather than inventing one.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
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
const fixturesDir = join(repoRoot, "test", "fixtures");
const registryPath = join(repoRoot, "gate-registry.yaml");
const rendererPath = join(repoRoot, "scripts", "render-agent-rules-gates.mjs");
const workflowPath = join(repoRoot, ".github", "workflows", "gates.yml");
const harnessPath = join(repoRoot, "scripts", "m2-exit-test.sh");

/* CLAUDE.md warning 4: a literal relative import of a `src` module from
   `test/` fails the build with TS2878 under rewriteRelativeImportExtensions
   across the project reference. The computed-URL dynamic import is the
   delivered pattern (test/doctor.test.ts). */
const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as unknown as {
  validateToLines: (schema: Record<string, unknown>, instance: unknown) => string[];
  decodeDocument: (
    text: string,
    label: string,
  ) => { ok: true; value: unknown } | { ok: false; reason: string };
};

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

interface RegistryGate {
  id: string;
  command?: string[];
  unitLabel: string;
  applicability: string;
  "verified-by": string;
  probe?: string;
  modes: string[];
  events?: string[];
  parameters?: string[];
  precondition?: { id: string; kind: string };
}

interface Registry {
  kind: string;
  version: number;
  preflight: { command: string[]; note: string }[];
  gates: RegistryGate[];
  destructiveCommands: string[];
}

function readRegistry(path: string): Registry {
  return yamlModule.parse(readFileSync(path, "utf8")) as Registry;
}

/** The shipped registry schema, re-read from disk so callers get a NEW object.
 *
 * `compileSchema` caches by schema OBJECT IDENTITY, so a schema mutated in
 * place keeps its old validator, and M3-P1 measured a red witness failing for
 * exactly that reason. Every arm of every Kind A witness below therefore
 * re-reads. */
function readRegistrySchema(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(repoRoot, "schemas", "gate-registry.schema.json"), "utf8"),
  ) as Record<string, unknown>;
}

function readFixture(name: string): unknown {
  const decoded = validateModule.decodeDocument(
    readFileSync(join(fixturesDir, name), "utf8"),
    name,
  );
  assert.equal(decoded.ok, true, `fixture ${name} does not decode`);
  return (decoded as { ok: true; value: unknown }).value;
}

function runCli(args: string[], options: { cwd?: string } = {}): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: options.cwd ?? repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function scratch(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `tiphys-${prefix}-`));
}

/**
 * A fixture gate that writes its own record with the status, units and
 * exit code it is told to. This is M2-D-07's shape: a gate is another program
 * and the runner is adversarial towards it. `units: 0` with `status: green`
 * is the dangerous state M2-C-2 exists to rewrite.
 */
const FIXTURE_GATE_SOURCE = `import { writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const value = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const record = {
  gate: process.env.FIXTURE_GATE_ID,
  status: process.env.FIXTURE_STATUS,
  units: Number(process.env.FIXTURE_UNITS),
  unitLabel: "fixture units",
  startedAt: "2026-08-08T00:00:00.000Z",
  endedAt: "2026-08-08T00:00:01.000Z",
  detail: "written by the fixture gate, not by makeGateResult",
  evidence: [],
};
writeFileSync(value("--result"), JSON.stringify(record, null, 2) + "\\n");
process.exit(Number(process.env.FIXTURE_EXIT));
`;

interface FixtureRegistryOptions {
  gateId: string;
  modes: string[];
  parameters?: string[];
  applicability?: string;
  /** A precondition the schema requires of every `conditional` entry. */
  preconditionPath?: string;
}

/** Write a scratch tree carrying a one-gate registry and its gate script. */
function writeFixtureRegistry(dir: string, options: FixtureRegistryOptions): string {
  writeFileSync(join(dir, "fixture-gate.mjs"), FIXTURE_GATE_SOURCE);
  const gate: Record<string, unknown> = {
    id: options.gateId,
    command: ["node", join(dir, "fixture-gate.mjs")],
    unitLabel: "fixture units",
    applicability: options.applicability ?? "required",
    "verified-by": "script",
    modes: options.modes,
    events: ["pull_request"],
  };
  if (options.parameters !== undefined) {
    gate["parameters"] = options.parameters;
  }
  if (options.preconditionPath !== undefined) {
    gate["precondition"] = {
      id: "fixture-precondition-that-is-met",
      kind: "file-exists",
      path: options.preconditionPath,
    };
  }
  const document = {
    kind: "gate-registry",
    version: 1,
    preflight: [{ command: ["npm", "ci"], note: "install exactly the lockfile" }],
    gates: [gate],
    destructiveCommands: [],
  };
  const path = join(dir, "fixture-registry.json");
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return path;
}

/**
 * A two-gate fixture registry: one gate in `selected`, one in `excluded`.
 *
 * This shape exists because the ONE-gate shape cannot witness exclusion. Every
 * mode fixture in the first round of this phase declared exactly the mode it
 * was run under, so deleting the mode filter entirely left them all green: the
 * filter had nothing to remove. A gate that MUST be dropped is the only thing
 * that reddens against that.
 */
function writeTwoModeFixtureRegistry(
  dir: string,
  selectedMode: string,
  excludedMode: string,
): string {
  writeFileSync(join(dir, "fixture-gate.mjs"), FIXTURE_GATE_SOURCE);
  const gate = (id: string, modes: string[]): Record<string, unknown> => ({
    id,
    command: ["node", join(dir, "fixture-gate.mjs")],
    unitLabel: "fixture units",
    applicability: "required",
    "verified-by": "script",
    modes,
    events: ["pull_request"],
  });
  const document = {
    kind: "gate-registry",
    version: 1,
    preflight: [{ command: ["npm", "ci"], note: "install exactly the lockfile" }],
    gates: [gate("in-this-mode", [selectedMode]), gate("in-another-mode", [excludedMode])],
    destructiveCommands: [],
  };
  const path = join(dir, "two-mode-registry.json");
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return path;
}

/** Run the real runner over a fixture registry and return what it ingested. */
function runFixtureRegistry(
  dir: string,
  path: string,
  mode: string,
  gateId: string,
  environment: Record<string, string>,
  extra: string[] = [],
): {
  status: number | null;
  stdout: string;
  stderr: string;
  row: Record<string, unknown>;
  record: Record<string, unknown> | undefined;
} {
  const evidence = join(dir, `evidence-${mode}-${String(Math.random()).slice(2)}`);
  const run = spawnSync(
    process.execPath,
    [
      cliEntry,
      "gates",
      "run",
      "--registry",
      path,
      "--mode",
      mode,
      "--evidence",
      evidence,
      ...extra,
    ],
    { encoding: "utf8", cwd: dir, env: { ...process.env, ...environment } },
  );
  const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as {
    gates: Record<string, unknown>[];
  };
  const row = summary.gates.find((entry) => entry["id"] === gateId) as Record<string, unknown>;
  let record: Record<string, unknown> | undefined;
  try {
    record = JSON.parse(
      readFileSync(join(evidence, gateId, "result.json"), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    record = undefined;
  }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, row, record };
}

/* ------------------------------------------------------------------ */
/* Criterion 1                                                          */
/* ------------------------------------------------------------------ */

test("the shipped gate-registry.yaml validates against its schema and resolves through --type auto", () => {
  const explicit = runCli(["validate", "--type", "gate-registry", "gate-registry.yaml"]);
  assert.equal(explicit.status, 0, `${explicit.stdout}${explicit.stderr}`);
  /* Step 6's second half. `resolveAutoType` reads the instance's `kind` and
     looks it up in the SAME table `--type` uses, so registering the type
     extends both in one act; asserting only the explicit arm would leave the
     `auto` half of the step unwitnessed. */
  const automatic = runCli(["validate", "--type", "auto", "gate-registry.yaml"]);
  assert.equal(automatic.status, 0, `${automatic.stdout}${automatic.stderr}`);

  /* The promotion claim, checked rather than asserted: every gate id in the
     M2-P1 manifest is still in the registry, with its command, unitLabel,
     applicability, parameters and precondition unchanged. A promotion that
     quietly dropped an entry would validate perfectly. */
  const registry = readRegistry(registryPath);
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, "gates.manifest.json"), "utf8"),
  ) as { gates: Record<string, unknown>[] };
  const byId = new Map(registry.gates.map((gate) => [gate.id, gate]));
  for (const entry of manifest.gates) {
    const promoted = byId.get(entry["id"] as string);
    assert.ok(promoted !== undefined, `manifest gate ${String(entry["id"])} is not in the registry`);
    for (const field of ["command", "unitLabel", "applicability", "parameters", "precondition"]) {
      assert.deepEqual(
        (promoted as unknown as Record<string, unknown>)[field],
        entry[field],
        `${String(entry["id"])}.${field} changed during the promotion`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2, Kind A, both directions                                 */
/* ------------------------------------------------------------------ */

test("a clean-room-checklist entry with no probe is rejected naming the entry, and the same entry with a probe is accepted", () => {
  const instance = readFixture("gate-registry-checklist-no-probe.yaml") as Registry;
  const rejected = validateModule.validateToLines(readRegistrySchema(), instance);
  assert.ok(
    rejected.some((line) => line.includes("#/gates/0/probe") && line.includes("probe")),
    `expected a probe diagnostic, saw ${JSON.stringify(rejected)}`,
  );
  /* The diagnostic contract is `INVALID <json-pointer> <message>` (DR-0013),
     so the entry is named BY POINTER rather than by interpolating its id into
     the message. Resolving the pointer is what turns that into "naming the
     entry", and it is done here rather than trusted. */
  assert.equal(instance.gates[0]?.id, "unit-tests-for-changed-service-methods");

  /* Direction two: the guarding keyword removed from a FRESH schema object,
     and the same fixture accepted. */
  const defanged = readRegistrySchema();
  const defs = defanged["$defs"] as Record<string, Record<string, unknown>>;
  const then = defs["gateProbeRule"]?.["then"] as Record<string, unknown>;
  delete then["required"];
  assert.deepEqual(validateModule.validateToLines(defanged, instance), []);

  /* And the shipped schema, re-read, still rejects: the defang was local to
     the copy above and nothing was left mutated. */
  assert.ok(validateModule.validateToLines(readRegistrySchema(), instance).length > 0);

  /* The other direction of the criterion: the same entry WITH a probe. */
  const repaired = JSON.parse(JSON.stringify(instance)) as Registry;
  (repaired.gates[0] as RegistryGate).probe = "unit-tests-for-changed-service-methods";
  assert.deepEqual(validateModule.validateToLines(readRegistrySchema(), repaired), []);
});

/* ------------------------------------------------------------------ */
/* Criterion 4, Kind A, both directions                                 */
/* ------------------------------------------------------------------ */

test("a conditional gate declaring no precondition is rejected by the schema required list, and is accepted once the precondition is restored", () => {
  const instance = readFixture("gate-registry-deploy-no-precondition.yaml") as Registry;
  const rejected = validateModule.validateToLines(readRegistrySchema(), instance);
  assert.ok(
    rejected.some((line) => line.includes("#/gates/0/precondition")),
    `expected a precondition diagnostic, saw ${JSON.stringify(rejected)}`,
  );
  assert.equal(instance.gates[0]?.id, "deploy");

  const defanged = readRegistrySchema();
  const defs = defanged["$defs"] as Record<string, Record<string, unknown>>;
  const then = defs["gate"]?.["then"] as Record<string, unknown>;
  delete then["required"];
  assert.deepEqual(validateModule.validateToLines(defanged, instance), []);
  assert.ok(validateModule.validateToLines(readRegistrySchema(), instance).length > 0);

  const repaired = JSON.parse(JSON.stringify(instance)) as Registry;
  (repaired.gates[0] as RegistryGate).precondition = {
    id: "deploy-release-verification-declared",
    kind: "file-exists",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ path: "release-verification.json" } as any),
  };
  assert.deepEqual(validateModule.validateToLines(readRegistrySchema(), repaired), []);
});

/* ------------------------------------------------------------------ */
/* Criterion 5b's first half, and T-009: the events field                */
/* ------------------------------------------------------------------ */

test("a registry entry with no events field is rejected, and every promoted entry's events match the harness bundle definitions", () => {
  const instance = readFixture("gate-registry-no-events.yaml") as Registry;
  const rejected = validateModule.validateToLines(readRegistrySchema(), instance);
  assert.ok(
    rejected.some((line) => line.includes("#/gates/0/events")),
    `expected an events diagnostic, saw ${JSON.stringify(rejected)}`,
  );

  const defanged = readRegistrySchema();
  const defs = defanged["$defs"] as Record<string, Record<string, unknown>>;
  const shape = defs["gateShape"] as Record<string, unknown>;
  shape["required"] = (shape["required"] as string[]).filter((name) => name !== "events");
  assert.deepEqual(validateModule.validateToLines(defanged, instance), []);
  assert.ok(validateModule.validateToLines(readRegistrySchema(), instance).length > 0);

  /* DERIVED, NOT ASSIGNED (step 5). The `push` arm's gate set is the gate list
     scripts/m2-exit-test.sh declares in MAIN_ONLY_GATES and turns into the
     runner's repeated `--only` flags; the `pull_request` arm passes no `--only`
     and therefore runs every entry. Reading the arm off the harness rather than
     off a memory of it is the whole point: an `events[]` assigned by judgment
     is a claim nothing checks.

     This reader used to scrape the `--only` flags out of the runner invocation.
     That worked while the six ids were written out literally there, and the
     harness now declares them ONCE in MAIN_ONLY_GATES and builds both the flags
     and the expectation's absent list from it, precisely so the set cannot exist
     in two places that drift. Reading the single declaration is therefore
     strictly closer to this test's own stated intent than scraping one of the
     things generated from it. */
  const harness = readFileSync(harnessPath, "utf8");
  const mainBundle = /^MAIN_ONLY_GATES="([^"]+)"/m.exec(harness);
  assert.ok(
    mainBundle !== null,
    "scripts/m2-exit-test.sh no longer declares MAIN_ONLY_GATES, so the push arm's gate set " +
      "cannot be derived from the harness and this test would be asserting over a memory of it",
  );
  const pushGates = new Set((mainBundle[1] as string).split(/\s+/).filter((id) => id !== ""));
  assert.ok(pushGates.size >= 6, `expected the six main-bundle gates, derived ${[...pushGates].join(", ")}`);

  const registry = readRegistry(registryPath);
  const manifestIds = new Set(
    (
      JSON.parse(readFileSync(join(repoRoot, "gates.manifest.json"), "utf8")) as {
        gates: { id: string }[];
      }
    ).gates.map((entry) => entry.id),
  );
  for (const gate of registry.gates) {
    assert.ok(Array.isArray(gate.events) && gate.events.length > 0, `${gate.id} declares no events`);
    assert.ok(gate.events.includes("pull_request"), `${gate.id} is not evaluated on any pull request`);
    if (manifestIds.has(gate.id)) {
      assert.equal(
        gate.events.includes("push"),
        pushGates.has(gate.id),
        `${gate.id}'s push arm does not match the harness main bundle`,
      );
    }
  }
  /* The drift check is not an M2 manifest gate, so the loop above cannot
     reach it, and it is the one entry T-009 is actually about: CLAUDE.md
     drift is a property of `main`, not of a pull request. */
  const drift = registry.gates.find((gate) => gate.id === "agent-rules-drift");
  assert.deepEqual(drift?.events, ["pull_request", "push"]);
});

/* ------------------------------------------------------------------ */
/* Criterion 3: SC-011 over the real runner's real output               */
/* ------------------------------------------------------------------ */

test("a registry run reports zero gates green with an unmet precondition, read from the runner's own summary", () => {
  /* The capture is a REAL run of the M2 runner stored verbatim under
     test/fixtures/ (section 2.3 rules 3 and 4 forbid a hand-written
     stand-in), plus a live run below so the assertion is not only about a
     snapshot. */
  const captured = JSON.parse(
    readFileSync(join(fixturesDir, "gate-runner-capture.summary.json"), "utf8"),
  ) as { gates: { id: string; status: string; units: number }[] };
  const evidenceRoot = join(fixturesDir, "gate-runner-capture.deploy-result.json");
  const deploy = JSON.parse(readFileSync(evidenceRoot, "utf8")) as {
    status: string;
    units: number;
    precondition: { id: string; met: boolean; reason: string };
  };
  assert.equal(deploy.status, "not-applicable");
  assert.equal(deploy.units, 0);
  assert.equal(deploy.precondition.met, false);
  assert.match(deploy.precondition.id, /STRUCTURAL/);

  const dir = scratch("registry-sc011");
  try {
    /* A one-gate registry whose precondition CANNOT be met, run through the
       real runner. The gate script would report green with units 1 if it were
       ever spawned, so a promotion that lost the precondition semantics would
       show up here as a green rather than as an absence. */
    writeFileSync(join(dir, "fixture-gate.mjs"), FIXTURE_GATE_SOURCE);
    const document = {
      kind: "gate-registry",
      version: 1,
      preflight: [{ command: ["npm", "ci"], note: "install exactly the lockfile" }],
      gates: [
        {
          id: "unmet",
          command: ["node", join(dir, "fixture-gate.mjs")],
          unitLabel: "fixture units",
          applicability: "conditional",
          "verified-by": "script",
          modes: ["full"],
          events: ["pull_request"],
          precondition: {
            id: "a-file-that-is-not-there",
            kind: "file-exists",
            path: join(dir, "absent.json"),
          },
        },
      ],
      destructiveCommands: [],
    };
    const path = join(dir, "registry.json");
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
    const outcome = runFixtureRegistry(dir, path, "full", "unmet", {
      FIXTURE_GATE_ID: "unmet",
      FIXTURE_STATUS: "green",
      FIXTURE_UNITS: "1",
      FIXTURE_EXIT: "0",
    });
    assert.equal(outcome.row["status"], "not-applicable");
    assert.equal(outcome.row["units"], 0);
    assert.equal(
      (outcome.record?.["precondition"] as { met: boolean }).met,
      false,
      "the not-applicable record does not carry an evaluated, unmet precondition",
    );
    /* The property, stated as the criterion states it: zero gates green with
       an unmet precondition, across both the captured run and this one. */
    const greenWithUnmet = [...captured.gates, outcome.row as { id: string; status: string }].filter(
      (row) => row.status === "green" && row.id === "unmet",
    );
    assert.deepEqual(greenWithUnmet, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3b: M2-C-2 survives the promotion. TWO MEMBERS.            */
/* ------------------------------------------------------------------ */

test("a registry gate writing green with zero units is rewritten to error and vacuous under --mode full and under a non-full mode", () => {
  /* SECTION 2.3 RULE 6, applied where the criterion names its two members:
     the two SELECTION PATHS are where an extension can diverge, so both are
     exercised. Member one is a gate selected by `--mode full`; member two is
     a gate selected under a NON-full mode. A `--registry` implementation that
     built its own result literal on one path and reused the M2 ingest on the
     other would be green on one member and red on the other. */
  for (const mode of ["full", "local-only"]) {
    const dir = scratch(`registry-vacuous-${mode}`);
    try {
      const path = writeFixtureRegistry(dir, { gateId: "vacuous", modes: [mode] });

      const dangerous = runFixtureRegistry(dir, path, mode, "vacuous", {
        FIXTURE_GATE_ID: "vacuous",
        FIXTURE_STATUS: "green",
        FIXTURE_UNITS: "0",
        FIXTURE_EXIT: "0",
      });
      /* ANCHORED TO REAL CAPTURED OUTPUT (section 2.3 rule 4, red-witness
         rule (f)). `witness/captures/gate-registry-vacuous-ingest.json` and
         `gate-registry-vacuous-run.txt` are a verbatim capture of this same
         dangerous state run through the real runner on 2026-08-08, stored
         before this assertion was written. The live record must reproduce the
         captured one field for field apart from the run's own timestamps, so
         the sentence asserted below is the runner's, not one chosen by hand
         to match the implementation. */
      const capturedIngest = JSON.parse(
        readFileSync(join(repoRoot, "witness", "captures", "gate-registry-vacuous-ingest.json"), "utf8"),
      ) as Record<string, unknown>;
      const capturedRun = readFileSync(
        join(repoRoot, "witness", "captures", "gate-registry-vacuous-run.txt"),
        "utf8",
      );
      assert.match(capturedRun, /error 1 vacuous 1/);
      assert.equal(dangerous.record?.["detail"], capturedIngest["detail"]);
      assert.equal(dangerous.record?.["status"], capturedIngest["status"]);
      assert.equal(dangerous.record?.["vacuous"], capturedIngest["vacuous"]);
      /* On the RECORD THE RUNNER INGESTED, never on the constructor. */
      assert.equal(dangerous.record?.["status"], "error", `mode ${mode}`);
      assert.equal(dangerous.record?.["vacuous"], true, `mode ${mode}`);
      assert.equal(dangerous.row["status"], "error", `mode ${mode}`);
      assert.equal(dangerous.row["vacuous"], true, `mode ${mode}`);
      assert.notEqual(dangerous.status, 0, `mode ${mode}: the bundle did not fail`);

      /* Both directions: the same fixture with units 1 is green and passes. */
      const benign = runFixtureRegistry(dir, path, mode, "vacuous", {
        FIXTURE_GATE_ID: "vacuous",
        FIXTURE_STATUS: "green",
        FIXTURE_UNITS: "1",
        FIXTURE_EXIT: "0",
      });
      assert.equal(benign.record?.["status"], "green", `mode ${mode}`);
      assert.equal(benign.record?.["vacuous"], undefined, `mode ${mode}`);
      assert.equal(benign.status, 0, `mode ${mode}: ${benign.stdout}${benign.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3c: M2-C-3 survives the promotion                          */
/* ------------------------------------------------------------------ */

test("a registry gate declaring a parameter that is not supplied reports error naming the flag, never not-applicable, and reports green once it is supplied", () => {
  /* REAL CAPTURED OUTPUT (section 2.3 rule 4). The refusal text asserted
     against is taken from a capture of the DELIVERED gates run through the
     real runner against the real registry, not written by hand to match the
     implementation. */
  const captured = readFileSync(
    join(fixturesDir, "gate-runner-capture.missing-parameter.json"),
    "utf8",
  );
  const capturedRecord = JSON.parse(captured) as {
    gate: string;
    status: string;
    units: number;
    detail: string;
  };
  assert.equal(capturedRecord.status, "error");
  assert.equal(capturedRecord.units, 0);
  assert.match(capturedRecord.detail, /--base/);

  const dir = scratch("registry-missing-parameter");
  try {
    const path = writeFixtureRegistry(dir, {
      gateId: "needs-base",
      modes: ["full"],
      parameters: ["base"],
      /* CONDITIONAL, deliberately. A `required` gate reporting not-applicable
         already fails the run for a different reason (exit 20), so the
         difference this criterion is about, "the precondition was evaluated
         and found unmet" versus "the gate could not reach a verdict", would
         be invisible in the exit code. On a conditional gate a
         not-applicable is lawful and green is lawful, so `error` is the only
         status that can only come from M2-C-3. */
      applicability: "conditional",
      /* A precondition that IS met, so the only reason this gate could report
         not-applicable is the missing flag. Without it the two states the
         criterion exists to separate would be confounded. */
      preconditionPath: join(dir, "present.txt"),
    });
    writeFileSync(join(dir, "present.txt"), "the precondition target exists\n");
    const environment = {
      FIXTURE_GATE_ID: "needs-base",
      FIXTURE_STATUS: "green",
      FIXTURE_UNITS: "3",
      FIXTURE_EXIT: "0",
    };
    const withoutBase = runFixtureRegistry(dir, path, "full", "needs-base", environment);
    assert.equal(withoutBase.record?.["status"], "error");
    assert.notEqual(withoutBase.record?.["status"], "not-applicable");
    assert.match(String(withoutBase.record?.["detail"]), /--base/);
    assert.equal(withoutBase.record?.["units"], 0);
    /* The delivered refusal and the fixture's refusal are the same sentence,
       which is what makes the fixture a statement about the real runner. */
    assert.equal(
      String(withoutBase.record?.["detail"]).replace("needs-base", capturedRecord.gate),
      capturedRecord.detail,
    );

    const withBase = runFixtureRegistry(dir, path, "full", "needs-base", environment, [
      "--base",
      "HEAD",
    ]);
    assert.equal(withBase.record?.["status"], "green");
    assert.equal(withBase.record?.["units"], 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3, DR-0018's diff-scoped row                               */
/* ------------------------------------------------------------------ */

test("a diff-scoped registry gate whose trigger is untouched reports not-applicable carrying its evaluated precondition", () => {
  /* DR-0018 point 2. A required diff-scoped gate on a head that does not
     touch its trigger is legitimately not-applicable, and the thing that
     distinguishes it from a silently skipped gate is the RECORDED
     EVALUATION. The captured `red-witness` record is the real one from the
     run stored under test/fixtures/. */
  const record = JSON.parse(
    readFileSync(join(fixturesDir, "gate-runner-capture.red-witness-result.json"), "utf8"),
  ) as {
    gate: string;
    status: string;
    units: number;
    detail: string;
    precondition: { id: string; met: boolean; reason: string };
  };
  assert.equal(record.gate, "red-witness");
  assert.equal(record.status, "not-applicable");
  assert.equal(record.precondition.met, false);
  assert.notEqual(record.precondition.id, "");
  assert.notEqual(record.precondition.reason, "");
  assert.match(record.detail, /evaluated and unmet/);

  /* Live, through the promoted registry: the same gate, selected from
     gate-registry.yaml, with base equal to head so the diff is empty. */
  const dir = scratch("registry-diffscoped");
  try {
    const evidence = join(dir, "evidence");
    const run = spawnSync(
      process.execPath,
      [
        cliEntry,
        "gates",
        "run",
        "--registry",
        "gate-registry.yaml",
        "--mode",
        "full",
        "--only",
        "red-witness",
        "--evidence",
        evidence,
        "--base",
        "HEAD",
        "--head",
        "HEAD",
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    const live = JSON.parse(
      readFileSync(join(evidence, "red-witness", "result.json"), "utf8"),
    ) as { status: string; precondition: { met: boolean; id: string; reason: string } };
    assert.equal(live.status, "not-applicable");
    assert.equal(live.precondition.met, false);
    assert.equal(live.precondition.id, record.precondition.id);
    /* DR-0018's other half: a legitimately not-applicable required gate is
       NOT a pass. Selected alone, this bundle reached no verdict at all, so
       the runner's own aggregate precedence reports the stronger fact first,
       "a bundle that examined nothing is not a report about any one gate"
       (M2-C-2 at the aggregate level), and exits 21 rather than 20. Either
       way the run fails, which is why the harness carries green-path evidence
       for the diff-scoped gates separately instead of accepting an N/A. */
    assert.notEqual(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /no applicable gate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the drift check                                         */
/* ------------------------------------------------------------------ */

/** Copy the four files the renderer needs into a scratch tree. */
function stageRendererTree(dir: string): { registry: string; rules: string } {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "src", "gates"), { recursive: true });
  const registry = join(dir, "gate-registry.yaml");
  const rules = join(dir, "CLAUDE.md");
  writeFileSync(registry, readFileSync(registryPath, "utf8"));
  writeFileSync(rules, readFileSync(join(repoRoot, "CLAUDE.md"), "utf8"));
  return { registry, rules };
}

function runRenderer(args: string[], cwd: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const run = spawnSync(process.execPath, [rendererPath, ...args], {
    encoding: "utf8",
    cwd,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** Append a gate to a registry file. The realistic drift: a new gate lands. */
function addGateToRegistry(path: string, id: string): void {
  const text = readFileSync(path, "utf8");
  const addition = `
  - id: ${id}
    command: [node, scripts/${id}.mjs]
    unitLabel: ${id} things checked
    applicability: required
    verified-by: script
    modes: [full]
    events: [pull_request]
`;
  const marker = "\ndestructiveCommands:";
  writeFileSync(path, text.replace(marker, `${addition}${marker}`));
}

test("adding a gate to the registry without re-rendering makes --check exit nonzero naming the added gate, and re-rendering returns exit 0", () => {
  const dir = scratch("drift");
  try {
    const staged = stageRendererTree(dir);
    const clean = runRenderer(["--check", "--registry", staged.registry, "--agent-rules", staged.rules], dir);
    assert.equal(clean.status, 0, `${clean.stdout}${clean.stderr}`);

    addGateToRegistry(staged.registry, "a-newly-added-gate");
    const drifted = runRenderer(
      ["--check", "--registry", staged.registry, "--agent-rules", staged.rules],
      dir,
    );
    assert.notEqual(drifted.status, 0, "an unrendered new gate did not redden --check");
    assert.match(
      `${drifted.stdout}${drifted.stderr}`,
      /a-newly-added-gate/,
      "the drift report does not NAME the added gate",
    );

    const rewritten = runRenderer(
      ["--write", "--registry", staged.registry, "--agent-rules", staged.rules],
      dir,
    );
    assert.equal(rewritten.status, 0, `${rewritten.stdout}${rewritten.stderr}`);
    const rechecked = runRenderer(
      ["--check", "--registry", staged.registry, "--agent-rules", staged.rules],
      dir,
    );
    assert.equal(rechecked.status, 0, `${rechecked.stdout}${rechecked.stderr}`);

    /* THE RENDERER DERIVES FROM THE REGISTRY, IT DOES NOT READ THE BLOCK.
       A renderer that read CLAUDE.md's block and called it the rendering
       would pass every assertion above, because the two would agree by
       construction. Emptying the block and re-checking distinguishes them:
       a deriving renderer reddens, a block-reading one stays green. */
    const rules = readFileSync(staged.rules, "utf8");
    const begin = rules.indexOf("<!-- BEGIN GENERATED GATE LIST");
    const end = rules.indexOf("<!-- END GENERATED GATE LIST -->");
    const beginLineEnd = rules.indexOf("\n", begin);
    writeFileSync(
      staged.rules,
      rules.slice(0, beginLineEnd + 1) + "\n" + rules.slice(end),
    );
    const emptied = runRenderer(
      ["--check", "--registry", staged.registry, "--agent-rules", staged.rules],
      dir,
    );
    assert.notEqual(emptied.status, 0, "an emptied block did not redden: the renderer reads the block");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5b: the check is a BEHAVIOUR, and its event arm is asserted */
/* ------------------------------------------------------------------ */

interface WorkflowStep {
  name?: string;
  run?: string;
  if?: string;
}

/** The drift step, located in a workflow document by what it RUNS. */
function findDriftStep(workflowText: string): {
  step: WorkflowStep;
  jobNames: string[];
  hasMatrix: boolean;
} {
  const document = yamlModule.parse(workflowText) as {
    jobs: Record<string, { steps: WorkflowStep[]; strategy?: { matrix?: unknown } }>;
  };
  const jobNames = Object.keys(document.jobs);
  const steps = Object.values(document.jobs).flatMap((job) => job.steps ?? []);
  const matching = steps.filter(
    (step) => typeof step.run === "string" && step.run.includes("render-agent-rules-gates.mjs"),
  );
  assert.equal(matching.length, 1, `expected exactly one drift step, found ${matching.length}`);
  const hasMatrix = Object.values(document.jobs).some(
    (job) => job.strategy?.matrix !== undefined,
  );
  return { step: matching[0] as WorkflowStep, jobNames, hasMatrix };
}

/**
 * Execute a workflow step's `run` text and report the exit code, plus whether
 * the step would run on both CI events. This is the whole of criterion 5b:
 * a step is a BEHAVIOUR, and a test that asserted its TEXT would catch
 * deletion and miss defanging, which M1-P6 confirmed six times.
 */
function evaluateDriftStep(
  workflowText: string,
  cwd: string,
  registry: string,
  rules: string,
): { bothArms: boolean; exitCode: number | null } {
  const { step } = findDriftStep(workflowText);
  const bothArms = step.if === undefined;
  const script = (step.run as string)
    .replace(
      "scripts/render-agent-rules-gates.mjs",
      `${rendererPath} --registry ${registry} --agent-rules ${rules}`,
    );
  const run = spawnSync("bash", ["-c", script], { encoding: "utf8", cwd });
  return { bothArms, exitCode: run.status };
}

test("the drift step extracted from the gates workflow is executed and its exit code observed on a drifted and a re-rendered registry", () => {
  const workflow = readFileSync(workflowPath, "utf8");

  /* DR-0017 and DR-0004, asserted here because this phase edits the file the
     required status context comes from: ONE job named `gates`, no matrix. A
     matrix renames the published context to `gates (26)` and detaches branch
     protection. */
  const located = findDriftStep(workflow);
  assert.deepEqual(located.jobNames, ["gates"]);
  assert.equal(located.hasMatrix, false);

  const dir = scratch("drift-wired");
  try {
    const staged = stageRendererTree(dir);

    const clean = evaluateDriftStep(workflow, dir, staged.registry, staged.rules);
    assert.equal(clean.exitCode, 0, "the extracted step failed against a re-rendered registry");
    /* T-009: BOTH ARMS. CLAUDE.md drift is a property of `main`, not of a
       pull request, so a step that ran on one event would let a direct push,
       a rebase or a merge-queue-side edit drift the file with nothing red. */
    assert.equal(clean.bothArms, true, "the drift step carries an `if:` and runs on one arm only");

    addGateToRegistry(staged.registry, "a-gate-the-block-does-not-carry");
    const drifted = evaluateDriftStep(workflow, dir, staged.registry, staged.rules);
    assert.notEqual(drifted.exitCode, 0, "the extracted step passed against a drifted registry");

    /* TWO STRUCTURALLY DIFFERENT DEFANGS (section 2.3 rule 6), each applied
       to the workflow TEXT and each run through the same evaluator. A test
       whose condition cannot tell the live workflow from a defanged one is
       green and worthless, so the discrimination is demonstrated rather than
       argued. */
    const defangedByOrTrue = workflow.replace(
      "run: node scripts/render-agent-rules-gates.mjs --check",
      "run: node scripts/render-agent-rules-gates.mjs --check || true",
    );
    assert.notEqual(defangedByOrTrue, workflow, "the `|| true` defang did not apply");
    const orTrue = evaluateDriftStep(defangedByOrTrue, dir, staged.registry, staged.rules);
    assert.equal(
      orTrue.exitCode,
      0,
      "the `|| true` defang did not survive as exit 0, so this evaluator cannot detect it",
    );

    const defangedByEventNarrowing = workflow.replace(
      "      - name: Agent-rules gate-list drift",
      "      - if: github.event_name == 'pull_request'\n        name: Agent-rules gate-list drift",
    );
    assert.notEqual(defangedByEventNarrowing, workflow, "the event-narrowing defang did not apply");
    const narrowed = evaluateDriftStep(
      defangedByEventNarrowing,
      dir,
      staged.registry,
      staged.rules,
    );
    assert.equal(
      narrowed.bothArms,
      false,
      "the event-narrowing defang was not detected: this evaluator cannot see an `if:`",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The exclusion witness for `modes[]`, the phase's headline addition   */
/* ------------------------------------------------------------------ */

test("a gate declaring only another mode is EXCLUDED from the run, with no row, no record and no evidence directory", () => {
  /* THE GAP THIS CLOSES, recorded because it is the round's most consequential
     finding. Every mode fixture in the first round declared `modes: [mode]`
     and was run under that same mode, so deleting the filter outright
     (`inMode = document.gates`) left the WHOLE suite green: no test had an
     entry that had to be excluded. `modes[]` made live is this phase's
     headline addition and M3-P3 consumes it, so an unwitnessed selection rule
     is a rule M3-P3 would build on top of nothing.

     Asserted on three independent traces of exclusion, not one, because a
     summary row is only the cheapest of them: the row, the ingested record on
     disk, and the gate's own evidence directory. A filter that dropped the row
     while still spawning the gate would pass the first and fail the other
     two. */
  for (const [selected, excluded] of [
    ["full", "local-only"],
    ["local-only", "full"],
  ]) {
    const dir = scratch(`registry-exclusion-${selected}`);
    try {
      const path = writeTwoModeFixtureRegistry(dir, selected as string, excluded as string);
      const evidence = join(dir, "evidence");
      const run = spawnSync(
        process.execPath,
        [cliEntry, "gates", "run", "--registry", path, "--mode", selected as string,
          "--evidence", evidence],
        {
          encoding: "utf8",
          cwd: dir,
          env: {
            ...process.env,
            FIXTURE_GATE_ID: "in-this-mode",
            FIXTURE_STATUS: "green",
            FIXTURE_UNITS: "2",
            FIXTURE_EXIT: "0",
          },
        },
      );
      const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as {
        gates: { id: string }[];
        counts: Record<string, number>;
      };
      const ids = summary.gates.map((row) => row.id);
      assert.deepEqual(ids, ["in-this-mode"], `mode ${selected} selected ${ids.join(", ")}`);
      assert.equal(summary.counts["declared"], 1);
      assert.equal(
        existsSync(join(evidence, "in-another-mode")),
        false,
        "the excluded gate was given an evidence directory, so it was reached",
      );
      assert.equal(
        existsSync(join(evidence, "in-another-mode", "result.json")),
        false,
        "the excluded gate has an ingested record, so it was run",
      );
      assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/* ------------------------------------------------------------------ */
/* R-094 as DELIVERED: the divergence between CI and the registry       */
/* ------------------------------------------------------------------ */

/**
 * Registry `script` gates that are NOT in `gates.manifest.json`, each with the
 * reason it is absent. This is a DECLARED DIVERGENCE, not a count: a new entry
 * here is a deliberate act with a written reason, and a registry-only gate
 * added WITHOUT one reddens the test below.
 */
const REGISTRY_ONLY_SCRIPT_GATES: ReadonlyMap<string, string> = new Map([
  [
    "agent-rules-drift",
    "M3-P2 declares it per D-M3-34, but CI invokes the runner with --manifest, " +
      "so what executes it in CI is a step in .github/workflows/gates.yml. " +
      "Promoting it to gates.manifest.json no longer requires an expectation row " +
      "in scripts/m2-exit-test.sh: that script derives its expected gate set " +
      "from the manifest, and a declared gate with no table row is asserted " +
      "required-green, which is the correct expectation for this one. What is " +
      "left is a scope decision about what CI runs, tracked with the " +
      "orchestrator as the open half of R-094, not a blocker in the harness.",
  ],
]);

test("every registry gate CI does not run is a declared divergence, and the workflow step that covers the one instance is present on both arms", () => {
  /* THE REVERSE DIRECTION. The parity assertion in criterion 1 is manifest
     SUBSET registry: it stops the registry LOSING a gate. It says nothing
     about a gate that exists only in the registry, and such a gate does not
     run in CI at all, because scripts/m2-exit-test.sh passes
     --manifest gates.manifest.json on both arms. That is precisely what
     happened to agent-rules-drift, and nothing was red. */
  const registry = readRegistry(registryPath);
  const manifestIds = new Set(
    (
      JSON.parse(readFileSync(join(repoRoot, "gates.manifest.json"), "utf8")) as {
        gates: { id: string }[];
      }
    ).gates.map((entry) => entry.id),
  );
  const registryOnly = registry.gates
    .filter((gate) => gate["verified-by"] === "script" && !manifestIds.has(gate.id))
    .map((gate) => gate.id)
    .sort();
  assert.deepEqual(
    registryOnly,
    [...REGISTRY_ONLY_SCRIPT_GATES.keys()].sort(),
    "a script gate is declared in gate-registry.yaml and absent from gates.manifest.json " +
      "with no recorded reason; CI runs the MANIFEST, so that gate does not run in CI",
  );

  /* THE PROSE IS CHECKED, NOT TRUSTED. Both gate-registry.yaml's header and
     CLAUDE.md's gate section state, in the present tense, that CI reads the
     manifest and not the registry. A document asserting a present-tense fact
     that nothing checks is tuition T-006, and it is what this round is for. */
  const harness = readFileSync(harnessPath, "utf8");
  const workflow = readFileSync(workflowPath, "utf8");
  assert.equal(harness.includes("--registry"), false, "scripts/m2-exit-test.sh now uses --registry");
  assert.equal(
    workflow.includes("gates run --registry"),
    false,
    ".github/workflows/gates.yml now makes a registry run",
  );
  assert.ok(harness.includes("--manifest \"${MANIFEST}\""), "the harness no longer passes --manifest");

  /* And the one divergence is covered on BOTH arms by a step with no `if:`. */
  const { step } = findDriftStep(workflow);
  assert.equal(step.if, undefined);
  assert.match(step.run as string, /render-agent-rules-gates\.mjs --check/);
});

test("a clean-room-checklist entry is reported as declared and not executed, and produces no record, no evidence and no status", () => {
  /* The corrected `$comment` on the two D-11 entries says the runner does not
     execute them and does not evaluate their precondition. The first round
     said the opposite, in the document that DEFINES the gate, and nothing
     checked either statement. This is that check. */
  const dir = scratch("registry-checklist");
  try {
    const evidence = join(dir, "evidence");
    const run = spawnSync(
      process.execPath,
      [cliEntry, "gates", "run", "--registry", "gate-registry.yaml", "--mode", "full",
        "--only", "manifest-self-check", "--evidence", evidence],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as {
      gates: { id: string }[];
      declaredByChecklist: { id: string; probe: string }[];
    };
    const registry = readRegistry(registryPath);
    const checklistIds = registry.gates
      .filter((gate) => gate["verified-by"] === "clean-room-checklist")
      .map((gate) => gate.id)
      .sort();
    assert.ok(checklistIds.length >= 2, "the two D-11 entries are missing from the registry");
    assert.deepEqual(
      summary.declaredByChecklist.map((entry) => entry.id).sort(),
      checklistIds,
      "the run does not account for every clean-room-checklist entry the mode selects",
    );
    for (const id of checklistIds) {
      assert.equal(
        summary.gates.some((row) => row.id === id),
        false,
        `${id} has a summary row, so it was executed`,
      );
      assert.equal(existsSync(join(evidence, id)), false, `${id} has an evidence directory`);
      assert.equal(
        existsSync(join(evidence, id, "result.json")),
        false,
        `${id} has a record, so a status was produced for it`,
      );
      /* And each carries its probe id, which is what M3-P7 resolves. */
      assert.match(
        String(summary.declaredByChecklist.find((entry) => entry.id === id)?.probe),
        /^[a-z0-9][a-z0-9-]*$/,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
