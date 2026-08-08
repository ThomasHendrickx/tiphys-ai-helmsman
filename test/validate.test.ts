/**
 * THE ENGINE POLICY TESTS (kernel plan M3, M3-P1 step 11; DR-0013 criteria 4,
 * 5, 6, 7, 8, 9), plus the command's path-type refusal (criterion 5d) and its
 * `--type auto` resolution.
 *
 * `src` is imported through the computed-URL dynamic import pattern, because
 * a literal relative import of a `src` module from `test/` fails the build
 * with TS2878 under `rewriteRelativeImportExtensions` across the project
 * reference (CLAUDE.md standing warning 4).
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
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

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  compileSchema: (schema: Record<string, unknown>) =>
    | { ok: true; validator: (instance: unknown) => boolean }
    | { ok: false; reason: string };
  validateInstance: (
    schema: Record<string, unknown>,
    instance: unknown,
  ) => { pointer: string; message: string }[];
  validateToLines: (
    schema: Record<string, unknown>,
    instance: unknown,
  ) => string[];
  decodeDocument: (
    text: string,
    label: string,
  ) => { ok: true; value: unknown } | { ok: false; reason: string };
  readOperatorPath: (
    path: string,
  ) => { ok: true; body: string } | { ok: false; reason: string };
  AUTHORING_VOCABULARY: readonly string[];
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-validate-"));
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd = repoRoot): Run {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 4: unknown keyword fails COMPILATION               */
/* ------------------------------------------------------------------ */

test("an unknown schema keyword fails compilation before any instance is examined, and names the keyword", () => {
  /* MEMBER 1: a keyword that looks like a constraint. */
  const one = validateModule.compileSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "string",
    mustBeShouty: true,
  });
  assert.equal(one.ok, false);
  assert.match(one.ok === false ? one.reason : "", /mustBeShouty/);

  /* MEMBER 2, structurally different: a keyword misspelled from a REAL one,
     which is the way this actually happens. `minItem` for `minItems` reads
     right and constrains nothing, and a validator that ignored it would
     report every array valid while never checking the length that mattered.
     That is the SC-011 shape, and strict mode is what DR-0013 kept it out
     with. */
  const two = validateModule.compileSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "array",
    minItem: 2,
  });
  assert.equal(two.ok, false);
  assert.match(two.ok === false ? two.reason : "", /minItem/);

  /* CONTROL: the correctly spelled keyword compiles and REJECTS, so the
     refusal above is about the keyword and not about compiling in general. */
  const good = validateModule.compileSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "array",
    minItems: 2,
  });
  assert.equal(good.ok, true);
  assert.deepEqual(
    validateModule.validateToLines(
      { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array", minItems: 2 },
      [1],
    ),
    ["INVALID # array has 1 items, fewer than the required minimum 2"],
  );
});

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 5: an invalid schema fails meta-schema validation  */
/* ------------------------------------------------------------------ */

test("a schema that is itself invalid fails meta-schema validation", () => {
  const badType = validateModule.compileSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "nonsense",
  });
  assert.equal(badType.ok, false);
  assert.match(badType.ok === false ? badType.reason : "", /schema is invalid/);

  /* A second member: `required` must be an array of strings, and a string
     here is a schema an unvalidated engine would happily run. */
  const badRequired = validateModule.compileSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { a: { type: "string" } },
    required: "a",
  });
  assert.equal(badRequired.ok, false);
});

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 6: the validated value is not mutated              */
/* ------------------------------------------------------------------ */

test("validation does not coerce, default, strip or otherwise mutate the input, one case per kind", () => {
  const cases: {
    kind: string;
    schema: Record<string, unknown>;
    instance: unknown;
  }[] = [
    {
      kind: "coercion: a string where a number is required stays a string",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: { count: { type: "number" } },
      },
      instance: { count: "7" },
    },
    {
      kind: "defaults: a declared default is not inserted",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { mode: { type: "string", default: "standard" } },
      },
      instance: {},
    },
    {
      kind: "removeAdditional: a property outside the schema is not stripped",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: { known: { type: "string" } },
      },
      instance: { known: "a", unknown: "b" },
    },
    {
      kind: "general mutation: a nested array is byte-identical afterwards",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { list: { type: "array", items: { type: "string" } } },
      },
      instance: { list: ["a", "b"], extra: { deep: [1, 2, 3] } },
    },
  ];

  for (const one of cases) {
    /* The before image is a SEPARATE deep copy, so a mutation of the instance
       cannot mutate the thing it is compared against. Comparing the instance
       to itself is the version of this test that passes unconditionally. */
    const before = structuredClone(one.instance);
    validateModule.validateInstance(one.schema, one.instance);
    assert.deepEqual(one.instance, before, one.kind);
  }
});

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 7: references                                      */
/* ------------------------------------------------------------------ */

