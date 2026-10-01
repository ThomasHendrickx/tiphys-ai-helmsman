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
 * the M2 exit-test harness's `--self-test` used this fixture shape (that
 * harness was deleted by M6-P3). The phase reused it rather than inventing one.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
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
const fixturesDir = join(repoRoot, "test", "fixtures");
const registryPath = join(repoRoot, "gate-registry.yaml");
const workflowPath = join(repoRoot, ".github", "workflows", "gates.yml");
const reviewRecordSchemaPath = join(repoRoot, "schemas", "review-record.schema.json");

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
  prevents?: string;
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
    prevents: "a fixture failure",
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
    prevents: "a fixture failure",
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

test("a registry entry with no events field is rejected, and every shipped entry declares at least one event", () => {
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

  const registry = readRegistry(registryPath);
  for (const gate of registry.gates) {
    assert.ok(Array.isArray(gate.events) && gate.events.length > 0, `${gate.id} declares no events`);
  }
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
          prevents: "a fixture failure",
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

test("a clean-room-checklist entry is reported as declared and not executed, and produces no record, no evidence and no status", () => {
  /* The corrected `$comment` on the two D-11 entries says the runner does not
     execute them and does not evaluate their precondition. The first round
     said the opposite, in the document that DEFINES the gate, and nothing
     checked either statement. This is that check. */
  const dir = scratch("registry-checklist");
  try {
    /* A FIXTURE REGISTRY: one script gate that runs, and two checklist
       entries shaped like the D-11 pair (M6-P3 removed them from this
       repository's registry; the runner still supports the shape). */
    const fixturePath = writeFixtureRegistry(dir, { gateId: "runs", modes: ["full"] });
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Registry;
    for (const id of ["checklist-probe-one", "checklist-probe-two"]) {
      fixture.gates.push({
        id,
        unitLabel: "items checked",
        applicability: "conditional",
        prevents: "a fixture failure",
        "verified-by": "clean-room-checklist",
        probe: id,
        modes: ["full"],
        events: ["pull_request"],
        precondition: { id: "clean-room-checklist-present", kind: "file-exists", path: "checklists/clean-room.yaml" } as { id: string; kind: string },
      });
    }
    writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
    const evidence = join(dir, "evidence");
    const run = spawnSync(
      process.execPath,
      [cliEntry, "gates", "run", "--registry", fixturePath, "--mode", "full",
        "--only", "runs", "--evidence", evidence],
      {
        encoding: "utf8",
        cwd: dir,
        env: { ...process.env, FIXTURE_GATE_ID: "runs", FIXTURE_STATUS: "green", FIXTURE_UNITS: "1", FIXTURE_EXIT: "0" },
      },
    );
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as {
      gates: { id: string }[];
      declaredByChecklist: { id: string; probe: string }[];
    };
    const registry = readRegistry(fixturePath);
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

/* ------------------------------------------------------------------ */
/* M4-P14: the gate class vocabulary (DR-0029 part 2a) and R-041        */
/* ------------------------------------------------------------------ */

/**
 * THE SUBJECT IS THE CURRENT REPOSITORY, which is the strongest available
 * form of criterion 1's red witness and the control hazard H-A asks for.
 * Every declaration under `delivery/plan/phase-declarations/` written before
 * this phase lacks `gateClasses`, so the dangerous state is not a state
 * someone has to construct: it is what is on `main`. These tests copy REAL
 * declarations into a scratch tree and run the shipped gate against them, so
 * the checker is exercised against inputs it did not author.
 *
 * WHY THE SCRATCH TREE IS THE WORKING DIRECTORY and every path handed to the
 * gate is relative to it: the gate prints the declaration path in its detail,
 * and an absolute mkdtemp path would make the captures under
 * `witness/captures/` unreproducible, which is the difference between a
 * capture a later reader can re-take and one they have to trust.
 */

const gateClassesEntry = join(repoRoot, "src", "gates", "gate-classes.ts");
const capturesDir = join(repoRoot, "witness", "captures");

/** Run the shipped gate module directly, in a working directory of our choosing. */
function runGateModule(cwd: string, args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const run = spawnSync(process.execPath, [gateClassesEntry, ...args], {
    encoding: "utf8",
    cwd,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

test("the typecheck gate reports units the compiler printed and reddens naming the file when one deliberate type error is introduced", () => {
  const dir = scratch("typecheck-gate");
  try {
    /* The compiler is resolved from the gate's working directory, so the
       scratch project borrows this repository's installed one. A symlink
       rather than a copy: node_modules is large and nothing here writes to
       it. */
    symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"));
    writeFileSync(join(dir, "one.ts"), "export const one: number = 1;\n");
    writeFileSync(join(dir, "two.ts"), 'export const two: string = "two";\n');
    const project = (outDir: string, files: string[]): string =>
      `${JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            module: "nodenext",
            target: "es2022",
            types: [],
            outDir,
          },
          files,
        },
        null,
        2,
      )}\n`;
    writeFileSync(join(dir, "tsconfig.one.json"), project("out-one", ["one.ts"]));
    writeFileSync(join(dir, "tsconfig.both.json"), project("out-both", ["one.ts", "two.ts"]));

    const compiler = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
    /** A LIVE run of the compiler, so the expected count is the compiler's own. */
    const listed = (project: string): number => {
      const run = spawnSync(
        process.execPath,
        [compiler, "-b", project, "--force", "--listFiles"],
        { encoding: "utf8", cwd: dir },
      );
      assert.equal(run.status, 0, `tsc -b ${project} exited ${String(run.status)}: ${run.stdout}`);
      return new Set(
        run.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== ""),
      ).size;
    };

    const runGate = (project: string, result: string) => {
      const run = runGateModule(dir, [
        "typecheck",
        "--result",
        result,
        "--project",
        project,
      ]);
      const record = JSON.parse(readFileSync(join(dir, result), "utf8")) as {
        status: string;
        units: number;
        detail: string;
      };
      return { run, record };
    };

    /* THE COUNT IS THE COMPILER'S, NOT A CONSTANT, and the way that is
       established is that two projects of different sizes produce different
       counts AND each equals what a live tsc run of that same project
       printed. A gate returning any fixed number fails both halves. The
       cited capture witness/captures/typecheck-tsc-listfiles-green.txt holds
       the same two counts taken by hand on the day this was written. */
    const oneCount = listed("tsconfig.one.json");
    const bothCount = listed("tsconfig.both.json");
    assert.ok(
      bothCount > oneCount,
      `the two projects should list different file counts, saw ${String(oneCount)} and ${String(bothCount)}`,
    );

    const one = runGate("tsconfig.one.json", "one.json");
    assert.equal(one.run.status, 0, `expected green: ${one.run.stdout}${one.run.stderr}`);
    assert.equal(one.record.status, "green");
    assert.equal(one.record.units, oneCount);

    const both = runGate("tsconfig.both.json", "both.json");
    assert.equal(both.run.status, 0, `expected green: ${both.run.stdout}${both.run.stderr}`);
    assert.equal(both.record.units, bothCount);
    assert.notEqual(one.record.units, both.record.units);

    /* THE RED ARM. One deliberate type error, and the detail must NAME THE
       FILE (plan criterion 3). The asserted diagnostic is read out of
       witness/captures/typecheck-tsc-listfiles-red.txt, a verbatim capture of
       the compiler this gate consumes, so the assertion is the compiler's own
       sentence rather than one chosen to match the implementation. */
    const redCapture = readFileSync(
      join(capturesDir, "typecheck-tsc-listfiles-red.txt"),
      "utf8",
    );
    const capturedDiagnostic = redCapture
      .split("\n")
      .find((line) => line.includes("error TS")) as string;
    assert.ok(
      capturedDiagnostic !== undefined && capturedDiagnostic.startsWith("two.ts("),
      `the capture does not carry a relative diagnostic line: ${String(capturedDiagnostic)}`,
    );

    writeFileSync(join(dir, "two.ts"), "export const two: string = 2;\n");
    const red = runGate("tsconfig.both.json", "red.json");
    assert.equal(red.run.status, 1, `expected red: ${red.run.stdout}${red.run.stderr}`);
    assert.equal(red.record.status, "red");
    assert.equal(
      red.record.detail.includes(capturedDiagnostic),
      true,
      `the red detail does not reproduce the captured compiler diagnostic:\n${red.record.detail}`,
    );
    assert.match(red.record.detail, /two\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The registration guard, in the shape `test/cutover.test.ts` and
 * `test/cutover-entry.test.ts` settled on after 49 rows in one phase
 * registered a DESCRIPTION rather than a test NAME and every green run missed
 * it. `test/behaviors.json` maps an id to the EXACT title, and the `suite`
 * gate resolves it by a byte-identical lookup with no id-to-test step, so a
 * paraphrase is permanently unresolvable however well the test passes.
 *
 * BY NAME, NEVER BY COUNT: the file is append-only, so a count would be a
 * claim about every future phase and false the moment the next one appends.
 */
test("the M4-P14 typecheck behavior is registered in test/behaviors.json and resolves by name", () => {
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  const ids = [
    "typecheck-units-derived-from-the-compiler",
  ];
  const testNames = new Set<string>();
  const testDir = join(repoRoot, "test");
  for (const entry of readdirSync(testDir)) {
    if (!entry.endsWith(".test.ts")) continue;
    const body = readFileSync(join(testDir, entry), "utf8");
    for (const match of body.matchAll(/\btest\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      testNames.add(match[2] as string);
    }
  }
  assert.ok(
    testNames.size > 100,
    `the test-name scan found only ${String(testNames.size)} names, so it is not reading the suite`,
  );
  const unregistered: string[] = [];
  const unresolved: string[] = [];
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(behaviors, id)) {
      unregistered.push(id);
      continue;
    }
    if (!testNames.has(behaviors[id] as string)) {
      unresolved.push(`${id} -> ${JSON.stringify(behaviors[id])}`);
    }
  }
  assert.deepEqual(unregistered, [], `behaviors.json does not register ${String(unregistered.length)} id(s)`);
  assert.deepEqual(
    unresolved,
    [],
    `${String(unresolved.length)} of ${String(ids.length)} registered rows name no test:\n  ${unresolved.join("\n  ")}`,
  );
});

/* ------------------------------------------------------------------ */
/* M5-P4 criterion p4-summary-artifact: exactly summary.json is kept    */
/* ------------------------------------------------------------------ */

/*
 * The plan names the hazard `evidence-leak`: uploading the evidence directory
 * publishes captured output, and captured output can carry credentials. The
 * guard therefore RESOLVES each upload step's `path` input against a fixture
 * runner.temp laid out the way the gate runner lays out a real evidence
 * directory, including captured stdout that must never leave the runner, and
 * requires that the files it would upload are exactly that run's summary.json
 * for that arm. Widening the path to the directory, to a glob, or to a second
 * line is a different resolved set and reddens.
 *
 * The expected path is DERIVED, not written here: it is the `--evidence`
 * argument of the gates step for the same event, plus `summary.json`.
 */

interface UploadStep {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, unknown>;
}

/** Same fail-closed evaluator shape as test/authored-bytes.test.ts. */
function uploadStepRunsOn(condition: string | undefined, event: string): boolean {
  if (condition === undefined) return true;
  const body = condition.trim().replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "");
  return body.split("&&").every((raw) => {
    const term = raw.trim();
    if (term === "!cancelled()" || term === "always()" || term === "success()") return true;
    const compared = /^github\.event_name\s*(==|!=)\s*'([^']*)'$/.exec(term);
    if (compared === null) {
      throw new Error(`the step condition term ${JSON.stringify(term)} is not one this harness evaluates`);
    }
    return compared[1] === "==" ? event === compared[2] : event !== compared[2];
  });
}

function gatesJobSteps(workflowText: string): UploadStep[] {
  const document = yamlModule.parse(workflowText) as { jobs: Record<string, { steps?: UploadStep[] }> };
  const job = document.jobs["gates"];
  assert.ok(job !== undefined, "the workflow has no job named `gates`");
  return job.steps ?? [];
}

function substituteRunnerTemp(text: string, runnerTemp: string): string {
  const substituted = text.replace(/\$\{\{\s*runner\.temp\s*\}\}/g, runnerTemp);
  if (substituted.includes("${{")) {
    throw new Error(`an expression other than runner.temp remains in ${JSON.stringify(text)}`);
  }
  return substituted;
}

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

/** A glob in the upload-artifact dialect, reduced to what a path can widen to. */
function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] as string;
    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      if (pattern[index + 1] === "/") index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** Every file an upload-artifact `path` input would upload, resolved on disk. */
function resolveUploadPath(pathInput: string, runnerTemp: string): string[] {
  const included = new Set<string>();
  const excluded: RegExp[] = [];
  for (const rawLine of pathInput.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const negated = line.startsWith("!");
    const pattern = substituteRunnerTemp(negated ? line.slice(1) : line, runnerTemp);
    if (negated) {
      excluded.push(globToRegExp(pattern));
      continue;
    }
    if (/[*?[{]/.test(pattern)) {
      const firstWild = pattern.search(/[*?[{]/);
      const base = pattern.slice(0, pattern.lastIndexOf("/", firstWild));
      const matcher = globToRegExp(pattern);
      for (const file of existsSync(base) ? filesUnder(base) : []) {
        if (matcher.test(file)) included.add(file);
      }
    } else if (existsSync(pattern)) {
      let isDirectory = false;
      try {
        readdirSync(pattern);
        isDirectory = true;
      } catch {
        isDirectory = false;
      }
      for (const file of isDirectory ? filesUnder(pattern) : [pattern]) included.add(file);
    }
  }
  return [...included].filter((file) => !excluded.some((re) => re.test(file))).sort();
}

/** runner.temp as the gate runner leaves it, credential-bearing captures included. */
function stageRunnerTemp(dir: string, evidenceName: string): void {
  const evidence = join(dir, evidenceName);
  mkdirSync(join(evidence, "suite"), { recursive: true });
  writeFileSync(join(evidence, "summary.json"), "{}\n");
  writeFileSync(join(evidence, "suite", "result.json"), "{}\n");
  writeFileSync(join(evidence, "suite", "stdout.txt"), "token=fixture-credential-never-uploaded\n");
  mkdirSync(join(dir, "other", "records"), { recursive: true });
  writeFileSync(join(dir, "other", "records", "001.json"), "{}\n");
}

/** The gates-run step for one CI event: exactly one, or the reason there is not. */
function gatesRunStepsFor(steps: UploadStep[], event: string): UploadStep[] {
  return steps.filter(
    (step) =>
      typeof step.run === "string" &&
      /gates run/.test(step.run) &&
      uploadStepRunsOn(step.if, event),
  );
}

const SUMMARY_EVENTS = ["pull_request", "push"] as const;

const MAX_SUMMARY_RETENTION_DAYS = 14;

/** Why the workflow's summary upload is NOT exactly summary.json per arm; empty when it is. */
function summaryUploadDefects(workflowText: string, runnerTemp: string): string[] {
  const steps = gatesJobSteps(workflowText);
  const defects: string[] = [];
  for (const event of SUMMARY_EVENTS) {
    const runSteps = gatesRunStepsFor(steps, event);
    if (runSteps.length !== 1) {
      defects.push(`${event}: expected one gates run step, found ${String(runSteps.length)}`);
      continue;
    }
    const evidenceArgument = /--evidence "([^"]+)"/.exec((runSteps[0] as UploadStep).run as string);
    if (evidenceArgument === null) {
      defects.push(`${event}: the gates step's --evidence argument could not be read`);
      continue;
    }
    const expected = join(
      substituteRunnerTemp(evidenceArgument[1] as string, runnerTemp),
      "summary.json",
    );

    const uploads = steps.filter(
      (step) =>
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/upload-artifact@") &&
        uploadStepRunsOn(step.if, event),
    );
    if (uploads.length === 0) {
      defects.push(`${event}: no upload-artifact step runs on this event`);
      continue;
    }
    const uploaded = new Set<string>();
    for (const upload of uploads) {
      const inputs = upload.with ?? {};
      const retention = inputs["retention-days"];
      if (
        typeof retention !== "number" ||
        !Number.isInteger(retention) ||
        retention < 1 ||
        retention > MAX_SUMMARY_RETENTION_DAYS
      ) {
        defects.push(`${event}: ${String(upload.name)} declares retention-days ${JSON.stringify(retention)}, not an integer from 1 to ${String(MAX_SUMMARY_RETENTION_DAYS)}`);
      }
      if (typeof upload.if !== "string" || !/!cancelled\(\)|always\(\)/.test(upload.if)) {
        defects.push(`${event}: ${String(upload.name)} does not run after a failed step, so a red bundle's summary is lost`);
      }
      if (typeof inputs["path"] !== "string") {
        defects.push(`${event}: ${String(upload.name)} has no path input`);
        continue;
      }
      /* A GLOB IS REFUSED, not resolved (fix round 1, CR-002): its resolved
         set is a property of today's runner.temp, and the upload must be
         exactly one file on every future layout too. A leading `!` is an
         exclusion pattern and is refused for the same reason. */
      for (const rawLine of inputs["path"].split("\n")) {
        const line = rawLine.trim();
        if (line !== "" && /[*?[\]{}!]/.test(line.replace(/\$\{\{\s*runner\.temp\s*\}\}/g, ""))) {
          defects.push(`${event}: ${String(upload.name)} path line ${JSON.stringify(line)} carries a glob character, and only a literal file path is allowed`);
        }
      }
      for (const file of resolveUploadPath(inputs["path"], runnerTemp)) uploaded.add(file);
    }
    const resolved = [...uploaded].sort();
    if (JSON.stringify(resolved) !== JSON.stringify([expected])) {
      defects.push(`${event}: the upload resolves to ${JSON.stringify(resolved)}, not exactly ${JSON.stringify([expected])}`);
    }
  }
  return defects;
}

test("the gates workflow uploads exactly the bundle's summary.json on each CI event with a declared short retention, and a widened path reddens", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const dir = scratch("summary-upload");
  try {
    const evidenceName = "gates-evidence";
    stageRunnerTemp(dir, evidenceName);
    assert.deepEqual(summaryUploadDefects(workflow, dir), []);

    /* The two arms upload the same path, so each widening is applied inside
       one arm's upload step only. */
    const pushMarker = "      - name: Upload the gate summary (push, summary.json only)";
    const pushAt = workflow.indexOf(pushMarker);
    assert.ok(pushAt > 0, "the workflow no longer carries the push upload step");
    const inPr = (from: string, to: string): string =>
      workflow.slice(0, pushAt).replace(from, to) + workflow.slice(pushAt);
    const inPush = (from: string, to: string): string =>
      workflow.slice(0, pushAt) + workflow.slice(pushAt).replace(from, to);
    const prPath = `path: \${{ runner.temp }}/${evidenceName}/summary.json`;
    assert.ok(workflow.slice(0, pushAt).includes(prPath), `the pull-request upload no longer carries ${prPath}`);
    const pushPath = prPath;
    assert.ok(workflow.slice(pushAt).includes(pushPath), `the push upload no longer carries ${pushPath}`);

    /* THREE WIDENINGS, structurally different: the evidence directory (which
       holds captured stdout), all of runner.temp, and a second path line
       beside the correct one. */
    const widened: Record<string, string> = {
      directory: inPr(prPath, `path: \${{ runner.temp }}/${evidenceName}`),
      "runner temp": inPr(prPath, "path: ${{ runner.temp }}"),
      "second line": inPr(
        prPath,
        `path: |\n            \${{ runner.temp }}/${evidenceName}/summary.json\n            \${{ runner.temp }}/other`,
      ),
    };
    for (const [label, text] of Object.entries(widened)) {
      assert.notEqual(text, workflow, `the ${label} widening did not apply`);
      const defects = summaryUploadDefects(text, dir).join("\n");
      assert.match(defects, /pull_request: the upload resolves to/, `the ${label} widening was not detected`);
    }

    /* RETENTION: removed, and set long. */
    const noRetention = workflow.replace(/\n\s+retention-days: 7/, "");
    assert.notEqual(noRetention, workflow);
    assert.match(summaryUploadDefects(noRetention, dir).join("\n"), /retention-days undefined/);
    const longRetention = workflow.replace("retention-days: 7", "retention-days: 90");
    assert.match(summaryUploadDefects(longRetention, dir).join("\n"), /retention-days 90/);

    /* THE PUSH ARM is its own witness (T-009): its step removed entirely. */
    const noPushUpload = workflow.replace(
      /\n      - name: Upload the gate summary \(push, summary\.json only\)[\s\S]*?if-no-files-found: warn/,
      "",
    );
    assert.notEqual(noPushUpload, workflow);
    assert.match(summaryUploadDefects(noPushUpload, dir).join("\n"), /push: no upload-artifact step/);

    /* GLOBS THAT MATCH ONLY summary.json TODAY (fix round 1, CR-002). The
       resolved-set comparison above is against a SNAPSHOT of runner.temp, so a
       glob that happens to resolve to exactly the one file on this fixture is
       green here and widens the day the harness writes a second matching file.
       So a glob character in any upload path line is refused outright, and
       each arm has its own witness, with two different glob shapes. */
    const globbed: { label: string; event: string; text: string }[] = [
      {
        label: "push gates-evidence/*.json",
        event: "push",
        text: inPush(pushPath, `path: \${{ runner.temp }}/${evidenceName}/*.json`),
      },
      {
        label: "push summary.json*",
        event: "push",
        text: inPush(pushPath, `${pushPath}*`),
      },
      {
        label: "pull_request gates-evidence/*.json",
        event: "pull_request",
        text: inPr(prPath, `path: \${{ runner.temp }}/${evidenceName}/*.json`),
      },
      {
        label: "pull_request summ?ry.json",
        event: "pull_request",
        text: inPr(prPath, `path: \${{ runner.temp }}/${evidenceName}/summ?ry.json`),
      },
      {
        label: "pull_request negation line",
        event: "pull_request",
        text: inPr(
          prPath,
          `path: |\n            \${{ runner.temp }}/${evidenceName}/summary.json\n            !\${{ runner.temp }}/other`,
        ),
      },
    ];
    for (const { label, event, text } of globbed) {
      assert.notEqual(text, workflow, `the ${label} glob did not apply`);
      assert.match(
        summaryUploadDefects(text, dir).join("\n"),
        new RegExp(`${event}: .* carries a glob character`),
        `the ${label} glob was not refused`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M6-P3: one gate list. CI runs the registry directly on both events   */
/* ------------------------------------------------------------------ */

/**
 * Why the gates-run step for `event` is not wired, or an empty list when it
 * is. The step is found by what it RUNS and by whether its `if:` lets it run
 * on the event, never by its name, and its command is then EXECUTED under the
 * runner's default `bash -e` against a stub `bin/tiphys.ts` whose exit code is
 * known, so a step that swallows the runner's exit is caught by what it does.
 */
function registryStepDefects(workflowText: string, event: string, dir: string): string[] {
  const document = yamlModule.parse(workflowText) as {
    jobs: Record<string, { steps?: UploadStep[]; "continue-on-error"?: unknown }>;
  };
  const defects: string[] = [];
  if (/--manifest\b/.test(workflowText)) defects.push("the workflow passes --manifest");
  if (/m2-exit-test\.sh/.test(workflowText)) defects.push("the workflow runs scripts/m2-exit-test.sh");
  if (/gates\.manifest\.json/.test(workflowText)) defects.push("the workflow names gates.manifest.json");
  const steps = gatesRunStepsFor(gatesJobSteps(workflowText), event);
  if (steps.length !== 1) {
    defects.push(`${event}: expected exactly one gates run step, found ${String(steps.length)}`);
    return defects;
  }
  const step = steps[0] as UploadStep & { "continue-on-error"?: unknown; env?: Record<string, unknown> };
  const run = step.run as string;
  if (step["continue-on-error"] !== undefined && step["continue-on-error"] !== false) {
    defects.push(`${event}: the gates step is continue-on-error`);
  }
  const job = document.jobs["gates"];
  if (job?.["continue-on-error"] !== undefined && job["continue-on-error"] !== false) {
    defects.push("the gates job is continue-on-error");
  }
  for (const required of ["--registry gate-registry.yaml", "--mode full", `--event ${event}`, "--evidence ", "--base ", "--head "]) {
    if (!run.includes(required)) defects.push(`${event}: the gates step does not pass ${required.trim()}`);
  }
  if (event === "pull_request" && !run.includes("--phase ")) {
    defects.push("pull_request: the gates step does not pass --phase");
  }
  if (event === "push" && !run.includes("github.event.before")) {
    defects.push("push: the gates step's --base is not the previous main tip");
  }
  /* BEHAVIOUR: the step's own text and `env:`, run as the runner runs it,
     over a stub runner exiting 0 and then 1. Every `${{ }}` expression
     becomes a literal. */
  mkdirSync(join(dir, "bin"), { recursive: true });
  const script = run.replace(/\$\{\{[^}]*\}\}/g, "fixture");
  const scriptFile = join(dir, "step.sh");
  writeFileSync(scriptFile, script);
  const stepEnv: Record<string, string> = {};
  for (const [name, value] of Object.entries(step.env ?? {})) {
    stepEnv[name] = String(value).replace(/\$\{\{[^}]*\}\}/g, "fixture");
  }
  for (const code of [0, 1]) {
    writeFileSync(join(dir, "bin", "tiphys.ts"), `process.exit(${String(code)});\n`);
    const result = spawnSync("bash", ["-e", scriptFile], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, ...stepEnv, PATH: `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}` },
    });
    if (code === 0 && result.status !== 0) {
      defects.push(`${event}: the gates step failed over a runner that exited 0: ${result.stderr}`);
    }
    if (code === 1 && result.status === 0) {
      defects.push(`${event}: the gates step exited 0 over a runner that exited 1`);
    }
  }
  return defects;
}

test("the gates workflow runs the registry runner directly on both CI events with --event, never --manifest or the M2 harness, and the step fails when the runner does", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const dir = scratch("registry-step");
  try {
    assert.deepEqual(registryStepDefects(workflow, "pull_request", dir), []);
    assert.deepEqual(registryStepDefects(workflow, "push", dir), []);

    /* THREE STRUCTURALLY DIFFERENT DEFANGS, each reddening its own arm: the
       runner's exit swallowed, the push arm narrowed to the pull-request
       event's gates, and the push step removed by an `if:` that never holds. */
    const pushRun = "          --event push\n";
    assert.ok(workflow.includes(pushRun), "the workflow no longer carries --event push");
    const swallowed = workflow.replace(pushRun, "          --event push || true\n");
    assert.match(
      registryStepDefects(swallowed, "push", dir).join("\n"),
      /exited 0 over a runner that exited 1/,
    );
    const narrowed = workflow.replace(pushRun, "          --event pull_request\n");
    assert.match(registryStepDefects(narrowed, "push", dir).join("\n"), /does not pass --event push/);
    const skipped = workflow.replace(
      "if: github.event_name != 'pull_request'\n        run: >\n          node bin/tiphys.ts gates run",
      "if: github.event_name == 'never'\n        run: >\n          node bin/tiphys.ts gates run",
    );
    assert.notEqual(skipped, workflow, "the push-step skip did not apply");
    assert.match(registryStepDefects(skipped, "push", dir).join("\n"), /push: expected exactly one gates run step, found 0/);

    /* And the old list is gone for good: a --manifest or harness step
       reappearing is named, whatever else it does. */
    const manifestBack = workflow.replace(
      "--registry gate-registry.yaml",
      "--manifest gates.manifest.json --registry gate-registry.yaml",
    );
    assert.match(registryStepDefects(manifestBack, "pull_request", dir).join("\n"), /passes --manifest/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Why the workflow still runs a check twice on a pull request (M6-P8, DR-0066); empty when it does not. */
function pullRequestRunsEachCheckOnceDefects(workflowText: string): string[] {
  const defects: string[] = [];
  const steps = gatesJobSteps(workflowText);
  for (const step of steps) {
    if (typeof step.run === "string" && /^\s*npm test\s*$/.test(step.run)) {
      defects.push("a step runs npm test on its own");
    }
  }
  const exitTest = steps.filter((step) => typeof step.run === "string" && step.run.includes("scripts/m1-exit-test.sh"));
  if (exitTest.length !== 1) {
    defects.push(`expected exactly one M1 exit test step, found ${String(exitTest.length)}`);
  } else {
    const step = exitTest[0] as UploadStep;
    if (uploadStepRunsOn(step.if, "pull_request")) defects.push("the M1 exit test step runs on pull_request");
    if (!uploadStepRunsOn(step.if, "push")) defects.push("the M1 exit test step does not run on push");
  }
  return defects;
}

test("the gates workflow runs no separate npm test step, and the M1 exit test step runs on push and not on pull_request", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.deepEqual(pullRequestRunsEachCheckOnceDefects(workflow), []);

  /* The shape this phase removed, restored one change at a time, is named. */
  const build = "      - run: npm run build\n";
  assert.ok(workflow.includes(build), "the workflow no longer carries the build step");
  const suiteBack = workflow.replace(build, `${build}      - run: npm test\n`);
  assert.deepEqual(pullRequestRunsEachCheckOnceDefects(suiteBack), ["a step runs npm test on its own"]);
  const everyEvent = workflow.replace(
    "        if: github.event_name != 'pull_request'\n        run: scripts/m1-exit-test.sh",
    "        run: scripts/m1-exit-test.sh",
  );
  assert.notEqual(everyEvent, workflow, "the M1 exit test condition did not apply");
  assert.deepEqual(pullRequestRunsEachCheckOnceDefects(everyEvent), ["the M1 exit test step runs on pull_request"]);
});

/** A two-gate registry: one gate declares only `pull_request`, one only `push`. */
function writeTwoEventFixtureRegistry(dir: string): string {
  writeFileSync(join(dir, "fixture-gate.mjs"), FIXTURE_GATE_SOURCE);
  const gate = (id: string, events: string[]): Record<string, unknown> => ({
    id,
    command: ["node", join(dir, "fixture-gate.mjs")],
    unitLabel: "fixture units",
    applicability: "required",
    prevents: "a fixture failure",
    "verified-by": "script",
    modes: ["full"],
    events,
  });
  const document = {
    kind: "gate-registry",
    version: 1,
    preflight: [{ command: ["npm", "ci"], note: "install exactly the lockfile" }],
    gates: [gate("on-pull-request", ["pull_request"]), gate("on-push", ["push"])],
    destructiveCommands: [],
  };
  const path = join(dir, "two-event-registry.json");
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return path;
}

test("--event push selects only the gates whose events include push, --event pull_request only the others, and no --event selects both", () => {
  const dir = scratch("event-selection");
  try {
    const registry = writeTwoEventFixtureRegistry(dir);
    const environment = {
      ...process.env,
      FIXTURE_GATE_ID: "",
      FIXTURE_STATUS: "green",
      FIXTURE_UNITS: "1",
      FIXTURE_EXIT: "0",
    };
    const ran = (extra: string[]): { status: number | null; ids: string[]; dirs: string[]; out: string } => {
      const evidence = join(dir, `evidence-${String(Math.random()).slice(2)}`);
      const run = spawnSync(
        process.execPath,
        [cliEntry, "gates", "run", "--registry", registry, "--evidence", evidence, ...extra],
        { encoding: "utf8", cwd: dir, env: environment },
      );
      const summary = existsSync(join(evidence, "summary.json"))
        ? (JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as { gates: { id: string }[] })
        : { gates: [] };
      const dirs = existsSync(evidence)
        ? readdirSync(evidence).filter((name) => name.startsWith("on-")).sort()
        : [];
      return {
        status: run.status,
        ids: summary.gates.map((row) => row.id).sort(),
        dirs,
        out: run.stdout + run.stderr,
      };
    };
    /* The fixture gate writes the id it is told; the record id must match the
       row, so each run gets the id through a per-gate wrapper instead. */
    const wrap = (id: string): void => {
      writeFileSync(
        join(dir, `${id}.mjs`),
        `process.env.FIXTURE_GATE_ID = ${JSON.stringify(id)};\nawait import(${JSON.stringify(join(dir, "fixture-gate.mjs"))});\n`,
      );
    };
    wrap("on-pull-request");
    wrap("on-push");
    const document = JSON.parse(readFileSync(registry, "utf8")) as { gates: { id: string; command: string[] }[] };
    for (const gate of document.gates) gate.command = ["node", join(dir, `${gate.id}.mjs`)];
    writeFileSync(registry, `${JSON.stringify(document, null, 2)}\n`);

    const push = ran(["--event", "push"]);
    assert.equal(push.status, 0, push.out);
    assert.deepEqual(push.ids, ["on-push"], push.out);
    assert.deepEqual(push.dirs, ["on-push"], "a gate not selected by the event must leave no evidence");

    const pullRequest = ran(["--event", "pull_request"]);
    assert.equal(pullRequest.status, 0, pullRequest.out);
    assert.deepEqual(pullRequest.ids, ["on-pull-request"], pullRequest.out);
    assert.deepEqual(pullRequest.dirs, ["on-pull-request"]);

    const both = ran([]);
    assert.equal(both.status, 0, both.out);
    assert.deepEqual(both.ids, ["on-pull-request", "on-push"], both.out);

    const bogus = ran(["--event", "schedule"]);
    assert.equal(bogus.status, 64, bogus.out);
    assert.match(bogus.out, /--event must be one of pull_request, push/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("on each CI event the runner exits nonzero when a required gate is red, vacuous, errors or is not applicable beside a green control, and 0 only when it is green", () => {
  /* M6-P3, p3-red-fails-ci. CI now runs this runner directly, so its exit code
     IS the step's result. Each arm is ISOLATED: beside the gate under test the
     registry carries one control gate that is always green, so no other
     gate's status can supply the nonzero exit, and "no applicable gate" (21)
     cannot stand in for the not-applicable rule (20). */
  const dir = scratch("red-fails-ci");
  try {
    writeFileSync(join(dir, "fixture-gate.mjs"), FIXTURE_GATE_SOURCE);
    writeFileSync(
      join(dir, "control-gate.mjs"),
      `process.env.FIXTURE_GATE_ID = "control";\nprocess.env.FIXTURE_STATUS = "green";\nprocess.env.FIXTURE_UNITS = "1";\nprocess.env.FIXTURE_EXIT = "0";\nawait import(${JSON.stringify(join(dir, "fixture-gate.mjs"))});\n`,
    );
    const control = {
      id: "control",
      prevents: "a fixture failure",
      command: ["node", join(dir, "control-gate.mjs")],
      unitLabel: "fixture units",
      applicability: "required",
      "verified-by": "script",
      modes: ["full"],
      events: ["pull_request", "push"],
    };
    const registryFor = (name: string, precondition?: Record<string, unknown>): string => {
      const gate: Record<string, unknown> = {
        id: "only",
        prevents: "a fixture failure",
        command: ["node", join(dir, "fixture-gate.mjs")],
        unitLabel: "fixture units",
        applicability: "required",
        "verified-by": "script",
        modes: ["full"],
        events: ["pull_request", "push"],
      };
      if (precondition !== undefined) gate["precondition"] = precondition;
      const path = join(dir, `${name}.json`);
      writeFileSync(
        path,
        `${JSON.stringify({ kind: "gate-registry", version: 1, preflight: [{ command: ["npm", "ci"], note: "install exactly the lockfile" }], gates: [control, gate], destructiveCommands: [] }, null, 2)}\n`,
      );
      return path;
    };
    const plain = registryFor("plain");
    const unmet = registryFor("unmet", {
      id: "needs-a-file-nobody-wrote",
      kind: "file-exists",
      path: join(dir, "absent.json"),
    });
    const arms: { name: string; registry: string; status: string; units: string; exit: string; want: number }[] = [
      { name: "green", registry: plain, status: "green", units: "1", exit: "0", want: 0 },
      { name: "red", registry: plain, status: "red", units: "1", exit: "1", want: 1 },
      { name: "vacuous", registry: plain, status: "green", units: "0", exit: "0", want: 21 },
      { name: "error", registry: plain, status: "error", units: "0", exit: "21", want: 21 },
      { name: "not-applicable", registry: unmet, status: "green", units: "1", exit: "0", want: 20 },
    ];
    for (const event of ["pull_request", "push"]) {
      for (const arm of arms) {
        const evidence = join(dir, `evidence-${event}-${arm.name}`);
        const run = spawnSync(
          process.execPath,
          [cliEntry, "gates", "run", "--registry", arm.registry, "--mode", "full", "--event", event, "--evidence", evidence],
          {
            encoding: "utf8",
            cwd: dir,
            env: {
              ...process.env,
              FIXTURE_GATE_ID: "only",
              FIXTURE_STATUS: arm.status,
              FIXTURE_UNITS: arm.units,
              FIXTURE_EXIT: arm.exit,
            },
          },
        );
        assert.equal(run.status, arm.want, `${event} ${arm.name}: ${run.stdout}${run.stderr}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* Kept from the deleted M2 exit-test suite: both guard a gate, not the harness. */

test("the gates workflow checks out the pull-request head branch by name (ref: github.head_ref) so scope is not detached", () => {
  /* On a pull_request event actions/checkout defaults to a DETACHED HEAD at the
     ephemeral merge commit, so `git rev-parse --abbrev-ref HEAD` returns "HEAD"
     and the scope gate's branch-matches precondition never matches: scope would
     report not-applicable on every CI run and never audit a real diff.
     fetch-depth 0 is kept beside it: the diff-scoped gates need merge bases. */
  const steps = gatesJobSteps(readFileSync(workflowPath, "utf8"));
  const checkout = steps.filter(
    (step) => typeof step.uses === "string" && step.uses.startsWith("actions/checkout@"),
  );
  assert.equal(checkout.length, 1, "expected exactly one actions/checkout step in the gates job");
  const inputs = (checkout[0] as UploadStep).with ?? {};
  assert.equal(inputs["ref"], "${{ github.head_ref }}");
  assert.equal(String(inputs["fetch-depth"]), "0");
});

/* ------------------------------------------------------------------ */
/* M6-P5 CI landing: --phase from the pull request title (DR-0057)      */
/* ------------------------------------------------------------------ */

/** A branch that carries every M6 phase in turn, so its name names no phase. */
const NON_PHASE_BRANCH = "claude/upbeat-gates-w3cm5m";
/** That branch in the kernel's phase grammar: lowercased, every byte outside [a-z0-9-] made `-`. */
const NON_PHASE_BRANCH_PHASE = "claude-upbeat-gates-w3cm5m";

/**
 * The --phase the pull-request gates step passes for one branch and title, run
 * as the runner runs it. Every `${{ expr }}` in the step's `env:` and `run:` is
 * substituted TEXTUALLY with the value this context gives, as Actions does
 * before the shell sees the script, so an expression interpolated into `run:`
 * puts the title into the script text. An expression the context has no value
 * for throws rather than becoming a placeholder. The runner is a stub
 * `bin/tiphys.ts` that prints its argv.
 */
function pullRequestStepPhase(
  workflowText: string,
  dir: string,
  branch: string,
  title: string,
): { phase: string | undefined; output: string } {
  const steps = gatesRunStepsFor(gatesJobSteps(workflowText), "pull_request");
  assert.equal(steps.length, 1, "expected exactly one pull-request gates run step");
  const step = steps[0] as UploadStep & { env?: Record<string, unknown> };
  const context: Record<string, string> = {
    "github.head_ref": branch,
    "github.event.pull_request.title": title,
    "github.token": "fixture-token",
    "runner.temp": join(dir, "runner-temp"),
    "github.event.pull_request.base.sha": "fixture-base-sha",
    "github.event.pull_request.head.sha": "fixture-head-sha",
  };
  const substitute = (text: string): string =>
    text.replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (_whole: string, expression: string) => {
      const value = context[expression];
      if (value === undefined) throw new Error(`the pull-request gates step reads ${expression}, which this harness has no value for`);
      return value;
    });
  const env: Record<string, string> = { PATH: `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}` };
  for (const [name, value] of Object.entries(step.env ?? {})) env[name] = substitute(String(value));
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "bin", "tiphys.ts"), 'console.log("STUB-ARGV " + JSON.stringify(process.argv.slice(2)));\n');
  const scriptFile = join(dir, "step.sh");
  writeFileSync(scriptFile, substitute(step.run as string));
  const result = spawnSync("bash", ["-e", scriptFile], { cwd: dir, encoding: "utf8", env });
  const line = result.stdout.split("\n").find((candidate) => candidate.startsWith("STUB-ARGV "));
  let phase: string | undefined;
  if (line !== undefined) {
    const argv = JSON.parse(line.slice("STUB-ARGV ".length)) as string[];
    const at = argv.indexOf("--phase");
    phase = at >= 0 ? argv[at + 1] : undefined;
  }
  return { phase, output: `exit ${String(result.status)}\n${result.stdout}${result.stderr}` };
}

/** Why the pull-request step's phase derivation is wrong or runs title text; empty when it is not. */
function phaseDerivationDefects(workflowText: string, dir: string): string[] {
  const defects: string[] = [];
  const cases: { branch: string; title: string; want: string }[] = [
    { branch: "claude/m6-p5-x", title: "M6-P5: x", want: "m6-p5" },
    { branch: "claude/m6-p5-x", title: "M9-P9: another phase's title", want: "m6-p5" },
    { branch: "claude/m6-p5-x", title: "no phase in this title", want: "m6-p5" },
    { branch: NON_PHASE_BRANCH, title: "M6-P5: x", want: "m6-p5" },
    { branch: NON_PHASE_BRANCH, title: "M12-P34: two digits each", want: "m12-p34" },
    { branch: NON_PHASE_BRANCH, title: "land every M6 phase", want: NON_PHASE_BRANCH_PHASE },
    { branch: NON_PHASE_BRANCH, title: "fix for M6-P5: not leading", want: NON_PHASE_BRANCH_PHASE },
  ];
  /* THE TITLE IS FREE TEXT. Three structurally different ways shell syntax
     in it would run if it reached the script text: command substitution,
     backticks, and a single quote closing a quoted string. Each touches its
     own marker; the title must stay literal and the phase is still m6-p5. */
  const injections = [
    (marker: string): string => `M6-P5: $(touch ${marker})`,
    (marker: string): string => `M6-P5: \`touch ${marker}\``,
    (marker: string): string => `M6-P5: '; touch ${marker}; '`,
  ];
  injections.forEach((make, index) => {
    const marker = join(dir, `injected-${String(index)}`);
    cases.push({ branch: NON_PHASE_BRANCH, title: make(marker), want: "m6-p5" });
  });
  for (const { branch, title, want } of cases) {
    const { phase, output } = pullRequestStepPhase(workflowText, dir, branch, title);
    if (phase !== want) {
      defects.push(`branch ${branch} title ${JSON.stringify(title)}: --phase ${JSON.stringify(phase)}, not ${want} (${output.trim()})`);
    }
  }
  injections.forEach((_make, index) => {
    if (existsSync(join(dir, `injected-${String(index)}`))) {
      defects.push(`injection ${String(index)}: the title's shell syntax ran a command`);
    }
  });
  return defects;
}

test("the pull-request gates step takes --phase from a phase branch, else from the title's leading Mn-Pn: lowercased, else the branch name, and the title's shell syntax runs nothing", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const dir = scratch("phase-from-title");
  try {
    assert.deepEqual(phaseDerivationDefects(workflow, dir), []);

    /* TWO STRUCTURALLY DIFFERENT INTERPOLATIONS of the title into `run:`,
       each reddening under a different member of the class: inside double
       quotes (command substitution and backticks run) and inside single
       quotes (a closing quote runs the rest). */
    const readTitle = '[[ "$PR_TITLE" =~';
    assert.ok(workflow.includes(readTitle), "the workflow no longer reads the title from PR_TITLE");
    const doubleQuoted = workflow.replace(readTitle, '[[ "${{ github.event.pull_request.title }}" =~');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const doubleDefects = phaseDerivationDefects(doubleQuoted, dir).join("\n");
    assert.match(doubleDefects, /injection 0: the title's shell syntax ran a command/);
    assert.match(doubleDefects, /injection 1: the title's shell syntax ran a command/);

    const runStart = "        run: |\n          if [[ \"$HEAD_REF\"";
    assert.ok(workflow.includes(runStart), "the pull-request step no longer starts with the branch test");
    const singleQuoted = workflow.replace(
      runStart,
      "        run: |\n          PR_TITLE='${{ github.event.pull_request.title }}'\n          if [[ \"$HEAD_REF\"",
    );
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    assert.match(
      phaseDerivationDefects(singleQuoted, dir).join("\n"),
      /injection 2: the title's shell syntax ran a command/,
    );

    /* And the title arm removed: the branch that carries no phase passes its
       own name in the phase grammar, not the title's phase, which is what
       reddened merge-preconditions on this pull request. */
    const titleArm = workflow.indexOf('          elif [[ "$PR_TITLE"');
    const elseArm = workflow.indexOf("          else\n", titleArm);
    assert.ok(titleArm > 0 && elseArm > titleArm, "the title arm could not be located");
    const noTitleArm = workflow.slice(0, titleArm) + workflow.slice(elseArm);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    assert.match(
      phaseDerivationDefects(noTitleArm, dir).join("\n"),
      /branch claude\/upbeat-gates-w3cm5m title "M6-P5: x": --phase "claude-upbeat-gates-w3cm5m", not m6-p5/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a pull request whose branch and title name no phase gets a --phase in the kernel's review phase grammar", () => {
  /* merge-preconditions owes a kernel-launched review for the run's --phase
     (DR-0062, DR-0063), and the kernel records a review only for a phase in
     its own grammar. The grammar is READ from the review record schema, not
     copied, so the two cannot drift apart unseen. */
  const schema = JSON.parse(readFileSync(reviewRecordSchemaPath, "utf8")) as {
    properties: { phase: { pattern: string } };
  };
  const grammar = new RegExp(schema.properties.phase.pattern);
  const workflow = readFileSync(workflowPath, "utf8");
  const title = "close out the milestone";
  const dir = scratch("phase-grammar");
  try {
    /* Every case is checked and every failure reported, so a red run names
       each member that reddens, not only the first. */
    const defects: string[] = [];
    /* TWO STRUCTURALLY DIFFERENT non-phase branch names: a `/` separator,
       and uppercase letters with `.` and `_`. */
    for (const { branch, want } of [
      { branch: NON_PHASE_BRANCH, want: NON_PHASE_BRANCH_PHASE },
      { branch: "Close-Out.M6_final", want: "close-out-m6-final" },
    ]) {
      const { phase, output } = pullRequestStepPhase(workflow, dir, branch, title);
      if (phase === undefined || !grammar.test(phase)) {
        defects.push(`branch ${branch}: --phase ${JSON.stringify(phase)} is outside the review record's ${grammar.source} (${output.trim()})`);
      } else if (phase !== want) {
        defects.push(`branch ${branch}: --phase ${phase}, not ${want}`);
      }
    }

    /* A branch that maps to a leading `-` has no phase id in the grammar: the
       step fails rather than pass a phase no review can carry. */
    const leading = pullRequestStepPhase(workflow, dir, "_close-out", title);
    if (leading.phase !== undefined || !/^exit [1-9]/.test(leading.output)) {
      defects.push(`branch _close-out: the step passed --phase ${JSON.stringify(leading.phase)} instead of exiting nonzero (${leading.output.trim()})`);
    }
    assert.deepEqual(defects, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no environment variable changes a production gate's reported status (grep over the gate sources)", () => {
  /* A production gate must not read a NAMED environment variable that steers
     its verdict. The only named read allowed is the token a gate is told to
     read by its own registry command (`--token-env`), which is plumbing, not a
     switch, and is read through a configured name, not a literal. */
  const gatesDir = fileURLToPath(new URL("../src/gates", import.meta.url));
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith(".ts")) files.push(path);
    }
  };
  walk(gatesDir);
  assert.ok(files.length > 0, "no gate source was read");
  const namedRead = /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([^"']+)["']\s*\])/g;
  /* EMPTY since M6-P3 fix round 1 (CR-M6P3A-03): the one name it held,
     TIPHYS_IMPLEMENTER_TOKEN, was read only by the credential-token arm this
     phase deleted, and an allowlisted name no gate reads is a hole a new
     verdict switch could use. */
  const ALLOWED_NAMES = new Set<string>();
  for (const file of files) {
    for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
      for (const match of line.matchAll(namedRead)) {
        const name = (match[1] ?? match[2]) as string;
        assert.ok(
          ALLOWED_NAMES.has(name),
          `${file}:${String(index + 1)} reads the named environment variable ${name}: ${line.trim()}`,
        );
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* M6-P3: every gate names the failure it prevents (DR-0061 (b))        */
/* ------------------------------------------------------------------ */

test("the registry schema rejects a gate without prevents and one whose prevents spans two lines, and accepts a one-line prevents", () => {
  const base = readRegistry(registryPath);
  const withGate = (gate: Record<string, unknown>): Registry => ({ ...base, gates: [gate as unknown as RegistryGate] });
  const gate: Record<string, unknown> = {
    id: "fixture-gate",
    prevents: "a fixture failure nobody else catches",
    command: ["node", "gate.mjs"],
    unitLabel: "units",
    applicability: "required",
    "verified-by": "script",
    modes: ["full"],
    events: ["pull_request"],
  };
  assert.deepEqual(validateModule.validateToLines(readRegistrySchema(), withGate(gate)), []);

  const missing = { ...gate };
  delete missing["prevents"];
  const missingLines = validateModule.validateToLines(readRegistrySchema(), withGate(missing));
  assert.ok(
    missingLines.some((line) => line.includes("#/gates/0/prevents") && line.includes("missing")),
    JSON.stringify(missingLines),
  );

  for (const broken of ["a first line\nand a second", "a first line\r\nand a second", "   ", ""]) {
    const lines = validateModule.validateToLines(readRegistrySchema(), withGate({ ...gate, prevents: broken }));
    assert.ok(
      lines.some((line) => line.startsWith("INVALID #/gates/0/prevents")),
      `${JSON.stringify(broken)} was accepted: ${JSON.stringify(lines)}`,
    );
  }

  /* And the shipped registry carries one on every gate. */
  for (const entry of base.gates) {
    assert.equal(typeof entry.prevents, "string", `${entry.id} names no failure it prevents`);
  }
});
