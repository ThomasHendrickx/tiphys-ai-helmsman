import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * ADAPTER SELECTION AND THE PUBLIC ENTRY POINT (kernel plan M4, M4-P4).
 *
 * THE SUBJECT IS A RESOLUTION ROOT, not a flag. `--adapter` is the visible
 * half; the half that matters is that the specifier is resolved from the
 * FLEET HOME and never from the project clone, because loading an adapter
 * runs third-party code inside the process that holds delegated merge
 * authority under DR-0012, and the project clone is the thing under review.
 *
 * So every resolution test here builds a scratch fleet with a REAL module in
 * a REAL node_modules directory on one side, the other, or both, and asserts
 * WHICH ONE LOADED rather than that a load happened. A test that only checked
 * the fleet-home copy loads would be green whether or not the project clone
 * was also on the search path, which is the shape criterion 3 exists to
 * refuse.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceEntry = join(repoRoot, "bin", "tiphys.ts");
const distIndex = join(repoRoot, "dist", "src", "index.js");

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Adapter Load Test",
  GIT_AUTHOR_EMAIL: "adapter-load-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Adapter Load Test",
  GIT_COMMITTER_EMAIL: "adapter-load-test@tiphys.invalid",
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** The CLI's environment, with any ambient holder identity removed. */
function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  return env;
}