test("a local $ref resolves, and an unresolved and a remote reference each fail closed", () => {
  const local = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["item"],
    properties: { item: { $ref: "#/$defs/named" } },
    $defs: {
      named: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: { name: { type: "string" } },
      },
    },
  };
  assert.deepEqual(validateModule.validateToLines(local, { item: { name: "a" } }), []);
  assert.deepEqual(validateModule.validateToLines(local, { item: { name: 1 } }), [
    "INVALID #/item/name expected type string but found integer",
  ]);

  const unresolved = validateModule.compileSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { item: { $ref: "#/$defs/absent" } },
  });
  assert.equal(unresolved.ok, false, "an unresolved reference must fail closed");

  /* FAIL CLOSED, NOT FETCH. There is no `loadSchema` option on the engine, so
     a remote reference cannot be resolved by reaching the network; the
     compilation refuses instead. A test that only asserted "invalid" would
     also pass against an engine that FETCHED and got a 404, so the reason is
     asserted too. */
  const remote = validateModule.compileSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { item: { $ref: "https://example.invalid/a.json" } },
  });
  assert.equal(remote.ok, false);
  assert.match(
    remote.ok === false ? remote.reason : "",
    /can't resolve reference https:\/\/example\.invalid/,
  );
});

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 8: the diagnostic contract, and no Ajv wording     */
/* ------------------------------------------------------------------ */

/**
 * Ajv's own sentences, taken from the library's error output rather than
 * invented. If any of these reaches a Tiphys stream, Ajv's wording has become
 * a public contract, which DR-0013 clause 5 forbids.
 */
const AJV_WORDING = [
  "must have required property",
  "must NOT have additional properties",
  "must be equal to one of the allowed values",
  "must NOT have fewer than",
  "must match a schema in anyOf",
  "must be string",
];

