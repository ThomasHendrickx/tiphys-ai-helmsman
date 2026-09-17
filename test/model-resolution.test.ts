import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * THE MODEL-RESOLUTION RECORD (kernel plan M4, M4-P7;
 * delivery/plan/kernel-plan-m4.md:1018).
 *
 * Unit imports go through a computed URL (CLAUDE.md warning 4): a literal
 * relative import from test/ into src/ or into plugin/src/ fails the build
 * with TS2878 under `rewriteRelativeImportExtensions` across the project
 * reference.
 *
 * EVERY TEST HERE DRIVES `bin/tiphys.ts` RATHER THAN `dist/`, deliberately.
 * Nine tests in this repository skip themselves when `dist/` is absent and the
 * run still exits 0 (CLAUDE.md standing warning 12), and the red-witness
 * harness evaluates a witness in a scratch clone that is never built, so a
 * test of this behaviour written against the built CLI would be SKIPPED in
 * exactly the run whose job is to prove it red.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");

const kernel = (await import(
  new URL("../src/model-resolution.ts", import.meta.url).href
)) as {
  MODEL_RESOLUTION_RECORD_NAME: string;
  modelResolutionPath: (fleet: { tasksDir: string }, taskId: string) => string;
  readModelResolutionRecord: (
    path: string,
    writerExitCode: number,
  ) => { kind: "read"; record: Record<string, unknown> } | { kind: "error"; reason: string };
  vocabularyIdentity: (
    record: Record<string, unknown>,
  ) => { id: string; version: number } | undefined;
  acceptModelResolution: (
    record: Record<string, unknown>,
    subject: { taskId: string; role: string; requestedTier: string },
  ) =>
    | { kind: "accepted"; family: string | undefined; provenance: string }
    | { kind: "refused"; reason: string };
  compareResolvedFamilies: (
    left: Record<string, unknown>,
    right: Record<string, unknown>,
  ) =>
    | { kind: "compared"; differ: boolean; families: [string, string] }
    | { kind: "refused"; reason: string };
  producedByFromRecord: (record: Record<string, unknown>) => string | undefined;
};

const writer = (await import(
  new URL("../plugin/src/model-resolution.ts", import.meta.url).href
)) as {
  MODEL_RESOLUTION_RECORD_NAME: string;
  buildModelResolutionRecord: (inputs: Record<string, unknown>) => Record<string, unknown>;
  resolveTier: (inputs: {
    role: string;
    requestedTier: string;
    policy?: {
      configPath: string;
      charterOverride: string;
      charter?: { path: string; tier: string };
    };
  }) => Record<string, unknown>;
  observeServedModel: (transcriptPath: string) => Record<string, unknown>;
  modelResolutionPathBeside: (recordPath: string) => string;
  readTurnEnd: (path: string) => { endedAt: string; exitCode: number } | undefined;
};

const vocabulary = (await import(
  new URL("../plugin/src/vocabulary.ts", import.meta.url).href
)) as {
  VOCABULARY_ID: string;
  VOCABULARY_VERSION: number;
  familyOf: (modelId: string) => string | undefined;
  modelForTier: (tier: string) => string | undefined;
};

const hooks = (await import(new URL("../src/hooks.ts", import.meta.url).href)) as {
  renderTurnEndHook: (turnEndFile: string) => string;
};

const task = (await import(new URL("../src/task.ts", import.meta.url).href)) as {
  turnEndPath: (fleet: { tasksDir: string }, taskId: string) => string;
  taskDir: (fleet: { tasksDir: string }, taskId: string) => string;
};

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  validateToLines: (schema: Record<string, unknown>, instance: unknown) => string[];
};

const release = (await import(
  new URL("../src/gates/release.ts", import.meta.url).href
)) as {
  runVerification: (options: {
    verification: string;
    subject: Record<string, string>;
    adapter: string[];
    config: unknown;
    clock: { intervalMs: number; deadlineMs: number; attemptTimeoutMs: number };
    evidenceDir: string;
  }) => Promise<{ verdict: { kind: string; reason?: string } }>;
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-model-resolution-"));
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const TURN_END = { endedAt: "2026-09-17T10:00:00.000Z", exitCode: 0 };
const WRITTEN_AT = new Date("2026-09-17T10:00:05.000Z");

const SUBJECT = { taskId: "t-1", role: "implementer", requestedTier: "cheaper" };

/** M4-P1's committed probe captures, which this file's fixtures are taken from. */
const PROBE_FIXTURE_DIR = join(
  "test",
  "fixtures",
  "harness-probe",
  "q3-transcript-model-resolution",
);

/** A model id M4-P1 really read back, never one invented for a test. */
const OBSERVED_MODEL = "claude-opus-5";

/**
 * REAL CAPTURED OUTPUT OF THE PROGRAM UNDER TEST, and the assertions below are
 * anchored on it rather than on strings chosen to match the implementation
 * (CLAUDE.md's red-witness rule). `m4-p7-model-resolution-cli.txt` holds one
 * case per damaged record, with the exit code and the exact diagnostic the
 * shipped CLI printed. A test asserting a line this file does not carry is
 * asserting something the program has never been seen to say, so the helper
 * checks the capture FIRST and says so when it does not.
 */
const CLI_CAPTURE = join(
  repoRoot,
  "witness",
  "captures",
  "m4-p7-model-resolution-cli.txt",
);

function capturedDiagnostic(fragment: string): string {
  const capture = readFileSync(CLI_CAPTURE, "utf8");
  const line = capture
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("INVALID ") && entry.includes(fragment));
  assert.notEqual(
    line,
    undefined,
    `witness/captures/m4-p7-model-resolution-cli.txt carries no INVALID line containing ${JSON.stringify(fragment)}, so this test would be asserting text the command has never been seen to print`,
  );
  return line as string;
}