function runCli(args: string[], opts: { cwd?: string } = {}): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: baseEnv(),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function git(dir: string, args: string[]): CliResult {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitOk(dir: string, args: string[]): string {
  const result = git(dir, args);
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * CANONICAL, not merely absolute: git canonicalises every worktree path it
 * records, so a composed path and a path git printed are two spellings of one
 * directory on any platform whose temp directory is reached through a
 * symlink. The reasoning is test/spawn.test.ts:84's, inherited deliberately
 * rather than rediscovered.
 */
function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-p4-adapter-")));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

interface Scratch {
  tmp: string;
  fleet: string;
  upstream: string;
  clone: string;
  briefFile: string;
}

/** Fleet home plus an upstream repo and a clone of it under projects/. */
function makeScratch(t: { after(fn: () => void): void }): Scratch {
  const tmp = makeTempDir(t);
  const fleet = join(tmp, "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const upstream = join(tmp, "upstream");
  gitOk(tmp, ["init", "--initial-branch=main", upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  gitOk(upstream, ["add", "-A"]);
  gitOk(upstream, ["commit", "-m", "commit one"]);
  const clone = join(fleet, "projects", "demo");
  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
  const briefFile = join(tmp, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  return { tmp, fleet, upstream, clone, briefFile };
}

function spawnCli(scratch: Scratch, taskId: string, extra: string[] = []): CliResult {
  return runCli(
    [
      "spawn",
      "--task",
      taskId,
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      "ship",
      "--exec",
      "/bin/true",
      ...extra,
    ],
    { cwd: scratch.fleet },
  );
}

function taskDirOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "tasks", taskId);
}

function worktreeOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "worktrees", taskId);
}

function executorRecordOf(scratch: Scratch, taskId: string): { adapter: string } {
  return JSON.parse(
    readFileSync(join(taskDirOf(scratch, taskId), "executor.json"), "utf8"),
  ) as { adapter: string };
}

/**
 * The project clone's git-visible state. TWO OF THE FOUR POST-CONDITIONS A
 * refusal owes ARE NOT FILES: a refusal that left a branch and a worktree
 * behind would still satisfy "no task directory" and "no pool record", which
 * is half a check and the half this repository has had wrong before (F-2's
 * orphaned worktree, branch and pool record).
 */
function gitVisibleState(scratch: Scratch): { worktrees: string; branches: string } {
  return {
    worktrees: gitOk(scratch.clone, ["worktree", "list"]),
    branches: gitOk(scratch.clone, ["branch", "--list"]),
  };
}

function assertNothingWasCreated(
  scratch: Scratch,
  taskId: string,
  before: { worktrees: string; branches: string },
  label: string,
): void {
  assert.equal(
    existsSync(taskDirOf(scratch, taskId)),
    false,
    `${label}: the task directory was created`,
  );
  assert.equal(
    existsSync(join(scratch.fleet, "worktrees", `${taskId}.pool.json`)),
    false,
    `${label}: a pool record was created`,
  );
  const after = gitVisibleState(scratch);
  assert.equal(after.worktrees, before.worktrees, `${label}: git worktree list changed`);
  assert.equal(after.branches, before.branches, `${label}: git branch --list changed`);
  assert.equal(
    existsSync(worktreeOf(scratch, taskId)),
    false,
    `${label}: the worktree directory was created`,
  );
}

/**
 * Real captured output from the program these behaviours consume, read out of
 * witness/captures/ rather than retyped (CLAUDE.md's red-witness rule). The
 * path is computed rather than written as a literal, which is also what keeps
 * rule (g)'s text-assertion derivation from reading a behavioural read as a
 * document assertion.
 */
function readCapture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../witness/captures/${name}`, import.meta.url)),
    "utf8",
  );
}

/** The basename the default-adapter witness cites, named once. */
const HOOK_CAPTURE = "spawn-turn-end-hook-record.txt";

/**
 * The shape the capture records for a turn-end record the generated hook
 * ACTUALLY wrote, read out of the capture rather than restated. The built-in
 * adapter runs that hook with spawnSync, so the default arm of the
 * default-adapter behaviour genuinely consumes another program's output.
 */
function assertTurnEndMatchesCapture(turnEndFile: string, expectedExitCode: number): void {
  const captured = readCapture(HOOK_CAPTURE);
  assert.match(captured, /"endedAt": "[0-9]{4}-[0-9]{2}-[0-9]{2}T/, HOOK_CAPTURE);
  assert.match(captured, /"exitCode": [0-9]+/, HOOK_CAPTURE);
  const record = JSON.parse(readFileSync(turnEndFile, "utf8")) as {
    endedAt: unknown;
    exitCode: unknown;
  };
  assert.equal(typeof record.endedAt, "string", "captured contract: endedAt is a string");
  assert.equal(
    Number.isNaN(Date.parse(record.endedAt as string)),
    false,
    "captured contract: endedAt parses as an instant",
  );
  assert.equal(record.exitCode, expectedExitCode, "captured contract: exitCode is the argument");
}

/**
 * Write a REAL installed package at `<root>/node_modules/<specifier>`.
 *
 * A real directory with a real `package.json` rather than a stub on a search
 * path: the property under test is Node module resolution, and a fixture that
 * did not go through it would witness nothing about it. `"type": "module"` is
 * on the fixture's own package.json because a fleet home's package.json
 * declares no type, so an ES module fixture inheriting from it would be
 * parsed as CommonJS and fail for a reason that has nothing to do with this
 * phase.
 *
 * `sentinel`, when given, is written AT IMPORT TIME, before anything else in
 * the module body. It is what separates "the specifier did not resolve" from
 * "it resolved, was evaluated, and was then rejected": only the first is safe,
 * and the two are indistinguishable from the exit code alone.
 */
function installAdapter(
  root: string,
  specifier: string,
  options: { adapterName?: string; sentinel?: string; body?: string } = {},
): void {
  const dir = join(root, "node_modules", specifier);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      { name: specifier, version: "0.0.0", type: "module", main: "index.js" },
      null,
      2,
    )}\n`,
  );
  const sentinelLine =
    options.sentinel === undefined
      ? ""
      : `writeFileSync(${JSON.stringify(options.sentinel)}, "evaluated\\n");\n`;
  const body =
    options.body ??
    `const NAME = ${JSON.stringify(options.adapterName ?? specifier)};
export default {
  name: NAME,
  requires: [],
  async launch(request) {
    writeFileSync(
      request.recordPath,
      JSON.stringify({ adapter: NAME, launchedAt: new Date().toISOString() }, null, 2) + "\\n",
    );
    const hooked = spawnSync(process.execPath, [request.hookPath, "0"], {
      ...(request.env === undefined ? {} : { env: request.env }),
    });
    if (hooked.status !== 0) {
      return { kind: "incomplete", reason: "the fixture adapter could not run the hook" };
    }
    return { kind: "completed", exitCode: 0 };
  },
};
`;
  writeFileSync(
    join(dir, "index.js"),
    `import { writeFileSync } from "node:fs";\nimport { spawnSync } from "node:child_process";\n${sentinelLine}${body}`,
  );
}