test("Ajv errors become the exact Tiphys diagnostic text, and no Ajv-authored wording reaches either stream", () => {
  const lines = validateModule.validateToLines(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["id", "state"],
      properties: {
        id: { type: "string" },
        state: { type: "string", enum: ["done", "failed"] },
      },
    },
    { state: "mostly-fine", stray: 1 },
  );
  assert.deepEqual(lines, [
    "INVALID #/id required property id is missing",
    'INVALID #/state value "mostly-fine" is not one of the permitted values "done", "failed"',
    "INVALID #/stray property stray is not permitted here",
  ]);

  /* The ordering is the CONTRACT, not the traversal: sorted by pointer then
     message. Ten runs, so a set-iteration order that happened to agree once
     cannot pass for a sort. */
  for (let index = 0; index < 10; index += 1) {
    assert.deepEqual(
      validateModule.validateToLines(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          additionalProperties: false,
          required: ["id", "state"],
          properties: {
            id: { type: "string" },
            state: { type: "string", enum: ["done", "failed"] },
          },
        },
        { state: "mostly-fine", stray: 1 },
      ),
      lines,
    );
  }

  /* And now the same failure THROUGH THE COMMAND, both streams captured,
     because the criterion is about what reaches a stream and a unit-level
     assertion cannot see that. */
  const dir = scratch();
  try {
    const file = join(dir, "bad.yaml");
    writeFileSync(file, readFileSync(join(repoRoot, "test", "fixtures", "decision-decided-empty.yaml"), "utf8"));
    const run = runCli(["validate", "--type", "decision-record", file]);
    assert.equal(run.status, 1);
    for (const phrase of AJV_WORDING) {
      assert.ok(
        !run.stdout.includes(phrase),
        `Ajv wording reached stdout: ${phrase}`,
      );
      assert.ok(
        !run.stderr.includes(phrase),
        `Ajv wording reached stderr: ${phrase}`,
      );
    }
    assert.match(run.stdout, /^INVALID #\/decided /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 9 and criterion 12: malformed input, no stack      */
/* ------------------------------------------------------------------ */

test("malformed YAML produces one concise diagnostic and a nonzero exit", () => {
  /* DR-0013 YAML clause 3: decoding and validation are SEPARATE STAGES and a
     failure in each must be distinguishable. This test owns the decode stage;
     the test below owns the top-level presentation policy. They were one test
     until fix round 1, where the behavior registry named both properties and
     only one test existed to carry them, so one of the two names documented a
     property nobody could point at. */
  const dir = scratch();
  try {
    /* THE DECODE FAILS: the bytes are not YAML at all. */
    const broken = join(dir, "broken.yaml");
    writeFileSync(broken, "kind: plan\nphases:\n  - id: [unclosed\n");
    const first = runCli(["validate", "--type", "plan", broken]);
    assert.equal(first.status, 1);
    assert.equal(
      (first.stderr + first.stdout).split("\n").filter((l) => l !== "").length,
      1,
      first.stderr + first.stdout,
    );
    assert.match(first.stderr, /is not valid YAML/);

    /* THE DECODE SUCCEEDS AND VALIDATION FAILS, which is the OTHER side of
       the same separation: valid YAML that is not a mapping. The diagnostic
       names a POINTER rather than the decode, so a reader can tell which
       stage rejected the document. Without this arm the test would pass
       against an implementation that called every failure a decode failure. */
    const scalar = join(dir, "scalar.yaml");
    writeFileSync(scalar, "just a string\n");
    const second = runCli(["validate", "--type", "plan", scalar]);
    assert.equal(second.status, 1);
    assert.match(second.stdout, /^INVALID # expected type object but found string$/m);
    assert.ok(
      !second.stderr.includes("is not valid YAML"),
      "a validation failure was reported as a decode failure",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a subcommand that throws prints one diagnostic line, exits nonzero, and puts no stack frame on either stream", () => {
  /* STEP 8b's HANDLER, exercised through a path that actually REACHES it.
     Recorded as a residue in the first round and closed here: the two
     malformed-input members above are handled INSIDE `cmdValidate`, which
     RETURNS a code rather than throwing, so removing the try/catch in
     `bin/tiphys.ts` leaves them unchanged and they witness the handler not at
     all. These three DO throw. */
  const dir = scratch();
  try {
    const runs = [
      /* `loadFleet` throws "not a fleet home: ... is missing ..." */
      runCli(["status", "show"], dir),
      runCli(["status", "emit", "--run", "r1", "--state", "done"], dir),
      /* `loadTypeSchema` throws when the installation has no schemas/ above
         it, which is the load-time configuration error STATE.md carried as an
         unowned seam. Staged by running the CLI from a copy with no schemas/
         directory anywhere above it. */
      (() => {
        const island = join(dir, "island");
        mkdirSync(join(island, "bin"), { recursive: true });
        mkdirSync(join(island, "src", "commands"), { recursive: true });
        cpSync(join(repoRoot, "src"), join(island, "src"), { recursive: true });
        cpSync(join(repoRoot, "bin"), join(island, "bin"), { recursive: true });
        cpSync(
          join(repoRoot, "node_modules"),
          join(island, "node_modules"),
          { recursive: true },
        );
        const target = join(dir, "anything.yaml");
        writeFileSync(target, "kind: plan\n");
        return spawnSync(
          process.execPath,
          [join(island, "bin", "tiphys.ts"), "validate", "--type", "plan", target],
          { encoding: "utf8", cwd: dir },
        );
      })(),
    ];

    for (const run of runs) {
      assert.notEqual(run.status, 0, run.stdout + run.stderr);
      assert.equal(
        (run.stderr.match(/ {4}at /g) ?? []).length,
        0,
        `stderr carried a stack frame: ${run.stderr}`,
      );
      assert.equal(
        (run.stdout.match(/ {4}at /g) ?? []).length,
        0,
        `stdout carried a stack frame: ${run.stdout}`,
      );
      assert.equal(
        run.stderr.split("\n").filter((line) => line !== "").length,
        1,
        `more than one diagnostic line: ${run.stderr}`,
      );
      assert.match(run.stderr, /^tiphys: /);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* Criterion 5d: path-type refusal, with a real mkfifo                  */
/* ------------------------------------------------------------------ */

test("a named pipe at the file argument or at --context is refused within a bounded time, and a regular file at the same path is accepted", () => {
  const dir = scratch();
  try {
    const fifo = join(dir, "artifact.yaml");
    execFileSync("mkfifo", [fifo]);

    /* The timeout is the assertion that matters. Opening a FIFO with no
       writer BLOCKS FOREVER; a refusal that arrives is the whole property,
       and a test with no timeout would hang rather than fail. */
    const refused = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "plan", fifo],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(refused.signal, null, "the command blocked and was killed");
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /artifact\.yaml/);
    assert.match(refused.stderr, /not a regular file/);

    /* THE OTHER DIRECTION, at the SAME PATH, so the refusal is about the
       entry type and not about the path or the directory. */
    rmSync(fifo);
    writeFileSync(
      fifo,
      readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
    );
    const accepted = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "plan", fifo],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);

    /* The same pair for the --context DIRECTORY. */
    const contextFifo = join(dir, "context");
    execFileSync("mkfifo", [contextFifo]);
    const contextRefused = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "plan", "--context", contextFifo, fifo],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(contextRefused.signal, null, "the context walk blocked");
    assert.notEqual(contextRefused.status, 0);
    assert.match(contextRefused.stderr, /context/);

    rmSync(contextFifo);
    const contextDir = join(dir, "context");
    execFileSync("mkdir", [contextDir]);
    const contextAccepted = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "plan", "--context", contextDir, fifo],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(
      contextAccepted.status,
      0,
      contextAccepted.stdout + contextAccepted.stderr,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2: valid instances, and --type auto                        */
/* ------------------------------------------------------------------ */

/**
 * A status-line record, written to `dir`. It ships no template because it is
 * EMITTED rather than authored, so the fixture lives here.
 */
function writeStatusRecord(dir: string): string {
  const file = join(dir, "status.json");
  writeFileSync(
    file,
    JSON.stringify({
      kind: "status-line",
      at: "2026-08-08T05:00:00Z",
      run: "r1",
      project: "example",
      state: "phase-change",
      detail: "",
      refs: [],
    }),
  );
  return file;
}

test("each shipped example validates under its named type and exits 0", () => {
  for (const type of ["plan", "charter", "decision-record"]) {
    const file = join(repoRoot, "templates", `${type}.example.yaml`);
    const named = runCli(["validate", "--type", type, file]);
    assert.equal(named.status, 0, named.stdout + named.stderr);
  }
  const dir = scratch();
  try {
    assert.equal(
      runCli(["validate", "--type", "status-line", writeStatusRecord(dir)]).status,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--type auto resolves from the kind field and is a usage error when there is none", () => {
  for (const type of ["plan", "charter", "decision-record"]) {
    const file = join(repoRoot, "templates", `${type}.example.yaml`);
    const auto = runCli(["validate", "--type", "auto", file]);
    assert.equal(auto.status, 0, auto.stdout + auto.stderr);
  }
  const dir = scratch();
  try {
    assert.equal(runCli(["validate", "--type", "auto", writeStatusRecord(dir)]).status, 0);

    /* --type auto with no kind field is a USAGE error, not a validation
       failure: the caller asked the command to work out which contract
       applies and it cannot, which is a different fact from the document
       failing that contract. */
    const noKind = join(dir, "no-kind.yaml");
    writeFileSync(noKind, "at: 2026-08-08T05:00:00Z\nrun: r1\n");
    const usage = runCli(["validate", "--type", "auto", noKind]);
    assert.equal(usage.status, 64);
    assert.match(usage.stderr, /kind field/);

    /* And the OTHER direction of "resolves from the kind field": a kind that
       names no registered type is the same usage error, so the resolver is
       reading the field rather than guessing from the filename. */
    const wrongKind = join(dir, "wrong-kind.yaml");
    writeFileSync(wrongKind, "kind: gate-manifest\nrun: r1\n");
    const unknown = runCli(["validate", "--type", "auto", wrongKind]);
    assert.equal(unknown.status, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: additionalProperties: false at TWO different depths      */
/* ------------------------------------------------------------------ */

test("a misspelled property is rejected naming it, at the document top level and at a nested level two deep", () => {
  const dir = scratch();
  try {
    const source = readFileSync(
      join(repoRoot, "templates", "plan.example.yaml"),
      "utf8",
    );

    /* MEMBER 1: the TOP level. `standing-contex` is one character from the
       real field, which is how this fails in practice. */
    const top = yamlModule.parse(source) as Record<string, unknown>;
    top["standing-contex"] = top["standing-context"];
    delete top["standing-context"];
    const topFile = join(dir, "top.yaml");
    writeFileSync(topFile, yamlModule.stringify(top));
    const topRun = runCli(["validate", "--type", "plan", topFile]);
    assert.equal(topRun.status, 1);
    assert.match(topRun.stdout, /INVALID #\/standing-contex property standing-contex is not permitted here/);

    /* MEMBER 2, structurally different and AT LEAST TWO DEEP:
       `phases[0].fill-in.root-cuase`. One witness is not a class here,
       because the failure mode being guarded is exactly an
       `additionalProperties: false` present at the top level and omitted at
       one nested level. */
    const nested = yamlModule.parse(source) as Record<string, unknown>;
    const phase = (nested["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    const fillIn = phase["fill-in"] as Record<string, unknown>;
    fillIn["root-cuase"] = fillIn["root-cause"];
    delete fillIn["root-cause"];
    const nestedFile = join(dir, "nested.yaml");
    writeFileSync(nestedFile, yamlModule.stringify(nested));
    const nestedRun = runCli(["validate", "--type", "plan", nestedFile]);
    assert.equal(nestedRun.status, 1);
    assert.match(
      nestedRun.stdout,
      /INVALID #\/phases\/0\/fill-in\/root-cuase property root-cuase is not permitted here/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