/** A record the PLUGIN actually wrote, never a literal assembled by a test. */
function pluginRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return writer.buildModelResolutionRecord({
    writer: "claude-code",
    taskId: SUBJECT.taskId,
    role: SUBJECT.role,
    requestedTier: SUBJECT.requestedTier,
    turnEnd: TURN_END,
    writtenAt: WRITTEN_AT,
    ...overrides,
  });
}

/** Write a record to a scratch file and hand back the path. */
function stage(record: unknown, name = "model-resolution.json"): string {
  const path = join(scratch(), name);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

function clone(record: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Criterion 1(a): SHAPE                                                */
/* ------------------------------------------------------------------ */

test(
  "a model-resolution record the plugin wrote validates under its named type and under auto",
  () => {
    /*
     * THE INSTANCE IS THE PLUGIN'S OWN OUTPUT, which is criterion 1's exact
     * wording ("a record the plugin actually wrote"). A hand-written literal
     * here would test the schema against the schema's author's idea of the
     * writer, and the two can drift in silence: every field could be right and
     * the writer could still emit a field name nobody validated.
     */
    const record = pluginRecord();
    const path = stage(record);

    const named = runCli(["validate", "--type", "model-resolution", path]);
    assert.equal(named.status, 0, `${named.stdout}${named.stderr}`);
    assert.equal(named.stdout, "");

    /*
     * BOTH REGISTRATIONS, IN ONE TEST, because a type registered for `--type`
     * and not for `auto` is the shape this repository keeps paying for. The
     * executor record is the counter-example one row above this one in
     * src/commands/validate.ts: it carries no `kind`, so `--type auto` on a
     * real one is a usage error. This record carries a required `const` kind,
     * so `auto` resolves it, and the assertion is against the CLI rather than
     * against the comment that says so.
     */
    const auto = runCli(["validate", "--type", "auto", path]);
    assert.equal(auto.status, 0, `${auto.stdout}${auto.stderr}`);
    assert.equal(auto.stdout, "");
  },
);

test(
  "a record with no subject echo, a mismatched echo or no vocabulary identity is refused naming the field",
  () => {
    const record = pluginRecord();

    const missing = clone(record);
    delete missing["subject"];
    const withoutSubject = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(missing),
    ]);
    assert.equal(withoutSubject.status, 1);
    assert.equal(
      withoutSubject.stdout,
      `${capturedDiagnostic("#/subject required property subject")}\n`,
    );

    /*
     * THE ECHO MISMATCH IS THE MEMBER A SCHEMA CANNOT REACH. It compares two
     * sibling fields of one document, which is Kind B (schemas/README.md), so
     * it is the derived check's and the diagnostic names the field it found
     * the disagreement at.
     */
    const mismatched = clone(record);
    (mismatched["subject"] as Record<string, unknown>)["role"] = "orchestrator";
    const echoWrong = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(mismatched),
    ]);
    assert.equal(echoWrong.status, 1);
    assert.equal(
      echoWrong.stdout,
      `${capturedDiagnostic("#/resolution/role")}\n`,
    );
    assert.match(echoWrong.stdout, /\(check: model-resolution-subject-echo\)/);

    const anonymous = clone(record);
    delete (anonymous["resolved"] as Record<string, unknown>)["vocabulary"];
    const withoutVocabulary = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(anonymous),
    ]);
    assert.equal(withoutVocabulary.status, 1);
    assert.ok(
      withoutVocabulary.stdout.includes(
        capturedDiagnostic("#/resolved/vocabulary required property vocabulary"),
      ),
      withoutVocabulary.stdout,
    );

    /*
     * AND THE KERNEL-SIDE READER REFUSES THE SAME THREE, which is the half a
     * consumer actually runs: `tiphys validate` is an operator command and the
     * closeout path never shells out to it. The echo comparison there is
     * against the request the KERNEL holds rather than against a sibling
     * field, which is the release record's guard exactly
     * (src/gates/schemas/release-record.schema.json:26).
     */
    const refusedMissing = kernel.acceptModelResolution(missing, SUBJECT);
    assert.equal(refusedMissing.kind, "refused");
    const refusedEcho = kernel.acceptModelResolution(mismatched, SUBJECT);
    assert.equal(refusedEcho.kind, "refused");
    assert.match(
      refusedEcho.kind === "refused" ? refusedEcho.reason : "",
      /different subject/,
    );
    const refusedAnonymous = kernel.acceptModelResolution(anonymous, SUBJECT);
    assert.equal(refusedAnonymous.kind, "refused");
    assert.match(
      refusedAnonymous.kind === "refused" ? refusedAnonymous.reason : "",
      /no resolved\.vocabulary identity/,
    );

    /* The undamaged record is accepted, so the three refusals above are about
       the damage and not about the record being unacceptable anyway. */
    assert.equal(kernel.acceptModelResolution(record, SUBJECT).kind, "accepted");
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 2(b): TIMING                                               */
/* ------------------------------------------------------------------ */