/** Declare a default adapter in the fleet home's own package.json. */
function declareFleetDefault(scratch: Scratch, specifier: string): void {
  const path = join(scratch.fleet, "package.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  parsed["tiphys"] = { adapter: specifier };
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

test(
  "the --adapter flag resolves the adapter from the fleet home and the launch record names it",
  (t) => {
    const scratch = makeScratch(t);
    installAdapter(scratch.fleet, "fleet-test-adapter", {
      adapterName: "fleet-home-test-adapter",
    });

    const result = spawnCli(scratch, "t-flag", ["--adapter", "fleet-test-adapter"]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

    // THE LOADED ADAPTER'S NAME IN THE RECORD is the whole assertion: the
    // launch record is the only artifact that ever says what ran, so a spawn
    // that succeeded through the BUILT-IN adapter would be indistinguishable
    // from this one by exit code alone.
    assert.equal(executorRecordOf(scratch, "t-flag").adapter, "fleet-home-test-adapter");
    assertTurnEndMatchesCapture(join(taskDirOf(scratch, "t-flag"), "turn-end"), 0);
  },
);

test(
  "an adapter that exists only in the project clone is refused naming the fleet home, and the module is never evaluated",
  (t) => {
    /*
     * DANGEROUS STATE: a project clone under review supplying the code that
     * runs in the orchestrator's own process. DR-0029 Part 2c's untrusted-
     * project-content boundary does not exist, so the resolution root is the
     * only thing between a pull request and arbitrary code in the process
     * that holds delegated merge authority.
     *
     * THE SENTINEL IS THE POINT. "Resolution failed" and "resolved, ran, and
     * was then rejected" produce the same nonzero exit and the same absent
     * task directory, and only the first is safe. The fixture writes its
     * sentinel as its FIRST statement at import time, so the sentinel's
     * absence is evidence that no byte of the module body ran.
     */
    const scratch = makeScratch(t);
    const sentinel = join(scratch.tmp, "evil-was-evaluated");
    installAdapter(scratch.clone, "evil-adapter", {
      adapterName: "project-clone-evil-adapter",
      sentinel,
    });
    assert.equal(
      existsSync(join(scratch.clone, "node_modules", "evil-adapter", "index.js")),
      true,
      "precondition: the project clone really does carry the module",
    );
    assert.equal(
      existsSync(join(scratch.fleet, "node_modules", "evil-adapter")),
      false,
      "precondition: the fleet home does not carry it",
    );
    const before = gitVisibleState(scratch);

    const result = spawnCli(scratch, "t-evil", ["--adapter", "evil-adapter"]);
    assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /evil-adapter/, result.stderr);
    assert.ok(
      result.stderr.includes(realpathSync(scratch.fleet)),
      `the refusal does not name the fleet home as the resolution root: ${result.stderr}`,
    );
    assert.equal(
      existsSync(sentinel),
      false,
      "the project clone's module was EVALUATED; resolution reached it",
    );
    assertNothingWasCreated(scratch, "t-evil", before, "project-clone adapter");
  },
);

test(
  "with the same adapter name in the fleet home and the project clone, the fleet home copy is the one that launches",
  (t) => {
    /*
     * THE SILENT MEMBER of the same class, and it is structurally different
     * from the refusal above rather than a second instance of it. That one
     * fails LOUDLY; this one would SUCCEED against the wrong module. A loader
     * that merely added the fleet home to a search path could pass one of the
     * two, which is why both are asserted.
     */
    const scratch = makeScratch(t);
    const projectSentinel = join(scratch.tmp, "project-copy-was-evaluated");
    installAdapter(scratch.fleet, "shared-test-adapter", {
      adapterName: "fleet-home-copy",
    });
    installAdapter(scratch.clone, "shared-test-adapter", {
      adapterName: "project-clone-copy",
      sentinel: projectSentinel,
    });

    const result = spawnCli(scratch, "t-both", ["--adapter", "shared-test-adapter"]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.equal(
      executorRecordOf(scratch, "t-both").adapter,
      "fleet-home-copy",
      "the project clone's copy of the specifier is what launched",
    );
    assert.equal(
      existsSync(projectSentinel),
      false,
      "the project clone's copy was evaluated even though the fleet home's won",
    );
  },
);

test(
  "a module that is not an adapter is refused before a worktree, a branch, a task directory or a pool record exists",
  (t) => {
    /*
     * THREE SHAPES, each asserted, because they are three different ways a
     * module can be importable and not be an adapter and a check written for
     * one of them is silent on the others. Left unchecked every one of them
     * surfaces as a TypeError raised out of spawnTask AFTER pool create has
     * made a worktree, a branch and a pool record, which is M4-P3's
     * refusal-after-creation shape with a different cause: hence the same four
     * post-conditions.
     */
    const scratch = makeScratch(t);
    installAdapter(scratch.fleet, "shape-no-default", {
      body: "export const notTheDefault = { name: 'x', requires: [], launch() {} };\n",
    });
    installAdapter(scratch.fleet, "shape-no-launch", {
      body: "export default { name: 'shape-no-launch', requires: [] };\n",
    });
    installAdapter(scratch.fleet, "shape-launch-not-a-function", {
      body: "export default { name: 'shape-bad', requires: [], launch: 'not a function' };\n",
    });

    const shapes: Array<[string, RegExp]> = [
      ["shape-no-default", /no default export/],
      ["shape-no-launch", /no launch member/],
      ["shape-launch-not-a-function", /launch member is string/],
    ];
    for (const [specifier, member] of shapes) {
      const before = gitVisibleState(scratch);
      const taskId = `t-${specifier}`;
      const result = spawnCli(scratch, taskId, ["--adapter", specifier]);
      assert.notEqual(result.status, 0, `${specifier}: ${result.stdout}${result.stderr}`);
      assert.ok(
        result.stderr.includes(specifier),
        `${specifier}: the refusal does not name the specifier: ${result.stderr}`,
      );
      assert.match(result.stderr, member, `${specifier}: ${result.stderr}`);
      assertNothingWasCreated(scratch, taskId, before, specifier);
    }
  },
);

test(
  "a loaded adapter claiming the built-in adapter name is refused and the built-in one still launches",
  (t) => {
    /*
     * DANGEROUS STATE: the launch record's adapter field saying `subprocess`
     * when a loaded module ran. That field is the only thing that ever says
     * what ran, and the ambiguity is unresolvable afterwards because the
     * record is the only witness. This is the misattribution guard the
     * release record already instantiates, one layer down.
     *
     * The second arm is the control: the same fleet, the same task shape, no
     * flag, and the record legitimately says `subprocess`. Without it the
     * refusal above is satisfied by a kernel that refuses every spawn.
     */
    const scratch = makeScratch(t);
    installAdapter(scratch.fleet, "impostor-adapter", { adapterName: "subprocess" });
    const before = gitVisibleState(scratch);

    const refused = spawnCli(scratch, "t-impostor", ["--adapter", "impostor-adapter"]);
    assert.notEqual(refused.status, 0, `${refused.stdout}${refused.stderr}`);
    assert.ok(
      refused.stderr.includes("impostor-adapter"),
      `the refusal does not name the specifier: ${refused.stderr}`,
    );
    assert.match(refused.stderr, /names itself subprocess/, refused.stderr);
    assertNothingWasCreated(scratch, "t-impostor", before, "name collision");

    const accepted = spawnCli(scratch, "t-builtin");
    assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
    assert.equal(executorRecordOf(scratch, "t-builtin").adapter, "subprocess");
  },
);

test(
  "the launch record names the built-in adapter, the fleet home default, and the flag that outranks it",
  (t) => {
    /*
     * THREE ARMS, ONE ASSERTION EACH (criterion 6). The default being
     * INVISIBLE in the record is the state this refuses: a record that named
     * nothing when no flag was passed would make every later reader guess
     * which adapter ran, and the launch record is written before the payload
     * starts precisely so that nobody has to.
     */
    const scratch = makeScratch(t);

    // Arm 1: no flag, no fleet-home field. The built-in adapter really runs
    // the payload and really invokes the generated turn-end hook, so this arm
    // is also where the captured hook contract is checked.
    const plain = spawnCli(scratch, "t-default");
    assert.equal(plain.status, 0, `${plain.stdout}${plain.stderr}`);
    assert.equal(executorRecordOf(scratch, "t-default").adapter, "subprocess");
    assertTurnEndMatchesCapture(join(taskDirOf(scratch, "t-default"), "turn-end"), 0);

    // Arm 2: a fleet-home field and no flag.
    installAdapter(scratch.fleet, "declared-test-adapter", {
      adapterName: "fleet-declared-adapter",
    });
    declareFleetDefault(scratch, "declared-test-adapter");
    const declared = spawnCli(scratch, "t-declared");
    assert.equal(declared.status, 0, `${declared.stdout}${declared.stderr}`);
    assert.equal(
      executorRecordOf(scratch, "t-declared").adapter,
      "fleet-declared-adapter",
    );

    // Arm 3: both, and the FLAG wins. A per-spawn instruction outranks a
    // standing one; the opposite order would make the flag unusable on any
    // fleet that declared a default.
    installAdapter(scratch.fleet, "flag-test-adapter", {
      adapterName: "flag-supplied-adapter",
    });
    const both = spawnCli(scratch, "t-both-sources", ["--adapter", "flag-test-adapter"]);
    assert.equal(both.status, 0, `${both.stdout}${both.stderr}`);
    assert.equal(
      executorRecordOf(scratch, "t-both-sources").adapter,
      "flag-supplied-adapter",
    );
  },
);

/* ------------------------------------------------------------------ */
/* The package surface (criteria 7 and 8).                             */
/* ------------------------------------------------------------------ */

/**
 * A scratch consumer whose `node_modules/@tiphys/kernel` is this repository.
 *
 * BY THE PACKAGE NAME, never by a relative path: the thing under test is the
 * `exports` map, and a relative import does not consult one at all, so a test
 * written that way would be green on a package that publishes nothing.
 */
function makeConsumer(t: { after(fn: () => void): void }): string {
  const dir = makeTempDir(t);
  mkdirSync(join(dir, "node_modules", "@tiphys"), { recursive: true });
  symlinkSync(repoRoot, join(dir, "node_modules", "@tiphys", "kernel"), "dir");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "consumer", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
  );
  return dir;
}

/** What `import(specifier)` did, reported as data rather than as a throw. */
function importOutcome(consumer: string, specifier: string): { ok: boolean; code: string } {
  const probe =
    "import(process.argv[1])" +
    ".then(() => { process.stdout.write('ok\\n'); })" +
    ".catch((error) => { process.stdout.write('error ' + String(error.code) + '\\n'); });";
  const result = spawnSync(process.execPath, ["-e", probe, specifier], {
    encoding: "utf8",
    cwd: consumer,
  });
  const printed = (result.stdout ?? "").trim();
  return { ok: printed === "ok", code: printed.startsWith("error ") ? printed.slice(6) : "" };
}

test(
  "a consumer importing the executor contract from the package name type-checks and loads against the built dist",
  {
    skip: existsSync(distIndex)
      ? false
      : "dist/src/index.js is absent; run npm run build first (CI builds before it tests)",
  },
  (t) => {
    const consumer = makeConsumer(t);
    writeFileSync(
      join(consumer, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: "nodenext",
            moduleResolution: "nodenext",
            target: "es2024",
            strict: true,
            noEmit: true,
            types: [],
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      )}\n`,
    );
    /*
     * THE FOUR TYPES ARE USED, not merely imported. A type-only import of a
     * name that does not exist is an error, but a type that exists and is
     * WRONG is only caught by writing something against it, and the point of
     * publishing the seam is that a plugin can implement it.
     */
    writeFileSync(
      join(consumer, "consumer.ts"),
      [
        'import type { ExecutorAdapter, ExecutorRequest, ExecutorRecord, LaunchOutcome } from "@tiphys/kernel";',
        'import { requirableRequestFields, BUILT_IN_ADAPTER_NAME } from "@tiphys/kernel";',
        "",
        "const adapter: ExecutorAdapter = {",
        '  name: "consumer-adapter",',
        "  requires: requirableRequestFields().slice(0, 0),",
        "  async launch(request: ExecutorRequest): Promise<LaunchOutcome> {",
        "    const record: ExecutorRecord = {",
        "      adapter: BUILT_IN_ADAPTER_NAME === \"subprocess\" ? \"consumer-adapter\" : \"consumer-adapter\",",
        "      launchedAt: new Date().toISOString(),",
        "    };",
        "    void record;",
        "    void request.briefPath;",
        "    return { kind: \"completed\", exitCode: 0 };",
        "  },",
        "};",
        "void adapter;",
        "",
      ].join("\n"),
    );

    const tsc = spawnSync(
      process.execPath,
      [join(repoRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"],
      { encoding: "utf8", cwd: consumer },
    );
    assert.equal(tsc.status, 0, `${tsc.stdout ?? ""}${tsc.stderr ?? ""}`);

    const loaded = importOutcome(consumer, "@tiphys/kernel");
    assert.equal(loaded.ok, true, `importing @tiphys/kernel failed: ${loaded.code}`);
  },
);

test(
  "the kernel entry point publishes the adapter contract and the exports map refuses every internal subpath",
  async (t) => {
    /*
     * DANGEROUS STATE: an `exports` map written `"./*": "./dist/src/*"`. It
     * satisfies criterion 7 completely and publishes the entire kernel as
     * API, and a semver commitment is not reversible in a patch release, so
     * the failure is permanent in a way an ordinary defect is not.
     *
     * The subpath arm asserts the ERROR CODE rather than "it threw": with a
     * wildcard map present the import fails too, for a different reason
     * (the mapped file is absent), and a test that only required a throw
     * would be green on exactly the map it exists to refuse.
     */
    const consumer = makeConsumer(t);
    for (const subpath of [
      "@tiphys/kernel/dist/src/task.js",
      "@tiphys/kernel/dist/src/exec/env.js",
      "@tiphys/kernel/dist/src/spawn.js",
    ]) {
      const outcome = importOutcome(consumer, subpath);
      assert.equal(outcome.ok, false, `${subpath} is reachable through the package name`);
      assert.equal(
        outcome.code,
        "ERR_PACKAGE_PATH_NOT_EXPORTED",
        `${subpath} failed for the wrong reason: ${outcome.code}`,
      );
    }

    /*
     * AND THE OTHER DIRECTION, from the source entry rather than from dist,
     * so this arm runs whether or not the package has been built: the entry
     * point really does re-export the two contract values. Without it the
     * refusals above are satisfied by an entry point that exports nothing.
     * The computed-URL dynamic import is the pattern inherited warning 4
     * requires for reaching src/ from test/.
     */
    const entry = (await import(new URL("../src/index.ts", import.meta.url).href)) as {
      requirableRequestFields?: () => readonly string[];
      BUILT_IN_ADAPTER_NAME?: string;
    };
    assert.equal(
      typeof entry.requirableRequestFields,
      "function",
      "the entry point does not re-export requirableRequestFields",
    );
    assert.equal(
      entry.BUILT_IN_ADAPTER_NAME,
      "subprocess",
      "the entry point does not re-export the built-in adapter name",
    );
    assert.ok(
      (entry.requirableRequestFields as () => readonly string[])().includes("briefPath"),
      "the published requirable field list is not the kernel's own",
    );
  },
);

test(
  "an adapter specifier resolving into the project tree or outside the fleet home is refused before the module is evaluated",
  (t) => {
    /*
     * CR-F-CRED-002 / CH-002, AND THE MECHANISM RATHER THAN THE INSTANCE.
     * M4-P4 criterion 2's witness stages a package in the PROJECT CLONE's
     * node_modules and asserts a BARE specifier does not reach it. That is one
     * input shape. The rooting constrains the `node_modules` WALK and it does
     * not constrain a path, so a path-shaped specifier walks the tree the
     * rooting chose, and `<fleet>/projects/` is a subdirectory of that tree.
     *
     * The class is "code the fleet owner did not put in the fleet home
     * evaluated inside the process that holds delegated merge authority", and
     * it has two structurally different members, both driven here through the
     * real CLI: a specifier landing INSIDE `<fleet>/projects/`, and a
     * path-shaped specifier landing entirely OUTSIDE the fleet home. Each
     * module drops a SENTINEL FILE on import, so what is asserted is
     * EVALUATION, not resolution: a refusal that arrives after the import has
     * already run the code is no refusal at all.
     */
    const scratch = makeScratch(t);
    const fleetReal = realpathSync(scratch.fleet);
    const sentinelBody = (sentinel: string): string =>
      `import { writeFileSync } from "node:fs";\n` +
      `writeFileSync(${JSON.stringify(sentinel)}, "evaluated\\n");\n` +
      `export default { name: "sentinel-adapter", requires: [], async launch() { ` +
      `return { kind: "launch-failed", reason: "sentinel adapter ran" }; } };\n`;

    interface Arm {
      label: string;
      sentinel: string;
      module: string;
      specifier: string;
      expect: RegExp;
    }

    // MEMBER 1: inside the project clone, named by an ABSOLUTE path.
    const projectAbsoluteSentinel = join(scratch.tmp, "sentinel-project-absolute");
    const projectAbsoluteModule = join(scratch.clone, "evil-absolute.mjs");
    // MEMBER 1b: the same tree, named FLEET-RELATIVE, which is the form an
    // operator would plausibly type and which walks DOWN rather than anywhere.
    const projectRelativeSentinel = join(scratch.tmp, "sentinel-project-relative");
    const projectRelativeModule = join(scratch.clone, "evil-relative.mjs");
    // MEMBER 2, STRUCTURALLY DIFFERENT: outside the fleet home entirely. The
    // project-tree rule cannot see this one and the path-shape rule cannot see
    // member 1, so neither rule alone satisfies this test.
    const outsideSentinel = join(scratch.tmp, "sentinel-outside");
    const outsideModule = join(scratch.tmp, "evil-outside.mjs");

    const arms: Arm[] = [
      {
        label: "absolute into the project tree",
        sentinel: projectAbsoluteSentinel,
        module: projectAbsoluteModule,
        specifier: projectAbsoluteModule,
        expect: /inside the project tree/,
      },
      {
        label: "fleet-relative into the project tree",
        sentinel: projectRelativeSentinel,
        module: projectRelativeModule,
        specifier: "./projects/demo/evil-relative.mjs",
        expect: /inside the project tree/,
      },
      {
        label: "absolute outside the fleet home",
        sentinel: outsideSentinel,
        module: outsideModule,
        specifier: outsideModule,
        expect: /outside the fleet home/,
      },
    ];

    for (const arm of arms) {
      writeFileSync(arm.module, sentinelBody(arm.sentinel));
    }

    for (const [index, arm] of arms.entries()) {
      const taskId = `containment-${index}`;
      const result = spawnCli(scratch, taskId, ["--adapter", arm.specifier]);
      assert.notEqual(result.status, 0, `${arm.label}: the spawn did not refuse`);
      assert.match(
        result.stderr,
        arm.expect,
        `${arm.label}: the refusal does not name why (${result.stderr})`,
      );
      assert.equal(
        existsSync(arm.sentinel),
        false,
        `${arm.label}: the module WAS EVALUATED inside the orchestrator process`,
      );
      assert.equal(
        existsSync(taskDirOf(scratch, taskId)),
        false,
        `${arm.label}: a task directory survived the refusal`,
      );
    }

    /*
     * THE GREEN CONTROL, and it is not optional: without it a loader that
     * refused every path-shaped specifier would satisfy all three arms above.
     * The same module shape, INSIDE the fleet home and outside projects/,
     * named by a fleet-relative path, loads and runs.
     */
    const goodSentinel = join(scratch.tmp, "sentinel-good");
    const goodDir = join(fleetReal, "adapters");
    mkdirSync(goodDir, { recursive: true });
    writeFileSync(join(goodDir, "good.mjs"), sentinelBody(goodSentinel));
    const good = spawnCli(scratch, "containment-control", [
      "--adapter",
      "./adapters/good.mjs",
    ]);
    assert.equal(
      existsSync(goodSentinel),
      true,
      `a fleet-home adapter was not evaluated (${good.stderr})`,
    );
    assert.match(
      good.stderr,
      /sentinel adapter ran/,
      `the fleet-home adapter did not reach launch (${good.stderr})`,
    );
  },
);

test("every adapter behavior in the registry resolves by name to a test title in this file", () => {
  /*
   * BY NAME, NEVER BY COUNT (binding convention 5, the append-only registry
   * rule). The set is DERIVED from the registry at run time, so a later phase
   * appending rows cannot redden this, and no number is pinned.
   */
  const behaviors = JSON.parse(
    readFileSync(fileURLToPath(new URL("./behaviors.json", import.meta.url)), "utf8"),
  ) as Record<string, string>;
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const owned = Object.entries(behaviors)
    .filter(([, description]) => source.includes(`"${description}"`))
    .map(([id]) => id);
  assert.ok(
    owned.length > 0,
    "no registry description resolves to a test title in this file, so this " +
      "check is vacuous and would stay green however the file was renamed",
  );
  for (const id of [
    "spawn-adapter-flag-resolves-from-fleet-home",
    "spawn-adapter-project-clone-not-a-root",
    "spawn-adapter-fleet-home-wins-over-project",
    "spawn-adapter-shape-refused-creates-nothing",
    "spawn-adapter-name-collision-refused",
    "spawn-adapter-default-recorded-explicitly",
    "spawn-adapter-resolved-path-containment",
    "kernel-exports-executor-types",
    "kernel-exports-do-not-widen-package",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
    assert.ok(
      owned.includes(id),
      `behavior ${id} is registered but its description is not a test title in this file`,
    );
  }
});
