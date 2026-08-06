import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M2-P1: the gate contract, manifest, validator and runner.
 *
 * TWO THINGS ABOUT WHAT THIS FILE MAY ASSERT ON.
 *
 * 1. DR-0013 clause 6 promises that M3-P1 re-runs "all existing M2
 *    validation tests" against Ajv. That is only an engine swap rather than
 *    a test rewrite if this file asserts on the DIAGNOSTIC CONTRACT and on
 *    nothing else: the line shape `INVALID <json-pointer> <message>`, the
 *    pointers, the message texts fixed by the plan, and the order. No
 *    assertion here reads any string the validator produces about its own
 *    internals. The single place a non-contract string is touched is the
 *    closed-keyword LOAD failure, where the assertion is that the offending
 *    KEYWORD NAME appears; the keyword name is input data, not wording, and
 *    criterion 10 requires the failure to name it.
 * 2. Every dangerous state staged below is the dangerous state, not the
 *    absent feature. The named pipes are made with `mkfifo`, the vacuous
 *    green is a real gate exiting 0, and the crash is a real uncaught throw.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const distEntry = join(repoRoot, "dist", "bin", "tiphys.js");

interface Diagnostic {
  pointer: string;
  message: string;
}
const validateModule = (await import(
  new URL("../src/gates/validate.ts", import.meta.url).href
)) as {
  loadSchema: (
    document: unknown,
    name: string,
  ) => { ok: true; schema: Record<string, unknown> } | { ok: false; reason: string };
  validate: (
    schema: Record<string, unknown>,
    instance: unknown,
  ) => Diagnostic[];
  validateToLines: (
    schema: Record<string, unknown>,
    instance: unknown,
  ) => string[];
};

const resultModule = (await import(
  new URL("../src/gates/result.ts", import.meta.url).href
)) as {
  makeGateResult: (fields: Record<string, unknown>) => {
    status: string;
    units: number;
    vacuous?: boolean;
    detail: string;
  };
};

const manifestModule = (await import(
  new URL("../src/gates/manifest.ts", import.meta.url).href
)) as {
  validateManifestDocument: (document: unknown) => string[];
  validateResultDocument: (document: unknown) => string[];
  manifestSchema: () => Record<string, unknown>;
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-gates-"));
}

function runCli(args: string[], cwd?: string) {
  return spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: cwd ?? repoRoot,
  });
}

interface GateScript {
  /** The record to write, or undefined to write nothing at all. */
  record?: Record<string, unknown>;
  exit: number;
  /** Throw before exiting: the real uncaught-exception shape. */
  crash?: boolean;
  /** Busy-wait before exiting, so a second runner can contend. */
  sleepMs?: number;
}

const FIXED_START = "2026-08-06T00:00:00.000Z";
const FIXED_END = "2026-08-06T00:00:01.000Z";

function gateRecord(
  gate: string,
  status: string,
  units: number,
): Record<string, unknown> {
  return {
    gate,
    status,
    units,
    unitLabel: "fixture units",
    startedAt: FIXED_START,
    endedAt: FIXED_END,
    detail: `fixture gate ${gate} reporting ${status}`,
    evidence: [],
  };
}

/** Write a fixture gate as a real program, and return its argv. */
function writeGate(dir: string, name: string, spec: GateScript): string[] {
  const path = join(dir, `${name}.mjs`);
  const body = [
    'import { writeFileSync } from "node:fs";',
    "const args = process.argv.slice(2);",
    'const at = args.indexOf("--result");',
    `const record = ${JSON.stringify(spec.record ?? null)};`,
    "if (record !== null && at >= 0) {",
    '  writeFileSync(args[at + 1], JSON.stringify(record, null, 2) + "\\n");',
    "}",
    spec.sleepMs === undefined
      ? ""
      : `const until = Date.now() + ${String(spec.sleepMs)}; while (Date.now() < until) {}`,
    spec.crash === true
      ? 'throw new Error("uncaught exception inside the fixture gate");'
      : "",
    `process.exit(${String(spec.exit)});`,
  ].join("\n");
  writeFileSync(path, `${body}\n`);
  return ["node", path];
}

function writeManifest(
  dir: string,
  gates: unknown[],
  name = "manifest.json",
): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    `${JSON.stringify(
      { version: 1, gates, destructiveCommands: ["pool destroy", "teardown"] },
      null,
      2,
    )}\n`,
  );
  return path;
}

interface Summary {
  runId: string;
  aborted: boolean;
  counts: Record<string, number>;
  reason: string;
  exitCode: number;
  requiredNotApplicable: string[];
  gates: {
    id: string;
    status: string;
    detail: string;
    vacuous: boolean;
    applicable: boolean;
    units: number;
  }[];
}

function readSummary(evidence: string): Summary {
  return JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as Summary;
}

function mkfifo(path: string): void {
  const made = spawnSync("mkfifo", [path], { encoding: "utf8" });
  assert.equal(made.status, 0, `mkfifo ${path} failed: ${made.stderr}`);
}

/* ------------------------------------------------------------------ */
/* Criterion 2: the four statuses and the summary arithmetic           */
/* ------------------------------------------------------------------ */