test(
  "the model-resolution record is written after the turn ended and a launch-time record is refused",
  () => {
    /*
     * THE TURN-END RECORD IS PRODUCED BY THE REAL GENERATED HOOK, not by a
     * literal. `renderTurnEndHook` is the kernel's shipped generator
     * (src/hooks.ts:38) and the file it writes is the one the watcher wakes
     * on, so `endedAt` here is a real instant produced by the program this
     * behaviour consumes the output of, rather than a string chosen to make
     * the comparison come out right.
     */
    const fleetTasks = scratch();
    const taskId = "t-timing";
    const directory = join(fleetTasks, taskId);
    mkdirSync(directory, { recursive: true });
    const turnEndFile = task.turnEndPath({ tasksDir: fleetTasks }, taskId);
    const hookPath = join(directory, "turn-end-hook.mjs");
    writeFileSync(hookPath, hooks.renderTurnEndHook(turnEndFile));

    const hooked = spawnSync(process.execPath, [hookPath, "0"], { encoding: "utf8" });
    assert.equal(hooked.status, 0, hooked.stderr);
    const turnEnd = writer.readTurnEnd(turnEndFile);
    assert.notEqual(turnEnd, undefined);

    const writtenAt = new Date();
    const record = writer.buildModelResolutionRecord({
      writer: "claude-code",
      taskId,
      role: SUBJECT.role,
      requestedTier: SUBJECT.requestedTier,
      turnEnd: turnEnd as { endedAt: string; exitCode: number },
      writtenAt,
    });

    const echoed = record["turnEnd"] as Record<string, unknown>;
    assert.equal(echoed["endedAt"], (turnEnd as { endedAt: string }).endedAt);
    assert.ok(
      Date.parse(record["writtenAt"] as string) >= Date.parse(echoed["endedAt"] as string),
      `writtenAt ${String(record["writtenAt"])} precedes endedAt ${String(echoed["endedAt"])}`,
    );

    /*
     * THE DANGEROUS STATE, AND IT IS NOT "THE FEATURE IS ABSENT". A record
     * written at LAUNCH still validates as a document: it has a writer, a
     * subject, a vocabulary and a family token, and every one of them is a
     * copy of the request. What it cannot have is a turn-end instant at or
     * before its own, so that is what is driven here.
     */
    const launchTime = clone(record);
    launchTime["writtenAt"] = new Date(
      Date.parse(echoed["endedAt"] as string) - 60_000,
    ).toISOString();
    const refused = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(launchTime),
    ]);
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /^INVALID #\/writtenAt /);
    assert.ok(
      refused.stdout.includes("before the turn ended at"),
      refused.stdout,
    );
    assert.match(capturedDiagnostic("#/writtenAt"), /before the turn ended at/);

    /*
     * THE SECOND STRUCTURAL MEMBER: a record with no turn-end echo at all,
     * which is what a launch-time writer would actually produce, because the
     * file it would have to echo does not exist yet. The schema refuses it,
     * so the shape is unrepresentable rather than merely discouraged.
     */
    const noTurnEnd = clone(record);
    delete noTurnEnd["turnEnd"];
    const refusedShape = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(noTurnEnd),
    ]);
    assert.equal(refusedShape.status, 1);
    assert.ok(
      refusedShape.stdout.includes(
        capturedDiagnostic("#/turnEnd required property turnEnd"),
      ),
      refusedShape.stdout,
    );

    /* The writer's own constant agrees with the kernel's path helper, compared
       rather than asserted: the plugin cannot import `turnEndPath` through the
       package name, so the duplication is real and is checked here. */
    assert.equal(
      join(task.taskDir({ tasksDir: fleetTasks }, taskId), "turn-end"),
      turnEndFile,
    );
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 3(c): VOCABULARY                                           */
/* ------------------------------------------------------------------ */

