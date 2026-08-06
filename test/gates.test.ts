import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
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
  counts: Record<string, number>;
  reason: string;
  exitCode: number;
  gates: { id: string; status: string; detail: string; vacuous: boolean }[];
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
  const runs: string[][] = [];
  for (let i = 0; i < 10; i += 1) {
    runs.push(manifestModule.validateManifestDocument(document));
  }
  for (const run of runs) {
    assert.deepEqual(run, expected);
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