test("the runner maps four fixture gates onto green red not-applicable and error with matching summary counts", () => {
  const dir = scratch();
  try {
    const evidence = join(dir, "evidence");
    const manifest = writeManifest(dir, [
      {
        id: "g-green",
        command: writeGate(dir, "green", {
          record: gateRecord("g-green", "green", 3),
          exit: 0,
        }),
        unitLabel: "fixture units",
        applicability: "required",
      },
      {
        id: "g-red",
        command: writeGate(dir, "red", {
          record: gateRecord("g-red", "red", 2),
          exit: 1,
        }),
        unitLabel: "fixture units",
        applicability: "required",
      },
      {
        id: "g-absent",
        command: writeGate(dir, "never", {
          record: gateRecord("g-absent", "green", 1),
          exit: 0,
        }),
        unitLabel: "fixture units",
        applicability: "required",
        precondition: {
          id: "needs-inventory",
          kind: "file-exists",
          path: join(dir, "no-such-inventory.json"),
        },
      },
      {
        id: "g-error",
        command: writeGate(dir, "error", {
          record: gateRecord("g-error", "error", 0),
          exit: 21,
        }),
        unitLabel: "fixture units",
        applicability: "required",
      },
    ]);

    const result = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      evidence,
    ]);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);

    const records = readdirSync(evidence)
      .filter((name) => existsSync(join(evidence, name, "result.json")))
      .sort();
    assert.deepEqual(records, ["g-absent", "g-error", "g-green", "g-red"]);

    const byGate = new Map(
      records.map((id) => [
        id,
        JSON.parse(
          readFileSync(join(evidence, id, "result.json"), "utf8"),
        ) as { status: string },
      ]),
    );
    assert.equal(byGate.get("g-green")?.status, "green");
    assert.equal(byGate.get("g-red")?.status, "red");
    assert.equal(byGate.get("g-absent")?.status, "not-applicable");
    assert.equal(byGate.get("g-error")?.status, "error");

    const summary = readSummary(evidence);
    assert.deepEqual(summary.counts, {
      declared: 4,
      applicable: 3,
      verdict: 2,
      green: 1,
      red: 1,
      "not-applicable": 1,
      error: 1,
      vacuous: 0,
    });
    // error is the total, vacuous a strict subset of it (M2R-021).
    const errorRecords = summary.gates.filter((g) => g.status === "error");
    assert.equal(summary.counts["error"], errorRecords.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3: the all-green bundle                                    */
/* ------------------------------------------------------------------ */

test("a manifest of only the green gate exits 0 with applicable 1 and vacuous 0", () => {
  const dir = scratch();
  try {
    const evidence = join(dir, "evidence");
    const manifest = writeManifest(dir, [
      {
        id: "g-green",
        command: writeGate(dir, "green", {
          record: gateRecord("g-green", "green", 3),
          exit: 0,
        }),
        unitLabel: "fixture units",
        applicability: "required",
      },
    ]);
    const result = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      evidence,
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const summary = readSummary(evidence);
    assert.equal(summary.counts["applicable"], 1);
    assert.equal(summary.counts["green"], 1);
    assert.equal(summary.counts["vacuous"], 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4: M2-C-2, the vacuous green, both directions              */
/* ------------------------------------------------------------------ */

test("a gate exiting 0 with units 0 is recorded error and counted vacuous, and units 1 is green", () => {
  const dir = scratch();
  try {
    for (const units of [0, 1]) {
      const evidence = join(dir, `evidence-${String(units)}`);
      const manifest = writeManifest(
        dir,
        [
          {
            id: "g-claim",
            command: writeGate(dir, `claim-${String(units)}`, {
              // The DANGEROUS state: a gate that genuinely exits 0 and
              // genuinely claims green, having examined nothing.
              record: gateRecord("g-claim", "green", units),
              exit: 0,
            }),
            unitLabel: "fixture units",
            applicability: "required",
          },
        ],
        `manifest-${String(units)}.json`,
      );
      const result = runCli([
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        evidence,
      ]);
      const summary = readSummary(evidence);
      const record = JSON.parse(
        readFileSync(join(evidence, "g-claim", "result.json"), "utf8"),
      ) as { status: string; vacuous?: boolean };

      if (units === 0) {
        assert.notEqual(result.status, 0);
        assert.equal(record.status, "error");
        assert.equal(record.vacuous, true);
        assert.equal(summary.counts["vacuous"], 1);
        assert.equal(summary.counts["error"], 1);
        assert.equal(summary.counts["green"], 0);
      } else {
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(record.status, "green");
        assert.equal(summary.counts["vacuous"], 0);
        assert.equal(summary.counts["green"], 1);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: required versus conditional, both directions            */
/* ------------------------------------------------------------------ */

test("a required gate with an unmet precondition is not-applicable and fails the run, conditional does not", () => {
  const dir = scratch();
  try {
    for (const applicability of ["required", "conditional"]) {
      const evidence = join(dir, `evidence-${applicability}`);
      const manifest = writeManifest(
        dir,
        [
          {
            id: "g-green",
            command: writeGate(dir, "green", {
              record: gateRecord("g-green", "green", 1),
              exit: 0,
            }),
            unitLabel: "fixture units",
            applicability: "required",
          },
          {
            id: "g-gated",
            command: writeGate(dir, "gated", {
              record: gateRecord("g-gated", "green", 1),
              exit: 0,
            }),
            unitLabel: "fixture units",
            applicability,
            precondition: {
              id: "needs-config",
              kind: "file-exists",
              path: join(dir, "absent-config.json"),
            },
          },
        ],
        `manifest-${applicability}.json`,
      );
      const result = runCli([
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        evidence,
      ]);
      const summary = readSummary(evidence);
      assert.equal(summary.counts["not-applicable"], 1);
      if (applicability === "required") {
        assert.notEqual(result.status, 0);
        assert.match(summary.reason, /g-gated/);
      } else {
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 6: a precondition that cannot be evaluated is error         */
/* ------------------------------------------------------------------ */

test("a command-exit-zero precondition whose command does not exist is error, never not-applicable", () => {
  const dir = scratch();
  try {
    const evidence = join(dir, "evidence");
    const manifest = writeManifest(dir, [
      {
        id: "g-probe",
        command: writeGate(dir, "probe", {
          record: gateRecord("g-probe", "green", 1),
          exit: 0,
        }),
        unitLabel: "fixture units",
        applicability: "conditional",
        precondition: {
          id: "needs-tool",
          kind: "command-exit-zero",
          command: ["tiphys-no-such-program-9f3a", "--version"],
        },
      },
    ]);
    const result = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      evidence,
    ]);
    assert.notEqual(result.status, 0);
    const record = JSON.parse(
      readFileSync(join(evidence, "g-probe", "result.json"), "utf8"),
    ) as { status: string; detail: string };
    assert.equal(record.status, "error");
    assert.notEqual(record.status, "not-applicable");
    assert.notEqual(record.status, "green");
    assert.match(record.detail, /tiphys-no-such-program-9f3a/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 7: a crash is not a refutation                             */
/* ------------------------------------------------------------------ */

test("a gate that throws and exits 1 without a record is error, not red", () => {
  const dir = scratch();
  try {
    const evidence = join(dir, "evidence");
    const manifest = writeManifest(dir, [
      {
        id: "g-crash",
        // Node exits 1 on an uncaught exception, which collides exactly
        // with the red code. The dangerous state is that collision.
        command: writeGate(dir, "crash", { exit: 1, crash: true }),
        unitLabel: "fixture units",
        applicability: "required",
      },
    ]);
    const result = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      evidence,
    ]);
    assert.notEqual(result.status, 0);
    const summary = readSummary(evidence);
    assert.equal(summary.counts["error"], 1);
    assert.equal(summary.counts["red"], 0);
    const record = JSON.parse(
      readFileSync(join(evidence, "g-crash", "result.json"), "utf8"),
    ) as { status: string; detail: string };
    assert.equal(record.status, "error");
    assert.match(record.detail, /without writing a result record/);
    // The gate really did crash the way the dangerous state requires.
    const stderr = readFileSync(join(evidence, "g-crash", "stderr.txt"), "utf8");
    assert.match(stderr, /uncaught exception inside the fixture gate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 8: a missing run parameter is error, both directions       */
/* ------------------------------------------------------------------ */

function scratchRepo(dir: string): { base: string } {
  const git = (args: string[]) => {
    const result = spawnSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Tiphys test",
        GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
        GIT_COMMITTER_NAME: "Tiphys test",
        GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
      },
    });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(["init", "--quiet", "-b", "main"]);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "start.ts"), "export const start = 1;\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "base"]);
  const base = git(["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "src", "changed.ts"), "export const changed = 2;\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "head"]);
  return { base };
}

test("a diff-touches gate without --base is error and with --base yields its real verdict", () => {
  const dir = scratch();
  try {
    const { base } = scratchRepo(dir);
    const gateCommand = writeGate(dir, "diffgate", {
      record: gateRecord("g-diff", "green", 4),
      exit: 0,
    });
    const manifest = writeManifest(dir, [
      {
        id: "g-diff",
        command: gateCommand,
        unitLabel: "fixture units",
        applicability: "required",
        precondition: {
          id: "touches-src",
          kind: "diff-touches",
          paths: ["src/"],
        },
      },
    ]);

    // DIRECTION 1: no --base. Not evaluable, therefore error, never
    // not-applicable and never green (M2-C-3, M2R-003).
    const without = runCli(
      ["gates", "run", "--manifest", manifest, "--evidence", join(dir, "ev-without")],
      dir,
    );
    assert.notEqual(without.status, 0);
    const withoutRecord = JSON.parse(
      readFileSync(join(dir, "ev-without", "g-diff", "result.json"), "utf8"),
    ) as { status: string; detail: string };
    assert.equal(withoutRecord.status, "error");
    assert.match(withoutRecord.detail, /--base/);

    // DIRECTION 2: with --base, the gate's real verdict.
    const withBase = runCli(
      [
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        join(dir, "ev-with"),
        "--base",
        base,
        "--head",
        "HEAD",
      ],
      dir,
    );
    assert.equal(withBase.status, 0, withBase.stdout + withBase.stderr);
    const withRecord = JSON.parse(
      readFileSync(join(dir, "ev-with", "g-diff", "result.json"), "utf8"),
    ) as { status: string };
    assert.equal(withRecord.status, "green");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 9: zero applicable gates is an error                       */
/* ------------------------------------------------------------------ */

test("a manifest with no gates and a manifest of only not-applicable gates both exit nonzero with no applicable gate", () => {
  const dir = scratch();
  try {
    const empty = writeManifest(dir, [], "empty.json");
    const emptyRun = runCli([
      "gates",
      "run",
      "--manifest",
      empty,
      "--evidence",
      join(dir, "ev-empty"),
    ]);
    assert.notEqual(emptyRun.status, 0);
    assert.equal(readSummary(join(dir, "ev-empty")).reason, "no applicable gate");

    const allGated = writeManifest(
      dir,
      [
        {
          id: "g-one",
          command: writeGate(dir, "one", {
            record: gateRecord("g-one", "green", 1),
            exit: 0,
          }),
          unitLabel: "fixture units",
          applicability: "conditional",
          precondition: {
            id: "needs-a",
            kind: "file-exists",
            path: join(dir, "absent-a.json"),
          },
        },
        {
          id: "g-two",
          command: writeGate(dir, "two", {
            record: gateRecord("g-two", "green", 1),
            exit: 0,
          }),
          unitLabel: "fixture units",
          applicability: "conditional",
          precondition: {
            id: "needs-b",
            kind: "file-exists",
            path: join(dir, "absent-b.json"),
          },
        },
      ],
      "all-gated.json",
    );
    const gatedRun = runCli([
      "gates",
      "run",
      "--manifest",
      allGated,
      "--evidence",
      join(dir, "ev-gated"),
    ]);
    assert.notEqual(gatedRun.status, 0);
    const summary = readSummary(join(dir, "ev-gated"));
    assert.equal(summary.reason, "no applicable gate");
    assert.equal(summary.counts["applicable"], 0);
    assert.equal(summary.counts["not-applicable"], 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 10: the diagnostic contract                                */
/* ------------------------------------------------------------------ */

test("a manifest missing a gate id is rejected naming the field as INVALID with a json pointer", () => {
  const lines = manifestModule.validateManifestDocument({
    version: 1,
    gates: [
      { command: ["node", "x.mjs"], unitLabel: "u", applicability: "required" },
    ],
    destructiveCommands: [],
  });
  assert.deepEqual(lines, [
    "INVALID #/gates/0/id required property id is missing",
  ]);
});

test("a result record with a status outside the enum is rejected as INVALID naming the pointer", () => {
  const lines = manifestModule.validateResultDocument({
    gate: "g-one",
    status: "mostly-fine",
    units: 1,
    unitLabel: "u",
    startedAt: FIXED_START,
    endedAt: FIXED_END,
    detail: "",
    evidence: [],
  });
  assert.deepEqual(lines, [
    'INVALID #/status value "mostly-fine" is not one of the permitted values ' +
      '"green", "red", "not-applicable", "error"',
  ]);
});

test("loading a schema with a keyword outside the closed set fails naming the keyword and validates nothing", () => {
  // `oneOf` is real JSON Schema and this validator does not implement it.
  // Silently ignoring it would report a document valid while never having
  // checked the constraint that mattered.
  const loaded = validateModule.loadSchema(
    {
      type: "object",
      properties: {
        shape: { oneOf: [{ type: "string" }, { type: "number" }] },
      },
    },
    "fixture.schema.json",
  );
  assert.equal(loaded.ok, false);
  assert.match(loaded.ok === false ? loaded.reason : "", /oneOf/);

  // A second, structurally different member of the same class: a keyword at
  // the document root rather than nested, and one that constrains rather
  // than composes.
  const alsoLoaded = validateModule.loadSchema(
    { type: "string", maxLength: 5 },
    "fixture-two.schema.json",
  );
  assert.equal(alsoLoaded.ok, false);
  assert.match(alsoLoaded.ok === false ? alsoLoaded.reason : "", /maxLength/);

  // And the closed set itself still loads, so the refusal is about the
  // keyword and not about loading in general.
  const good = validateModule.loadSchema(
    { type: "object", required: ["a"], properties: { a: { type: "string" } } },
    "fixture-three.schema.json",
  );
  assert.equal(good.ok, true);
});

test("three simultaneous violations produce the same three INVALID lines in the same order across ten runs", () => {
  const document = {
    // 1. version is missing entirely.
    gates: [
      // 2. the gate has no id.
      { command: ["node", "x.mjs"], unitLabel: "u", applicability: "required" },
    ],
    // 3. destructiveCommands is a string where an array is required.
    destructiveCommands: "pool destroy",
  };
  const expected = [
    "INVALID #/destructiveCommands expected type array but found string",
    "INVALID #/gates/0/id required property id is missing",
    "INVALID #/version required property version is missing",
  ];
  // Member 1 of the ordering class: the SCHEMA WALK's own sort, reached by
  // calling the validator directly. Through validateManifestDocument this
  // sort is invisible, because that function re-sorts the merged list, so a
  // test that only went through the manifest path would stay green while the
  // contract's sort was deleted (work history W15b).
  const direct = validateModule.validateToLines(
    manifestModule.manifestSchema(),
    document,
  );
  assert.deepEqual(direct, expected);

  const runs: string[][] = [];
  for (let i = 0; i < 10; i += 1) {
    runs.push(manifestModule.validateManifestDocument(document));
  }
  for (const run of runs) {
    assert.deepEqual(run, expected);
  }

  // THE ORDER IS THE CONTRACT, NOT THE TRAVERSAL, and the fixture above
  // cannot show that on its own: its natural traversal order for the schema
  // walk happens to be #/version, #/destructiveCommands, #/gates/0/id, so
  // only the FINAL SORT produces the expected list. That was established by
  // red-witnessing, not by reading (see the work history's W15).
  //
  // A second, structurally different member, because one witness is not a
  // class: this document's two failures come from DIFFERENT PRODUCERS, the
  // schema walk and the kind-specific precondition check that cannot be
  // expressed in the closed keyword set. They are concatenated in producer
  // order and must come out in pointer order, so the merge sort is what this
  // member measures and the schema walk's own sort cannot supply it.
  const twoProducers = {
    version: 1,
    gates: [
      {
        id: "a-gate",
        command: ["node", "x.mjs"],
        unitLabel: "u",
        applicability: "required",
        precondition: { id: "p", kind: "file-exists" },
      },
      { command: ["node", "y.mjs"], unitLabel: "u", applicability: "required" },
    ],
    destructiveCommands: [],
  };
  const expectedTwo = [
    "INVALID #/gates/0/precondition/path required property path is missing",
    "INVALID #/gates/1/id required property id is missing",
  ];
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(
      manifestModule.validateManifestDocument(twoProducers),
      expectedTwo,
    );
  }
});

test("the compiled entry resolves its schema documents and behaves identically to the source entry", {
  skip: existsSync(distEntry)
    ? false
    : "dist/ is absent; run npm run build first (CI builds before it tests)",
}, () => {
  const dir = scratch();
  try {
    const command = writeGate(dir, "green", {
      record: gateRecord("g-green", "green", 3),
      exit: 0,
    });
    const manifest = writeManifest(dir, [
      {
        id: "g-green",
        command,
        unitLabel: "fixture units",
        applicability: "required",
      },
    ]);
    const fromSource = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      join(dir, "ev-src"),
    ]);
    const fromDist = spawnSync(
      process.execPath,
      [
        distEntry,
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        join(dir, "ev-dist"),
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(fromSource.status, 0, fromSource.stdout + fromSource.stderr);
    assert.equal(fromDist.status, 0, fromDist.stdout + fromDist.stderr);
    assert.equal(fromDist.stdout, fromSource.stdout);
    assert.deepEqual(
      readSummary(join(dir, "ev-dist")).counts,
      readSummary(join(dir, "ev-src")).counts,
    );

    // The compiled entry really is resolving schemas out of dist/, which is
    // the half that would silently break if the build's copy step were
    // dropped: self-check names the documents it validated.
    const selfCheck = spawnSync(
      process.execPath,
      [
        distEntry,
        "gates",
        "self-check",
        "--manifest",
        join(repoRoot, "gates.manifest.json"),
        "--result",
        join(dir, "self-check.json"),
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(selfCheck.status, 0, selfCheck.stdout + selfCheck.stderr);
    assert.match(selfCheck.stdout, /dist[/]src[/]gates[/]schemas/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("npm pack output contains both schema documents", {
  skip: existsSync(distEntry)
    ? false
    : "dist/ is absent; run npm run build first (CI builds before it tests)",
}, () => {
  // --ignore-scripts deliberately: without it npm pack runs prepack, which
  // rebuilds dist/ underneath a suite whose other files are reading it.
  // The listing then describes the dist/ the build produced, which is the
  // artifact the criterion is about.
  const packed = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { encoding: "utf8", cwd: repoRoot },
  );
  assert.equal(packed.status, 0, packed.stderr);
  const listing = JSON.parse(packed.stdout) as { files: { path: string }[] }[];
  const paths = (listing[0]?.files ?? []).map((file) => file.path);
  assert.ok(
    paths.includes("dist/src/gates/schemas/gate-manifest.schema.json"),
    paths.join("\n"),
  );
  assert.ok(
    paths.includes("dist/src/gates/schemas/gate-result.schema.json"),
    paths.join("\n"),
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 12: usage                                                  */
/* ------------------------------------------------------------------ */

test("tiphys gates run with an unknown flag exits 64 with usage on stderr", () => {
  const result = runCli(["gates", "run", "--no-such-flag", "x"]);
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^usage: tiphys gates /m);

  // ISOLATED. The invocation above is missing --manifest and --evidence too,
  // so a runner that ignored unknown flags entirely would still exit 64 by a
  // different route, and this test would guard nothing about unknown flags
  // (work history W23). Here everything required is present and the ONLY
  // fault is the unknown flag.
  const dir = scratch();
  try {
    const manifest = writeManifest(dir, [
      {
        id: "g-green",
        command: writeGate(dir, "green", {
          record: gateRecord("g-green", "green", 1),
          exit: 0,
        }),
        unitLabel: "fixture units",
        applicability: "required",
      },
    ]);
    const complete = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      join(dir, "ev"),
    ]);
    assert.equal(complete.status, 0, complete.stdout + complete.stderr);

    const withExtra = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      join(dir, "ev2"),
      "--no-such-flag",
      "x",
    ]);
    assert.equal(withExtra.status, 64, withExtra.stdout + withExtra.stderr);
    assert.match(withExtra.stderr, /^usage: tiphys gates /m);

    // A value flag with no value is the same class and a different member.
    const danglingValue = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
    ]);
    assert.equal(danglingValue.status, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 13: C-2 and C-3, structurally                              */
/* ------------------------------------------------------------------ */

/**
 * The grep runs over CODE, not prose. A module that explains constraint C-2
 * has to be able to name what it does not do, and a check that a comment
 * defeats is a check nobody can write honestly around. Stripping is
 * deliberately conservative: block comments, and line comments only where
 * the line begins with one, so no code line is ever truncated and the strip
 * cannot manufacture a false negative by eating half a statement.
 *
 * The strip is itself controlled: after stripping, each file must still
 * contain a marker that is definitely code. A stripper that deleted
 * everything would otherwise turn this guard permanently green, which is
 * the failure mode the whole milestone is about.
 */
function codeOnly(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

test("the gate runner uses no pid, process liveness, signals or proc", () => {
  const files = [
    ...readdirSync(join(repoRoot, "src", "gates"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => join(repoRoot, "src", "gates", name)),
    join(repoRoot, "src", "commands", "gates.ts"),
  ];
  assert.ok(
    files.length >= 6,
    `expected the gate modules, found ${String(files.length)}`,
  );
  const forbidden = [
    /detached\s*:/,
    /\bunref\s*\(/,
    /process\.kill/,
    /[/]proc\b/,
    /\bpid\b/,
    /\bkill\s*\(/,
    /SIGTERM|SIGKILL|SIGINT/,
  ];
  for (const file of files) {
    const code = codeOnly(readFileSync(file, "utf8"));
    // The control on the strip: this is code, and it survived.
    assert.match(
      code,
      /export|import/,
      `${file} lost all its code to the comment strip`,
    );
    for (const pattern of forbidden) {
      assert.doesNotMatch(code, pattern, `${file} matched ${String(pattern)}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 16: M2-C-6, three placements, both directions              */
/* ------------------------------------------------------------------ */

test("a named pipe at the manifest path, a precondition target, or a record path is error naming the type and returns", () => {
  const dir = scratch();
  try {
    /* --- Placement 1: the manifest path itself --- */
    const fifoManifest = join(dir, "fifo-manifest.json");
    mkfifo(fifoManifest);
    // Every assertion after this line only executes because the command
    // RETURNED. A runner that opened the pipe would block in the kernel and
    // the harness would report a timeout code instead of a failed assertion.
    const one = runCli([
      "gates",
      "run",
      "--manifest",
      fifoManifest,
      "--evidence",
      join(dir, "ev-1"),
    ]);
    assert.notEqual(one.status, 0);
    assert.match(one.stderr, /fifo-manifest\.json/);
    assert.match(one.stderr, /named pipe/);

    /* --- Placement 2: a file-exists precondition target --- */
    const fifoTarget = join(dir, "fifo-inventory.json");
    mkfifo(fifoTarget);
    const gateCommand = writeGate(dir, "guarded", {
      record: gateRecord("g-guarded", "green", 2),
      exit: 0,
    });
    const gatedManifest = writeManifest(
      dir,
      [
        {
          id: "g-guarded",
          command: gateCommand,
          unitLabel: "fixture units",
          applicability: "required",
          precondition: {
            id: "needs-inventory",
            kind: "file-exists",
            path: fifoTarget,
          },
        },
      ],
      "gated.json",
    );
    const two = runCli([
      "gates",
      "run",
      "--manifest",
      gatedManifest,
      "--evidence",
      join(dir, "ev-2"),
    ]);
    assert.notEqual(two.status, 0);
    const twoRecord = JSON.parse(
      readFileSync(join(dir, "ev-2", "g-guarded", "result.json"), "utf8"),
    ) as { status: string; detail: string };
    assert.equal(twoRecord.status, "error");
    assert.match(twoRecord.detail, /fifo-inventory\.json/);
    assert.match(twoRecord.detail, /named pipe/);

    /* --- Placement 3: the path the gate writes its record to --- */
    const evidence3 = join(dir, "ev-3");
    mkdirSync(join(evidence3, "g-plain"), { recursive: true });
    mkfifo(join(evidence3, "g-plain", "result.json"));
    const plainManifest = writeManifest(
      dir,
      [
        {
          id: "g-plain",
          command: writeGate(dir, "plain", {
            record: gateRecord("g-plain", "green", 2),
            exit: 0,
          }),
          unitLabel: "fixture units",
          applicability: "required",
        },
      ],
      "plain.json",
    );
    const three = runCli([
      "gates",
      "run",
      "--manifest",
      plainManifest,
      "--evidence",
      evidence3,
    ]);
    assert.notEqual(three.status, 0);
    const summary3 = readSummary(evidence3);
    assert.equal(summary3.counts["error"], 1);
    assert.match(summary3.gates[0]?.detail ?? "", /named pipe/);
    assert.match(summary3.gates[0]?.detail ?? "", /result\.json/);

    /* --- BOTH DIRECTIONS: the same three paths as regular files --- */
    rmSync(fifoManifest);
    rmSync(fifoTarget);
    writeFileSync(fifoTarget, "{}\n");
    rmSync(join(evidence3, "g-plain", "result.json"));

    const twoAgain = runCli([
      "gates",
      "run",
      "--manifest",
      gatedManifest,
      "--evidence",
      join(dir, "ev-2b"),
    ]);
    assert.equal(twoAgain.status, 0, twoAgain.stdout + twoAgain.stderr);

    const threeAgain = runCli([
      "gates",
      "run",
      "--manifest",
      plainManifest,
      "--evidence",
      evidence3,
    ]);
    assert.equal(threeAgain.status, 0, threeAgain.stdout + threeAgain.stderr);

    // Placement 1's other direction: a real manifest file at a real path.
    const oneAgain = runCli([
      "gates",
      "run",
      "--manifest",
      plainManifest,
      "--evidence",
      join(dir, "ev-1b"),
    ]);
    assert.equal(oneAgain.status, 0, oneAgain.stdout + oneAgain.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Step 9: the CI wiring, guarded BEHAVIOURALLY                         */
/* ------------------------------------------------------------------ */

/**
 * MECHANISMS.md, "Asserting a CI step is wired": assert BEHAVIOUR, not
 * text. A text assertion catches deletion and misses defanging, and M1-P6
 * paid four rounds for six confirmed instances of exactly that (`exit 1`
 * changed to `exit 0`, two placements of `|| true`, a step-level
 * `if: false`, a quoted YAML key, and the step moved into a job the fan-in
 * does not need).
 *
 * So the step's own command is EXTRACTED from the workflow and EXECUTED,
 * and the assertions are on what it does. Two structurally different
 * dangerous states redden this test:
 *
 *   (a) the step is deleted: the extraction finds fewer than two bundle
 *       steps and the count assertion fails;
 *   (b) the step's text is PRESERVED and its meaning inverted, for example
 *       `|| true` appended inside the folded block or `exit 0` added: the
 *       command still contains every string a text assertion would look
 *       for, and the falsifiability arm below goes green, which fails.
 *
 * The extraction itself is controlled rather than trusted: the extracted
 * string must still be the runner invocation, because an extractor that
 * silently returned "" would make this test pass over nothing at all.
 *
 * WHAT THIS DOES NOT COVER, stated rather than implied. It does not read
 * GitHub's evaluation of `if:`, job-level or workflow-level `defaults`,
 * `continue-on-error`, or branch protection; none of those is readable from
 * this tree. Criterion 14's check-run and ruleset evidence is the API-side
 * half and is CI-deferred (`gh` is absent locally, CLAUDE.md warning 6).
 */
function bundleStepCommands(): string[] {
  const yaml = readFileSync(
    fileURLToPath(new URL("../.github/workflows/gates.yml", import.meta.url)),
    "utf8",
  ).split("\n");
  const commands: string[] = [];
  for (let i = 0; i < yaml.length; i += 1) {
    const line = yaml[i] as string;
    if (!/^\s*- name: M2 gate bundle /.test(line)) {
      continue;
    }
    const stepIndent = (/^(\s*)- /.exec(line)?.[1] ?? "").length;
    let command: string | undefined;
    for (let j = i + 1; j < yaml.length; j += 1) {
      const inner = yaml[j] as string;
      const indent = inner.search(/\S/);
      if (indent !== -1 && indent <= stepIndent) {
        break;
      }
      if (!/^\s*run: >\s*$/.test(inner)) {
        continue;
      }
      const parts: string[] = [];
      for (let k = j + 1; k < yaml.length; k += 1) {
        const folded = yaml[k] as string;
        const foldedIndent = folded.search(/\S/);
        if (foldedIndent === -1 || foldedIndent <= stepIndent) {
          break;
        }
        parts.push(folded.trim());
      }
      command = parts.join(" ");
      break;
    }
    if (command !== undefined) {
      commands.push(command);
    }
  }
  return commands;
}

test("the workflow's gate bundle step runs the gate runner and is able to fail", {
  skip: existsSync(distEntry)
    ? false
    : "dist/ is absent; run npm run build first (CI builds before it tests)",
}, () => {
  const commands = bundleStepCommands();
  // Dangerous state (a): a deleted step lands here.
  assert.equal(
    commands.length,
    2,
    `expected the pull-request and push bundle steps, found ${String(commands.length)}`,
  );
  // The control on the extractor, not the guard: an extractor that
  // returned nothing would otherwise make everything below vacuous.
  for (const command of commands) {
    assert.match(command, /node dist[/]bin[/]tiphys\.js gates run/);
    assert.match(command, /--manifest gates\.manifest\.json/);
  }

  const dir = scratch();
  try {
    const push = commands.find((c) => !c.includes("--base")) as string;
    assert.ok(push, "no push-event bundle step (the one with no --base)");

    // 1. The step, executed. It must pass on this repository, or the wiring
    //    would redden every honest run.
    const temp = join(dir, "temp");
    mkdirSync(temp, { recursive: true });
    const green = spawnSync(
      "bash",
      ["-c", push.replaceAll("${{ runner.temp }}", temp)],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(green.status, 0, green.stdout + green.stderr);
    const summary = readSummary(join(temp, "gate-evidence"));
    assert.ok(
      summary.counts["green"] >= 1,
      `the wired bundle measured nothing: ${JSON.stringify(summary.counts)}`,
    );

    // 2. FALSIFIABILITY. Dangerous state (b) lands here: the same extracted
    //    command pointed at a manifest that cannot pass must FAIL the step.
    //    A `|| true` or an appended `exit 0` preserves every string in the
    //    command and makes this arm green.
    const emptyManifest = writeManifest(dir, [], "empty.json");
    const temp2 = join(dir, "temp2");
    mkdirSync(temp2, { recursive: true });
    const red = spawnSync(
      "bash",
      [
        "-c",
        push
          .replaceAll("${{ runner.temp }}", temp2)
          .replace("gates.manifest.json", emptyManifest),
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.notEqual(
      red.status,
      0,
      `the wired bundle step exited 0 over a manifest with no gates: ${red.stdout}${red.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M2-C-2 at the constructor, and the exit-code/status seam             */
/* ------------------------------------------------------------------ */

/**
 * The rewrite is enforced TWICE on purpose: here, so a gate built on this
 * module cannot construct a vacuous green, and again at the runner's ingest,
 * so a gate that does not use this module cannot smuggle one past it. Two
 * enforcement points need two witnesses, or one of them is an arm no test
 * reaches (T-006).
 */
test("makeGateResult cannot construct a green record with zero units", () => {
  const vacuous = resultModule.makeGateResult({
    gate: "g-one",
    status: "green",
    units: 0,
    unitLabel: "u",
    startedAt: FIXED_START,
    endedAt: FIXED_END,
    detail: "everything is fine",
  });
  assert.equal(vacuous.status, "error");
  assert.equal(vacuous.vacuous, true);
  assert.match(vacuous.detail, /M2-C-2/);
  // The gate's own claim survives in the record rather than being discarded.
  assert.match(vacuous.detail, /everything is fine/);

  // BOTH DIRECTIONS: one unit examined is a green the constructor keeps.
  const real = resultModule.makeGateResult({
    gate: "g-one",
    status: "green",
    units: 1,
    unitLabel: "u",
    startedAt: FIXED_START,
    endedAt: FIXED_END,
    detail: "",
  });
  assert.equal(real.status, "green");
  assert.equal(real.vacuous, undefined);

  // A negative or fractional count is not a smaller measurement, it is an
  // unusable one, and is treated as zero rather than as a green.
  for (const units of [-3, 0.5]) {
    const bad = resultModule.makeGateResult({
      gate: "g-one",
      status: "green",
      units,
      unitLabel: "u",
      startedAt: FIXED_START,
      endedAt: FIXED_END,
      detail: "",
    });
    assert.equal(bad.status, "error", `units ${String(units)} produced ${bad.status}`);
  }
});

test("a gate whose exit code contradicts its own record is error naming both", () => {
  const dir = scratch();
  try {
    const evidence = join(dir, "evidence");
    const manifest = writeManifest(dir, [
      {
        id: "g-liar",
        // The dangerous state: a record that says red while the process
        // says green. Trusting either one alone reports a verdict nobody
        // measured, and trusting the record alone reports RED as a finding
        // when the gate may simply have crashed after writing it.
        command: writeGate(dir, "liar", {
          record: gateRecord("g-liar", "red", 2),
          exit: 0,
        }),
        unitLabel: "fixture units",
        applicability: "required",
      },
    ]);
    const result = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      evidence,
    ]);
    assert.notEqual(result.status, 0);
    const record = JSON.parse(
      readFileSync(join(evidence, "g-liar", "result.json"), "utf8"),
    ) as { status: string; detail: string };
    assert.equal(record.status, "error");
    assert.match(record.detail, /recorded status red/);
    assert.match(record.detail, /exited 0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The DECLARED-parameter arm, which is a different code path from the
 * precondition-derived one and was found by red-witnessing rather than by
 * reading: defanging `requiredParameters` left the `diff-touches` test green,
 * because `evaluatePrecondition` re-checks `--base` for its own reasons. The
 * property survived; the mechanism was unwitnessed. A gate that declares it
 * needs `--phase` and has no precondition at all reaches only the first
 * guard, and this is that gate.
 */
test("a gate declaring a run parameter it does not receive is error, and receives it otherwise", () => {
  const dir = scratch();
  try {
    const command = writeGate(dir, "phased", {
      record: gateRecord("g-phased", "green", 2),
      exit: 0,
    });
    const manifest = writeManifest(dir, [
      {
        id: "g-phased",
        command,
        unitLabel: "fixture units",
        applicability: "required",
        parameters: ["phase"],
      },
    ]);

    const without = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      join(dir, "ev-without"),
    ]);
    assert.notEqual(without.status, 0);
    const withoutRecord = JSON.parse(
      readFileSync(join(dir, "ev-without", "g-phased", "result.json"), "utf8"),
    ) as { status: string; detail: string };
    assert.equal(withoutRecord.status, "error");
    assert.notEqual(withoutRecord.status, "not-applicable");
    assert.match(withoutRecord.detail, /--phase/);

    const withPhase = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      join(dir, "ev-with"),
      "--phase",
      "M2-P1",
    ]);
    assert.equal(withPhase.status, 0, withPhase.stdout + withPhase.stderr);

    // And the value really reached the gate's argv, rather than the runner
    // merely having satisfied itself that it was present.
    const passed = readFileSync(join(dir, "ev-with", "g-phased", "stdout.txt"), "utf8");
    assert.equal(passed, "");
    const withRecord = JSON.parse(
      readFileSync(join(dir, "ev-with", "g-phased", "result.json"), "utf8"),
    ) as { status: string };
    assert.equal(withRecord.status, "green");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ================================================================== */
/* FIX ROUND 1                                                        */
/* ================================================================== */

/**
 * CR-800 (HIGH). The two routes to `not-applicable` were guarded
 * differently: a precondition the RUNNER evaluated failed closed, and a gate
 * that declared its OWN not-applicable did not, because `counts.applicable`
 * meant "was spawned". A bundle in which zero gates were green exited 0 with
 * the reason "every applicable gate is green".
 *
 * Three structurally different members, because one witness is not a class,
 * and the missing second member is exactly what found the defect. Both
 * controls are here too, so this is not a restatement of "nonzero is
 * nonzero".
 */
test("a gate that declares its own not-applicable cannot make the bundle green", () => {
  const dir = scratch();
  try {
    const selfNotApplicable = writeGate(dir, "selfna", {
      record: gateRecord("selfna", "not-applicable", 0),
      exit: 20,
    });
    const selfGreen = writeGate(dir, "selfgreen", {
      record: gateRecord("selfna", "green", 1),
      exit: 0,
    });

    // MEMBER 1: a single conditional gate, not-applicable by its own record.
    for (const applicability of ["conditional", "required"]) {
      const manifest = writeManifest(
        dir,
        [
          {
            id: "selfna",
            command: selfNotApplicable,
            unitLabel: "fixture units",
            applicability,
          },
        ],
        `m-self-${applicability}.json`,
      );
      const result = runCli([
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        join(dir, `ev-self-${applicability}`),
      ]);
      assert.notEqual(
        result.status,
        0,
        `${applicability}: a bundle with zero green gates exited 0`,
      );
      const summary = readSummary(join(dir, `ev-self-${applicability}`));
      assert.equal(summary.reason, "no applicable gate");
      assert.equal(summary.counts["verdict"], 0);
      assert.equal(summary.counts["applicable"], 0);
      assert.equal(summary.gates[0]?.applicable, false);
      assert.doesNotMatch(summary.reason, /every applicable gate is green/);
    }

    // CONTROL A: the SAME gate reporting green with one unit. If this were
    // not distinguishable by exit code, the member above would prove nothing.
    const greenManifest = writeManifest(
      dir,
      [
        {
          id: "selfna",
          command: selfGreen,
          unitLabel: "fixture units",
          applicability: "conditional",
        },
      ],
      "m-self-green.json",
    );
    const greenRun = runCli([
      "gates",
      "run",
      "--manifest",
      greenManifest,
      "--evidence",
      join(dir, "ev-self-green"),
    ]);
    assert.equal(greenRun.status, 0, greenRun.stdout + greenRun.stderr);
    assert.equal(readSummary(join(dir, "ev-self-green")).counts["verdict"], 1);

    // MEMBER 2: a mixed bundle exercising BOTH routes at once, which is the
    // shape a real manifest has.
    const mixed = writeManifest(
      dir,
      [
        {
          id: "runner-na",
          command: selfGreen,
          unitLabel: "fixture units",
          applicability: "conditional",
          precondition: {
            id: "needs-config",
            kind: "file-exists",
            path: join(dir, "absent-config.json"),
          },
        },
        {
          id: "selfna",
          command: selfNotApplicable,
          unitLabel: "fixture units",
          applicability: "conditional",
        },
      ],
      "m-mixed.json",
    );
    const mixedRun = runCli([
      "gates",
      "run",
      "--manifest",
      mixed,
      "--evidence",
      join(dir, "ev-mixed"),
    ]);
    assert.notEqual(mixedRun.status, 0);
    const mixedSummary = readSummary(join(dir, "ev-mixed"));
    assert.equal(mixedSummary.reason, "no applicable gate");
    assert.equal(mixedSummary.counts["not-applicable"], 2);
    assert.equal(mixedSummary.counts["verdict"], 0);
    // The two routes are now indistinguishable in the summary, which is the
    // property that was missing.
    for (const row of mixedSummary.gates) {
      assert.equal(row.applicable, false, `${row.id} counted as applicable`);
    }
    assert.equal(
      mixedSummary.gates.reduce((total, row) => total + row.units, 0),
      0,
    );

    // MEMBER 3: the same through --only, a different selection path.
    const onlyRun = runCli([
      "gates",
      "run",
      "--manifest",
      mixed,
      "--evidence",
      join(dir, "ev-only"),
      "--only",
      "selfna",
    ]);
    assert.notEqual(onlyRun.status, 0);
    assert.equal(readSummary(join(dir, "ev-only")).reason, "no applicable gate");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The structural half of CR-800: the success path is asserted, not merely
 * unreachable by reading. CR-800 WAS a reading of the branch conditions that
 * turned out not to hold, so the code now checks the invariant it depends on.
 */
test("the runner cannot report success over an empty green bucket", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/gates/run.ts", import.meta.url)),
    "utf8",
  );
  // The success reason exists in exactly one place and is guarded by an
  // explicit invariant check that names counts.green.
  assert.match(source, /exitCode === EXIT_GREEN && counts\.green === 0/);
  assert.match(source, /counts\.vacuous > counts\.error/);
  // And the anti-vacuity branch consults `verdict`, never `applicable`.
  assert.match(source, /else if \(counts\.verdict === 0\)/);
  assert.doesNotMatch(source, /else if \(counts\.applicable === 0\)/);
});

/**
 * CR-801 (MEDIUM). Node's uncaught-exception exit code is 1, which is this
 * phase's own RED code. The runner enforced that rule on its gates and not on
 * itself: an escaping throw exited 1, wrote no summary, and mid-bundle left a
 * gate-authored GREEN record on disk with nothing to say the run had died.
 *
 * Staged against a COPY of dist/, never the repository's own, so a suite
 * running its files in parallel cannot see a half-deleted build.
 */
function stagedDist(dir: string): string {
  const copy = join(dir, "dist");
  cpSync(join(repoRoot, "dist"), copy, { recursive: true });
  return copy;
}

test("a throw escaping the runner is error with a summary, never the red exit code", {
  skip: existsSync(distEntry)
    ? false
    : "dist/ is absent; run npm run build first (CI builds before it tests)",
}, () => {
  const dir = scratch();
  try {
    const dist = stagedDist(dir);
    const manifest = writeManifest(
      dir,
      [
        {
          id: "g-one",
          command: writeGate(dir, "one", {
            record: gateRecord("g-one", "green", 3),
            exit: 0,
          }),
          unitLabel: "u",
          applicability: "required",
        },
        {
          id: "g-two",
          command: writeGate(dir, "two", {
            record: gateRecord("g-two", "green", 4),
            exit: 0,
          }),
          unitLabel: "u",
          applicability: "required",
        },
      ],
      "m-two.json",
    );

    // MEMBER 1: the throw happens during the manifest load, before any gate.
    rmSync(join(dist, "src", "gates", "schemas", "gate-manifest.schema.json"));
    const early = spawnSync(
      process.execPath,
      [
        join(dist, "bin", "tiphys.js"),
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        join(dir, "ev-early"),
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(early.status, 21, `expected 21, got ${String(early.status)}`);
    assert.notEqual(early.status, 1, "the runner exited with its own RED code");
    const earlySummary = readSummary(join(dir, "ev-early"));
    assert.equal(earlySummary.aborted, true);
    assert.equal(earlySummary.exitCode, 21);

    // MEMBER 2: structurally different. The throw happens MID-BUNDLE, after
    // gate one has already written a green record, which is the shape that
    // leaves a misleading bundle behind.
    const dist2 = join(dir, "dist2");
    cpSync(join(repoRoot, "dist"), dist2, { recursive: true });
    rmSync(join(dist2, "src", "gates", "schemas", "gate-result.schema.json"));
    const mid = spawnSync(
      process.execPath,
      [
        join(dist2, "bin", "tiphys.js"),
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        join(dir, "ev-mid"),
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(mid.status, 21, `expected 21, got ${String(mid.status)}`);
    // The gate's own green record is on disk; the summary is what tells a
    // consumer not to read the bundle as a result.
    assert.ok(existsSync(join(dir, "ev-mid", "g-one", "result.json")));
    const midSummary = readSummary(join(dir, "ev-mid"));
    assert.equal(midSummary.aborted, true);
    assert.equal(midSummary.counts["green"], 0);
    assert.match(midSummary.reason, /the gate runner failed/);

    // CONTROL: the same invocation against an INTACT dist copy. Without it
    // this test would pass over a runner that always exited 21.
    cpSync(join(repoRoot, "dist"), join(dir, "dist3"), { recursive: true });
    const okRun = spawnSync(
      process.execPath,
      [
        join(dir, "dist3", "bin", "tiphys.js"),
        "gates",
        "run",
        "--manifest",
        manifest,
        "--evidence",
        join(dir, "ev-ok2"),
      ],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(okRun.status, 0, okRun.stdout + okRun.stderr);
    assert.equal(readSummary(join(dir, "ev-ok2")).aborted, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-803 (MEDIUM). Two runners pointed at one `--evidence` directory used to
 * interleave on fixed per-gate paths: the later runner ingested the earlier
 * one's records as its own, and a genuine red was converted to `error` while
 * the surviving bundle was the other run's green. Seven phases run this
 * concurrently.
 *
 * Two structurally different members: a claim already present (the
 * deterministic shape, which is also what a crashed run leaves), and a real
 * concurrent second runner started while the first is still working.
 */
test("one run owns its evidence directory and a second is refused loudly", async () => {
  const dir = scratch();
  try {
    const fast = writeManifest(
      dir,
      [
        {
          id: "g-fast",
          command: writeGate(dir, "fast", {
            record: gateRecord("g-fast", "green", 5),
            exit: 0,
          }),
          unitLabel: "u",
          applicability: "required",
        },
      ],
      "fast.json",
    );

    // MEMBER 1: a claim is already there. This is also exactly what a run
    // that died leaves behind, and the rule MECHANISMS.md fixes for claim
    // files is that it must fail LOUDLY and NAME THE STUCK FILE, never wait
    // silently and never steal.
    const held = join(dir, "ev-held");
    mkdirSync(held, { recursive: true });
    writeFileSync(
      join(held, ".tiphys-gate-run.json"),
      '{"runId":"aaaaaaaaaaaa","manifest":"other"}\n',
    );
    const refused = runCli([
      "gates",
      "run",
      "--manifest",
      fast,
      "--evidence",
      held,
    ]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /already claimed by another run/);
    assert.match(refused.stderr, /\.tiphys-gate-run\.json/);
    assert.match(refused.stderr, /aaaaaaaaaaaa/);
    assert.ok(
      !existsSync(join(held, "g-fast")),
      "the refused run wrote into a directory it did not own",
    );

    // CONTROL: remove the claim and the same invocation succeeds, so the
    // refusal is about the claim and not about the directory.
    rmSync(join(held, ".tiphys-gate-run.json"));
    const allowed = runCli([
      "gates",
      "run",
      "--manifest",
      fast,
      "--evidence",
      held,
    ]);
    assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
    assert.ok(
      !existsSync(join(held, ".tiphys-gate-run.json")),
      "the claim was not released at the end of the run",
    );

    // MEMBER 2: a genuinely concurrent second runner, which is the shape the
    // review constructed. The first holds a slow gate; the second must be
    // refused rather than interleaving with it.
    const slow = writeManifest(
      dir,
      [
        {
          id: "g-slow",
          command: writeGate(dir, "slow", {
            record: gateRecord("g-slow", "green", 9),
            exit: 0,
            sleepMs: 3000,
          }),
          unitLabel: "u",
          applicability: "required",
        },
      ],
      "slow.json",
    );
    const shared = join(dir, "ev-shared");
    const first = spawn(
      process.execPath,
      [sourceEntry, "gates", "run", "--manifest", slow, "--evidence", shared],
      { cwd: repoRoot, stdio: "ignore" },
    );
    const firstExit = new Promise<number>((resolve) => {
      first.on("exit", (code) => resolve(code ?? -1));
    });
    // Wait for the claim to exist, so the contention is real rather than a
    // race this test also has to win. Bounded, so a failure reports.
    const deadline = Date.now() + 10_000;
    while (
      !existsSync(join(shared, ".tiphys-gate-run.json")) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      existsSync(join(shared, ".tiphys-gate-run.json")),
      "the first runner never took its claim",
    );
    const second = runCli([
      "gates",
      "run",
      "--manifest",
      fast,
      "--evidence",
      shared,
    ]);
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /already claimed by another run/);

    assert.equal(await firstExit, 0);
    // The surviving bundle is the first run's, entirely, and says so.
    const summary = readSummary(shared);
    assert.equal(summary.gates.length, 1);
    assert.equal(summary.gates[0]?.id, "g-slow");
    assert.equal(summary.gates[0]?.units, 9);
    assert.match(summary.runId, /^[0-9a-f]{24}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-804 part two (MEDIUM). M2-C-5 was enforced entirely by each gate's own
 * honesty: the runner held both the record's pins and the module that
 * compares them and did nothing with either, two lines from where it applies
 * the structurally identical M2-C-2 rewrite to `units`.
 */
function pinFor(files: { path: string; sha: string; mtime: number }[]) {
  return {
    roots: ["/scratch/src"],
    takenAt: "2026-08-06T00:00:00.000Z",
    fileCount: files.length,
    files: files.map((file) => ({
      path: file.path,
      sha256: file.sha,
      size: 10,
      mtimeMs: file.mtime,
      ctimeMs: file.mtime,
    })),
  };
}

test("a green record whose pins disagree, or whose pin measured nothing, is error", () => {
  const dir = scratch();
  try {
    const sha = "a".repeat(64);
    const cases: { name: string; pin: unknown; expect: string }[] = [
      {
        name: "changed",
        pin: {
          start: pinFor([{ path: "/scratch/src/a.ts", sha, mtime: 1 }]),
          end: pinFor([{ path: "/scratch/src/a.ts", sha, mtime: 2 }]),
        },
        expect: "error",
      },
      {
        name: "empty",
        pin: { start: pinFor([]), end: pinFor([]) },
        expect: "error",
      },
      {
        name: "equal",
        pin: {
          start: pinFor([{ path: "/scratch/src/a.ts", sha, mtime: 1 }]),
          end: pinFor([{ path: "/scratch/src/a.ts", sha, mtime: 1 }]),
        },
        expect: "green",
      },
    ];
    for (const item of cases) {
      const record = { ...gateRecord("g-pinned", "green", 4), pin: item.pin };
      const manifest = writeManifest(
        dir,
        [
          {
            id: "g-pinned",
            command: writeGate(dir, `pinned-${item.name}`, {
              record,
              exit: 0,
            }),
            unitLabel: "u",
            applicability: "required",
          },
        ],
        `m-pin-${item.name}.json`,
      );
      const evidence = join(dir, `ev-pin-${item.name}`);
      runCli(["gates", "run", "--manifest", manifest, "--evidence", evidence]);
      const written = JSON.parse(
        readFileSync(join(evidence, "g-pinned", "result.json"), "utf8"),
      ) as { status: string; detail: string };
      assert.equal(
        written.status,
        item.expect,
        `${item.name}: ${written.detail}`,
      );
      if (item.expect === "error") {
        assert.match(written.detail, /M2-C-5/);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-805 (MEDIUM). `branch-matches` was unanchored and interpolated `{phase}`
 * unescaped into regex SOURCE, and the kind had no test at all. Two members:
 * a decoy branch that is a superstring of the real one, and a phase id
 * carrying a regex metacharacter. Two controls, because the anchoring change
 * could otherwise have made every branch fail to match, which would be
 * "safe" and useless.
 */
test("branch-matches is anchored and treats the phase id as a literal", () => {
  const dir = scratch();
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo, { recursive: true });
    const git = (args: string[]) => {
      const result = spawnSync("git", args, {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Tiphys test",
          GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
          GIT_COMMITTER_NAME: "Tiphys test",
          GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
        },
      });
      assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    };
    git(["init", "--quiet", "-b", "claude/m2-p4-scope-auditor"]);
    writeFileSync(join(repo, "f"), "x\n");
    git(["add", "-A"]);
    git(["commit", "--quiet", "-m", "base"]);

    const manifest = writeManifest(
      dir,
      [
        {
          id: "scope",
          command: writeGate(dir, "scope", {
            record: gateRecord("scope", "green", 1),
            exit: 0,
          }),
          unitLabel: "u",
          applicability: "conditional",
          precondition: {
            id: "on-phase-branch",
            kind: "branch-matches",
            // Anchored, so a prefix rule needs its own .* (schema description).
            pattern: "claude/{phase}-.*",
          },
        },
      ],
      "m-branch.json",
    );

    const statusOn = (branch: string, phase: string): string => {
      git(["branch", "--quiet", "-m", branch]);
      const evidence = join(dir, `ev-${branch.replace(/[^a-z0-9]/gi, "_")}-${phase}`);
      spawnSync(
        process.execPath,
        [
          sourceEntry,
          "gates",
          "run",
          "--manifest",
          manifest,
          "--evidence",
          evidence,
          "--phase",
          phase,
        ],
        { cwd: repo, encoding: "utf8" },
      );
      return readSummary(evidence).gates[0]?.status ?? "missing";
    };

    // CONTROL 1: the real phase branch must still match, or the fix is a
    // guard that refuses everything.
    assert.equal(statusOn("claude/m2-p4-scope-auditor", "m2-p4"), "green");
    // MEMBER 1: a decoy branch that CONTAINS the pattern.
    assert.equal(
      statusOn("evil/claude/m2-p4-scope-auditor-DECOY", "m2-p4"),
      "not-applicable",
    );
    // MEMBER 2: a phase id carrying a regex metacharacter, against a branch
    // that only matches if the dot is a wildcard.
    assert.equal(statusOn("claude/m2xp4-scope", "m2.p4"), "not-applicable");
    // CONTROL 2: the same phase id against the branch it literally names.
    assert.equal(statusOn("claude/m2.p4-scope", "m2.p4"), "green");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-806 (LOW). `vacuous` exists to be set by the two rewrite points and by
 * nothing else. A gate that wrote it on a GREEN record was believed, and the
 * runner is documented as adversarial towards its own gates.
 */
test("a gate cannot set the vacuous flag on its own record", () => {
  const dir = scratch();
  try {
    const evidence = join(dir, "ev");
    const record = { ...gateRecord("g-liar", "green", 7), vacuous: true };
    const manifest = writeManifest(dir, [
      {
        id: "g-liar",
        command: writeGate(dir, "liar", { record, exit: 0 }),
        unitLabel: "u",
        applicability: "required",
      },
    ]);
    const result = runCli([
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      evidence,
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const summary = readSummary(evidence);
    assert.equal(summary.counts["vacuous"], 0);
    assert.ok(summary.counts["vacuous"] <= summary.counts["error"]);
    const written = JSON.parse(
      readFileSync(join(evidence, "g-liar", "result.json"), "utf8"),
    ) as { vacuous?: boolean };
    assert.equal(written.vacuous, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * CR-802, CR-807, CR-808 (the Ajv seam). Each is a place where this engine
 * and Ajv at Draft 2020-12 disagree, and DR-0013 clause 6 promises M3-P1 can
 * swap the engine and re-run these tests unchanged.
 */
test("the validator refuses $ref siblings, reports $ref cycles, and rejects __proto__", () => {
  // CR-802, two structurally different siblings.
  for (const sibling of [
    { required: ["mustBeThere"] },
    { enum: ["a", "b"] },
  ]) {
    const loaded = validateModule.loadSchema(
      {
        type: "object",
        properties: { x: { $ref: "#/$defs/s", ...sibling } },
        $defs: { s: { type: "object" } },
      },
      "sibling.schema.json",
    );
    assert.equal(loaded.ok, false, JSON.stringify(sibling));
    assert.match(
      loaded.ok === false ? loaded.reason : "",
      new RegExp(Object.keys(sibling)[0] as string),
    );
  }
  // CONTROL: a bare $ref with only annotations beside it still loads.
  const bare = validateModule.loadSchema(
    {
      type: "object",
      properties: { x: { $ref: "#/$defs/s", description: "fine" } },
      $defs: { s: { type: "string" } },
    },
    "bare.schema.json",
  );
  assert.equal(bare.ok, true);
  assert.deepEqual(
    bare.ok === true
      ? validateModule.validateToLines(bare.schema, { x: 1 })
      : [],
    ["INVALID #/x expected type string but found integer"],
  );

  // CR-807: a cycle is a diagnostic, not a RangeError escaping mid-run.
  const cyclic = validateModule.loadSchema(
    { properties: { x: { $ref: "#/$defs/a" } }, $defs: { a: { $ref: "#/$defs/a" } } },
    "cyclic.schema.json",
  );
  assert.equal(cyclic.ok, true);
  assert.deepEqual(
    cyclic.ok === true
      ? validateModule.validateToLines(cyclic.schema, { x: 1 })
      : [],
    ["INVALID #/x schema reference #/$defs/a is cyclic"],
  );

  // CONTROL: a schema that is recursive but consumes an instance node
  // between follows is legitimate and must still validate.
  const recursive = validateModule.loadSchema(
    {
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" }, child: { $ref: "#" } },
    },
    "recursive.schema.json",
  );
  assert.equal(recursive.ok, true);
  assert.deepEqual(
    recursive.ok === true
      ? validateModule.validateToLines(recursive.schema, {
          name: "a",
          child: { name: "b", child: { name: 3 } },
        })
      : [],
    ["INVALID #/child/child/name expected type string but found integer"],
  );

  // CR-808: __proto__ must not escape additionalProperties: false.
  const strict = validateModule.loadSchema(
    {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "string" } },
    },
    "strict.schema.json",
  );
  assert.equal(strict.ok, true);
  assert.deepEqual(
    strict.ok === true
      ? validateModule.validateToLines(
          strict.schema,
          JSON.parse('{"__proto__":1,"other":2}'),
        )
      : [],
    [
      "INVALID #/__proto__ property __proto__ is not permitted here",
      "INVALID #/other property other is not permitted here",
    ],
  );

  // A schema pattern that cannot compile is a LOAD failure with a reason,
  // not a throw escaping mid-validation (the CR-801 asymmetry).
  const badPattern = validateModule.loadSchema(
    { type: "string", pattern: "([" },
    "bad-pattern.schema.json",
  );
  assert.equal(badPattern.ok, false);
  assert.match(
    badPattern.ok === false ? badPattern.reason : "",
    /not a valid expression/,
  );
});

/** CR-811: every diagnostic message comes from the one table. */
test("the duplicate-id diagnostic comes from the message table", () => {
  const lines = manifestModule.validateManifestDocument({
    version: 1,
    gates: [
      { id: "twice", command: ["node", "x"], unitLabel: "u", applicability: "required" },
      { id: "twice", command: ["node", "y"], unitLabel: "u", applicability: "required" },
    ],
    destructiveCommands: [],
  });
  assert.deepEqual(lines, [
    'INVALID #/gates/1/id gate id "twice" is declared more than once',
  ]);
  const source = readFileSync(
    fileURLToPath(new URL("../src/gates/manifest.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(source, /is declared more than once`/);
});

/** CR-812: units counts what its label says it counts. */
test("manifest-self-check reports one unit per schema document", () => {
  const dir = scratch();
  try {
    const result = runCli([
      "gates",
      "self-check",
      "--manifest",
      join(repoRoot, "gates.manifest.json"),
      "--result",
      join(dir, "r.json"),
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const record = JSON.parse(readFileSync(join(dir, "r.json"), "utf8")) as {
      units: number;
      unitLabel: string;
      detail: string;
    };
    assert.equal(record.unitLabel, "schema documents validated");
    const schemas = readdirSync(
      fileURLToPath(new URL("../src/gates/schemas", import.meta.url)),
    ).filter((name) => name.endsWith(".schema.json"));
    assert.equal(record.units, schemas.length);
    assert.ok(record.units > 0);
    // The manifest validation is real work and is still reported.
    assert.match(record.detail, /gates\.manifest\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