test(
  "two model-resolution records from different vocabularies refuse to compare and two from one vocabulary compare",
  () => {
    const mine = pluginRecord({
      observation: {
        kind: "observed",
        source: "transcript:/a.jsonl",
        model: OBSERVED_MODEL,
        detail: "one distinct model",
      },
    });
    const sibling = pluginRecord({
      observation: {
        kind: "observed",
        source: "transcript:/b.jsonl",
        model: "claude-sonnet-5",
        detail: "one distinct model",
      },
    });

    const compared = kernel.compareResolvedFamilies(mine, sibling);
    assert.equal(compared.kind, "compared");
    assert.equal(compared.kind === "compared" ? compared.differ : undefined, true);

    const same = kernel.compareResolvedFamilies(mine, clone(mine));
    assert.equal(same.kind === "compared" ? same.differ : undefined, false);

    /*
     * THE DANGEROUS STATE IS A SILENT COMPARE, NOT A MISSING FEATURE. The two
     * records below carry DIFFERENT family tokens under different vocabulary
     * ids, so a reader that ignored the vocabulary would answer "they differ"
     * and a decorrelation check would report two decorrelated reviews on the
     * strength of two strings minted by two authorities that never agreed on
     * what a family is. DR-0038 exists for precisely the environment where the
     * two reviews come from different places.
     */
    const foreign = clone(sibling);
    (
      (foreign["resolved"] as Record<string, unknown>)["vocabulary"] as Record<
        string,
        unknown
      >
    )["id"] = "another-harness-model-families";
    const refused = kernel.compareResolvedFamilies(mine, foreign);
    assert.equal(refused.kind, "refused");
    const reason = refused.kind === "refused" ? refused.reason : "";
    assert.match(reason, new RegExp(vocabulary.VOCABULARY_ID));
    assert.match(reason, /another-harness-model-families/);

    /*
     * AND THE SECOND MEMBER OF THE SAME CLASS: two records whose family tokens
     * are EQUAL across different vocabularies. This is the one a reviewer is
     * most likely to wave through, because the answer a naive reader gives
     * ("they match, so the reviews are correlated") looks conservative. It is
     * not conservative, it is unfounded, and it blocks a merge on a comparison
     * that asserted nothing.
     */
    const twin = clone(mine);
    (
      (twin["resolved"] as Record<string, unknown>)["vocabulary"] as Record<
        string,
        unknown
      >
    )["id"] = "another-harness-model-families";
    const refusedTwin = kernel.compareResolvedFamilies(mine, twin);
    assert.equal(refusedTwin.kind, "refused");
  },
);

test(
  "the kernel-side reader dereferences a vocabulary's identity and never its content",
  () => {
    /*
     * THE ASSERTION IS MECHANICAL AND IT IS THE POINT OF THE TEST. A grep for
     * vendor names over `src/` already runs in test/schemas.test.ts and it
     * catches a mapping written in `src/`; it cannot catch a reader that
     * REACHES INTO a vocabulary the plugin handed it, because the vendor name
     * is then in the data rather than in the source. So the vocabulary here is
     * a Proxy that records every property read, and the recorded set is
     * compared against the identity fields.
     */
    const read: string[] = [];
    const wrap = (identity: { id: string; version: number }): unknown =>
      new Proxy(
        {
          ...identity,
          /* Content a careless reader would reach for, planted so that reaching
             for it is RECORDED rather than merely unlikely. */
          families: ["one", "two"],
          tierToModel: { strongest: "a-model-name", cheaper: "another-one" },
        },
        {
          get(target, property, receiver) {
            if (typeof property === "string") {
              read.push(property);
            }
            return Reflect.get(target, property, receiver);
          },
        },
      );

    const left = clone(pluginRecord());
    const right = clone(pluginRecord());
    (left["resolved"] as Record<string, unknown>)["vocabulary"] = wrap({
      id: vocabulary.VOCABULARY_ID,
      version: vocabulary.VOCABULARY_VERSION,
    });
    (right["resolved"] as Record<string, unknown>)["vocabulary"] = wrap({
      id: vocabulary.VOCABULARY_ID,
      version: vocabulary.VOCABULARY_VERSION,
    });

    const identity = kernel.vocabularyIdentity(left);
    assert.deepEqual(identity, {
      id: vocabulary.VOCABULARY_ID,
      version: vocabulary.VOCABULARY_VERSION,
    });
    const compared = kernel.compareResolvedFamilies(left, right);
    assert.equal(compared.kind, "compared");
    assert.equal(kernel.acceptModelResolution(left, SUBJECT).kind, "accepted");

    const touched = [...new Set(read)].sort();
    assert.ok(read.length > 0, "the reader did not read the vocabulary at all");
    assert.deepEqual(
      touched,
      ["id", "version"],
      `the reader dereferenced ${touched.join(", ")} of the vocabulary`,
    );

    /*
     * THE OTHER HALF OF CRITERION 4, and it is where the vendor names actually
     * are: the tier-to-model and model-to-family mappings answer in the PLUGIN
     * and there is no kernel-side counterpart to ask.
     */
    assert.ok((vocabulary.modelForTier("cheaper") ?? "").length > 0);
    assert.equal(vocabulary.familyOf(OBSERVED_MODEL), "opus");
    assert.equal(vocabulary.familyOf("a-model-from-another-vendor"), undefined);
    assert.equal(Object.hasOwn(kernel, "familyOf"), false);
    assert.equal(Object.hasOwn(kernel, "modelForTier"), false);
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 5(d): LOCATION and the absent-record rule                  */
/* ------------------------------------------------------------------ */

test(
  "an adapter exiting zero with no model-resolution record is an error and never a clean result",
  async () => {
    /*
     * THE RULE IS NOT REIMPLEMENTED HERE AND ITS WORDING IS NOT COPIED HERE.
     * src/gates/release.ts:609 already produces the sentence for the same
     * hazard one seam over, so this test DRIVES that program, captures what it
     * really said, and derives its expectation from the capture. A
     * hand-written expectation would be a second statement of the rule that
     * could drift from the first in silence, which is the substitution
     * criterion 5 names.
     */
    const dir = scratch();
    const stub = join(dir, "writes-nothing.mjs");
    writeFileSync(stub, "/* exits 0, writes nothing */\n");
    const captured = await release.runVerification({
      verification: "deploy",
      subject: {
        repository: "example/app",
        integrationRef: "main",
        mergedSha: "1111111111111111111111111111111111111111",
        mergedAt: "2026-08-06T10:00:00Z",
        phaseId: "m4-p7",
      },
      adapter: [process.execPath, stub],
      config: {},
      clock: { intervalMs: 20, deadlineMs: 10000, attemptTimeoutMs: 5000 },
      evidenceDir: scratch(),
    });
    assert.equal(captured.verdict.kind, "error");
    const capturedReason = captured.verdict.reason ?? "";
    const clause = /exit 0 with no \S+ is error, not success/.exec(capturedReason);
    assert.notEqual(clause, null, `the capture does not carry the rule: ${capturedReason}`);
    const expected = (clause as RegExpExecArray)[0].replace("response", "record");

    /*
     * THE LOCATION IS THE TASK DIRECTORY, OUTSIDE THE WORKTREE (src/task.ts:31,
     * FM-059). The path is computed by the shipped helper rather than joined
     * by hand, so a later phase that moves the task layout moves this with it.
     */
    const fleetTasks = scratch();
    const path = kernel.modelResolutionPath({ tasksDir: fleetTasks }, "t-absent");
    assert.equal(path.startsWith(join(fleetTasks, "t-absent")), true);
    assert.equal(path.includes("worktrees"), false);

    const absent = kernel.readModelResolutionRecord(path, 0);
    assert.equal(absent.kind, "error");
    const mine = absent.kind === "error" ? absent.reason : "";
    assert.match(mine, /^fail-closed rule 1: /);
    assert.ok(
      mine.includes(expected),
      `the reader says ${JSON.stringify(mine)} and the captured rule is ${JSON.stringify(expected)}`,
    );

    /*
     * AND THE CONVERSE, so the error above is about the absence rather than
     * about the reader refusing everything: the same path with a record at it
     * reads.
     */
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(pluginRecord(), null, 2)}\n`);
    assert.equal(kernel.readModelResolutionRecord(path, 0).kind, "read");
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 6: provenance cannot be laundered                          */
/* ------------------------------------------------------------------ */

test(
  "a record claiming observed provenance with no observation is refused by the schema",
  () => {
    const record = pluginRecord();
    const laundered = clone(record);
    const resolved = laundered["resolved"] as Record<string, unknown>;
    resolved["provenance"] = "observed";
    assert.equal(resolved["observation"], undefined);

    const refused = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(laundered),
    ]);
    assert.equal(refused.status, 1);
    assert.equal(
      refused.stdout,
      `${capturedDiagnostic("#/resolved value matches no permitted alternative")}\n`,
    );

    /* AND THE READER REFUSES IT TOO, which is a second, independent mechanism
       over the same class: the schema cannot run inside a consumer and the
       consumer never shells out to `tiphys validate`, so a guard that existed
       only in one of them would be absent exactly where the record is read. */
    assert.equal(kernel.acceptModelResolution(laundered, SUBJECT).kind, "refused");

    /* The same document with a real observation validates, so the refusal is
       about the missing observation rather than about the provenance value. */
    const observed = pluginRecord({
      observation: {
        kind: "observed",
        source: "transcript:/a.jsonl",
        model: OBSERVED_MODEL,
        detail: "one distinct model",
      },
    });
    assert.equal(
      (observed["resolved"] as Record<string, unknown>)["provenance"],
      "observed",
    );
    const accepted = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(observed),
    ]);
    assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
  },
);

test(
  "a record whose observation contradicts the echoed request is refused by the reader",
  () => {
    /*
     * MEMBER TWO OF CRITERION 6's CLASS, AND A SCHEMA-ONLY GUARD PASSES IT
     * GREEN. Both records below have every required field, in the right
     * branch, with the right types. The first says it OBSERVED a turn for one
     * task and offers evidence gathered on another; the second claims one
     * model and offers an observation of a different one. The schema cannot
     * see either, and both are a self-report with a decoration on it.
     */
    const record = pluginRecord({
      observation: {
        kind: "observed",
        source: "transcript:/a.jsonl",
        model: OBSERVED_MODEL,
        detail: "one distinct model",
      },
    });
    assert.equal(kernel.acceptModelResolution(record, SUBJECT).kind, "accepted");
    assert.equal(
      runCli(["validate", "--type", "model-resolution", stage(record)]).status,
      0,
    );

    const otherTask = clone(record);
    (
      (otherTask["resolved"] as Record<string, unknown>)["observation"] as Record<
        string,
        unknown
      >
    )["taskId"] = "t-somebody-else";
    assert.equal(
      runCli(["validate", "--type", "model-resolution", stage(otherTask)]).status,
      0,
      "the schema was expected to accept this; if it refuses, the member is no longer the one this test exists for",
    );
    const refusedTask = kernel.acceptModelResolution(otherTask, SUBJECT);
    assert.equal(refusedTask.kind, "refused");
    assert.match(
      refusedTask.kind === "refused" ? refusedTask.reason : "",
      /contradicts the subject/,
    );

    const otherModel = clone(record);
    (
      (otherModel["resolved"] as Record<string, unknown>)["observation"] as Record<
        string,
        unknown
      >
    )["model"] = "claude-sonnet-5";
    assert.equal(
      runCli(["validate", "--type", "model-resolution", stage(otherModel)]).status,
      0,
    );
    const refusedModel = kernel.acceptModelResolution(otherModel, SUBJECT);
    assert.equal(refusedModel.kind, "refused");
    assert.match(
      refusedModel.kind === "refused" ? refusedModel.reason : "",
      /is not the observed one/,
    );

    /* The two sibling launderings the same reader closes: evidence claimed by
       a record that ranks itself unevidenced, and an identity named by a
       record that says it could not resolve one. */
    const decorated = clone(record);
    (decorated["resolved"] as Record<string, unknown>)["provenance"] = "self-reported";
    assert.equal(kernel.acceptModelResolution(decorated, SUBJECT).kind, "refused");

    const namedAnyway = clone(record);
    const anywayResolved = namedAnyway["resolved"] as Record<string, unknown>;
    anywayResolved["provenance"] = "unresolved";
    anywayResolved["reason"] = "the transcript was empty at hook time";
    delete anywayResolved["observation"];
    assert.equal(kernel.acceptModelResolution(namedAnyway, SUBJECT).kind, "refused");
  },
);

test(
  "an observation channel that answers nothing is unresolved and never a fallback to the self-report",
  () => {
    /*
     * M4-P1 MEASURED THIS ARM AND MADE IT BINDING
     * (delivery/verification/m4-prototype-probes.md:410). In two of twelve
     * concurrent resolutions the transcript had ZERO assistant rows at hook
     * time. "A resolver that falls back to the self-report on an empty
     * transcript is green whenever the race does not fire and silently accepts
     * a forgeable value when it does," and the failure correlates with load,
     * so it is rarest in testing.
     *
     * THE ROW SHAPE IS THE PROBE'S, NOT ONE INVENTED TO MATCH THIS RESOLVER.
     * The keys read below (`type` and `message.model`) are the keys the
     * probe's own resolver read against real harness-written transcripts, at
     * test/fixtures/harness-probe/q3-transcript-model-resolution/plugin-hook-resolve.mjs.txt:1,
     * and the model ids are the ones that came back from it, recorded at
     * test/fixtures/harness-probe/q3-transcript-model-resolution/three-concurrent.summary.txt:1.
     */
    const probeResolver = readFileSync(
      join(repoRoot, PROBE_FIXTURE_DIR, "plugin-hook-resolve.mjs.txt"),
      "utf8",
    );
    for (const token of ['row?.type === \'assistant\'', 'row?.message?.model']) {
      assert.ok(
        probeResolver.includes(token),
        `the probe capture does not carry ${token}, so this resolver's shape is not the measured one`,
      );
    }
    const probeSummary = readFileSync(
      join(repoRoot, PROBE_FIXTURE_DIR, "three-concurrent.summary.txt"),
      "utf8",
    );
    assert.ok(probeSummary.includes(OBSERVED_MODEL));
    assert.ok(probeSummary.includes("fail-no-assistant-model-rows"));

    const directory = scratch();
    const transcript = join(directory, "session.jsonl");

    /* The channel exists and the transcript is EMPTY: somebody looked. */
    writeFileSync(transcript, "");
    const empty = writer.observeServedModel(transcript);
    assert.equal(empty["kind"], "unresolved");
    assert.match(String(empty["reason"]), /no assistant row naming a model/);

    /* The appended-row tamper the probe demonstrated: two models for one turn
       is anomalous and catchable, and it is not a resolution. */
    writeFileSync(
      transcript,
      `${JSON.stringify({ type: "assistant", message: { model: OBSERVED_MODEL } })}\n` +
        `${JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-5" } })}\n`,
    );
    const forged = writer.observeServedModel(transcript);
    assert.equal(forged["kind"], "unresolved");
    assert.match(String(forged["reason"]), /more than one model/);

    /* An unreadable transcript is consulted-and-silent, never absent. */
    const missing = writer.observeServedModel(join(directory, "not-here.jsonl"));
    assert.equal(missing["kind"], "unresolved");

    /* And the resolving arm, so the three refusals are about their causes. */
    writeFileSync(
      transcript,
      `${JSON.stringify({ type: "assistant", message: { model: OBSERVED_MODEL } })}\n`,
    );
    const resolvedOk = writer.observeServedModel(transcript);
    assert.equal(resolvedOk["kind"], "observed");
    assert.equal(resolvedOk["model"], OBSERVED_MODEL);

    /* An unresolved observation reaches the record as `unresolved`, with a
       reason, and never as a family token nobody saw. */
    writeFileSync(transcript, "");
    const record = pluginRecord({ observation: writer.observeServedModel(transcript) });
    const resolved = record["resolved"] as Record<string, unknown>;
    assert.equal(resolved["provenance"], "unresolved");
    assert.equal(resolved["family"], undefined);
    assert.equal(resolved["model"], undefined);
    assert.equal(
      runCli(["validate", "--type", "model-resolution", stage(record)]).status,
      0,
    );

    /* NOBODY LOOKED is a different fact and it is expressed by passing no
       observation at all, which is what the shipped adapter does. */
    const unobserved = pluginRecord();
    assert.equal(
      (unobserved["resolved"] as Record<string, unknown>)["provenance"],
      "self-reported",
    );
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 7: the charter override is resolved, not assumed           */
/* ------------------------------------------------------------------ */

test(
  "a charter overrides the tier of a role that allows it and not of a role that forbids it",
  () => {
    const charter = { path: "charter.yaml", tier: "strongest" };
    const configPath = "role-model-config.yaml";

    const permitted = writer.resolveTier({
      role: "implementer",
      requestedTier: "cheaper",
      policy: { configPath, charterOverride: "allowed", charter },
    });
    assert.equal(permitted["tier"], "strongest");
    assert.equal(permitted["overrideApplied"], true);
    assert.equal(permitted["charterPath"], charter.path);
    assert.equal(permitted["charterTier"], charter.tier);
    assert.equal(permitted["provenance"], "observed");
    const permittedObservation = permitted["observation"] as Record<string, unknown>;
    assert.equal(permittedObservation["consulted"], true);
    assert.equal(permittedObservation["configPath"], configPath);
    assert.equal(permittedObservation["configPermission"], "allowed");

    /*
     * THE DIRECTION A HAPPY-PATH RESOLVER DROPS. Same charter, same requested
     * tier, one field different, and nothing about the wrong answer looks like
     * a failure: `strongest` is a legal tier, the record still validates, and
     * the only thing wrong is that a document was allowed to override a role
     * that forbids it.
     */
    const forbidden = writer.resolveTier({
      role: "implementer",
      requestedTier: "cheaper",
      policy: { configPath, charterOverride: "forbidden", charter },
    });
    assert.equal(forbidden["tier"], "cheaper");
    assert.equal(forbidden["overrideApplied"], false);
    assert.equal(forbidden["charterPath"], undefined);
    assert.equal(
      (forbidden["observation"] as Record<string, unknown>)["configPermission"],
      "forbidden",
    );

    /* An unknown permission value is NOT permission. Fail-open on the one
       field that gates an override is the direction that costs something. */
    const unknown = writer.resolveTier({
      role: "implementer",
      requestedTier: "cheaper",
      policy: { configPath, charterOverride: "maybe", charter },
    });
    assert.equal(unknown["overrideApplied"], false);
    assert.equal(unknown["tier"], "cheaper");

    /* Both directions survive into a whole record and through the validator,
       including the derived check that refuses an override taken where the
       role forbids it. */
    for (const charterOverride of ["allowed", "forbidden"]) {
      const record = pluginRecord({
        policy: { configPath, charterOverride, charter },
      });
      const run = runCli(["validate", "--type", "model-resolution", stage(record)]);
      assert.equal(run.status, 0, `${charterOverride}: ${run.stdout}${run.stderr}`);
    }

    const smuggled = pluginRecord({
      policy: { configPath, charterOverride: "allowed", charter },
    });
    (
      (smuggled["resolution"] as Record<string, unknown>)["observation"] as Record<
        string,
        unknown
      >
    )["configPermission"] = "forbidden";
    const refused = runCli([
      "validate",
      "--type",
      "model-resolution",
      stage(smuggled),
    ]);
    assert.equal(refused.status, 1);
    assert.equal(
      refused.stdout,
      `${capturedDiagnostic("#/resolution/observation/configPermission")}\n`,
    );

    /* And nothing is claimed that was not read: with no policy document the
       observation says so and cites no path at all. */
    const unconsulted = writer.resolveTier({
      role: "implementer",
      requestedTier: "cheaper",
    });
    const unconsultedObservation = unconsulted["observation"] as Record<string, unknown>;
    assert.equal(unconsultedObservation["consulted"], false);
    assert.equal(unconsultedObservation["configPath"], undefined);
    assert.equal(unconsultedObservation["configPermission"], undefined);
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 8: the family token reaches the verdict                    */
/* ------------------------------------------------------------------ */

test(
  "the family token copied into a verdict equals the record's byte for byte",
  () => {
    const record = pluginRecord({
      observation: {
        kind: "observed",
        source: "transcript:/a.jsonl",
        model: OBSERVED_MODEL,
        detail: "one distinct model",
      },
    });
    const family = kernel.producedByFromRecord(record);
    assert.notEqual(family, undefined);
    const token = family as string;

    /*
     * BYTE FOR BYTE, ASSERTED AS BYTES. A copy that trimmed, lowercased or
     * prefixed the token would satisfy every prose reading of "reaches the
     * verdict" and would break the one comparison the token exists for, so the
     * comparison here is over the encoded bytes rather than over the strings.
     */
    const verdict = {
      kind: "verdict",
      phase: "M4-P7",
      head: "0".repeat(40),
      verdict: "APPROVE",
      "produced-by": token,
      framing: "criteria-contract",
      "review-contract": "criteria",
      findings: [],
      criteria: [
        {
          id: "8",
          quote: "Closeout copies the family token into the verdict.",
          evidence: ["test/model-resolution.test.ts"],
          met: true,
        },
      ],
      "deviations-judged": [],
    };
    assert.deepEqual(
      Buffer.from(verdict["produced-by"], "utf8"),
      Buffer.from(
        ((record["resolved"] as Record<string, unknown>)["family"] as string),
        "utf8",
      ),
    );

    /* The copied value is accepted where a verdict carries it, checked against
       the shipped verdict schema rather than against this test's idea of it. */
    const verdictSchema = JSON.parse(
      readFileSync(join(repoRoot, "schemas", "verdict.schema.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.deepEqual(validateModule.validateToLines(verdictSchema, verdict), []);

    /* An unresolved record has no token to copy, and says so rather than
       handing the verdict an empty string that would validate. */
    const unresolved = pluginRecord({
      observation: { kind: "unresolved", reason: "the transcript was empty at hook time" },
    });
    assert.equal(kernel.producedByFromRecord(unresolved), undefined);
  },
);

/* ------------------------------------------------------------------ */
/* The registered behaviors resolve by name                             */
/* ------------------------------------------------------------------ */

test("every model-resolution behavior resolves by name in the registry", () => {
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  /* DERIVED FROM THE REGISTRY, NEVER COUNTED. A count is a claim about every
     future phase and is false the moment the next one appends (CLAUDE.md
     binding convention 5). */
  const mine = Object.keys(behaviors).filter((id) => id.startsWith("model-resolution-"));
  assert.ok(mine.length > 0, "no model-resolution behavior is registered");
  for (const id of mine) {
    assert.equal(typeof behaviors[id], "string");
    assert.notEqual(behaviors[id], "");
  }
});
