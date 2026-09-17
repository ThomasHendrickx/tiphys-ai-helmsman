import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M4-P9: THE PROJECT-WRITE BLOCK, WITH BOTH CARVE-OUTS.
 *
 * TWO PROGRAMS' REAL OUTPUT IS CONSUMED HERE AND NEITHER IS TYPED BY HAND,
 * which is what the red-witness rule asks for when a behaviour consumes
 * another program's output (CLAUDE.md:398):
 *
 *   1. Claude Code 2.1.273's own `PreToolUse` payloads. Step 1 of this phase
 *      fired one hook against `Write`, `Edit` and `Bash` and appended the RAW
 *      stdin bytes; the capture is
 *      witness/captures/m4-p9-pretooluse-payloads.txt:1 and the tests below
 *      parse the payloads back out of it rather than restating them. The
 *      end-to-end turns are witness/captures/m4-p9-end-to-end-agent-turn.txt:1,
 *      including the CONTROL arm with no hook at all.
 *   2. `git` itself. The merge carve-out is not tested against a predicate
 *      over a string that looks like a ref path: a real repository is created,
 *      a real `git merge --ff-only` is run, the ref is observed to MOVE, and
 *      every path that merge actually wrote is put through the shipped hook.
 *
 * NOTHING HERE NEEDS `dist/`. Every test runs from source, on purpose: the
 * red-witness harness evaluates a member in a scratch CLONE with `dist/`
 * absent, and a test that skips there is a test that cannot go red.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const blockEntry = join(repoRoot, "plugin", "src", "hooks", "project-write-block.ts");
const manifestPath = join(repoRoot, "plugin", ".claude-plugin", "plugin.json");
const payloadCapture = join(
  repoRoot,
  "witness",
  "captures",
  "m4-p9-pretooluse-payloads.txt",
);
const endToEndCapture = join(
  repoRoot,
  "witness",
  "captures",
  "m4-p9-end-to-end-agent-turn.txt",
);

/* The computed-URL dynamic import pattern of standing warning 4: a literal
   relative path into `plugin/src` fails the build with TS2878 under
   rewriteRelativeImportExtensions across the project reference. */
interface WriteRequestShape {
  tool: string;
  targetPath?: string;
}
type ProjectRootsShape =
  | { kind: "observed"; roots: readonly string[] }
  | { kind: "unresolved"; reason: string };
interface BypassShape {
  kind: "write-bypass";
  contractVersion: string;
  project: string;
  paths: readonly string[];
  reason: string;
  expiresAt: string;
  declaredBy: string;
  declaredAt: string;
}
type DecisionShape =
  | { verdict: "permit"; reason: string; bypass?: Record<string, string> }
  | { verdict: "refuse"; reason: string };

const block = (await import(new URL("../plugin/src/hooks/project-write-block.ts", import.meta.url).href)) as {
  ADJUDICATED_TOOLS: readonly string[];
  BYPASS_BASENAME: string;
  BYPASS_EVIDENCE_BASENAME: string;
  EXIT_PERMIT: number;
  EXIT_REFUSE: number;
  decideWrite(
    request: WriteRequestShape,
    roots: ProjectRootsShape,
    bypass: BypassShape | undefined,
    now: string,
  ): DecisionShape;
  requestFromPayload(raw: string):
    | { ok: true; tool: string; cwd: string; targetPath?: string }
    | { ok: false; reason: string };
  runHook(raw: string, now: string): { exitCode: number; stderr: string };
  canonicalisePath(path: string): string;
  isGitInternal(root: string, path: string): boolean;
};

/* -------------------------------------------------------------------- */
/* Laboratory                                                            */
/* -------------------------------------------------------------------- */

/** Command-scoped git identity; CI runners have no git identity (warning 5). */
const GIT_IDENTITY = [
  "-c",
  "user.name=tiphys-test",
  "-c",
  "user.email=tiphys-test@example.invalid",
];

function git(cwd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const run = spawnSync("git", [...GIT_IDENTITY, ...args], { cwd, encoding: "utf8" });
  return { status: run.status ?? -1, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

/** A fleet home, by the layout src/fleet.ts:12 declares. */
function makeFleet(): string {
  const root = mkdtempSync(join(tmpdir(), "m4p9-fleet-"));
  for (const name of ["charter", "decisions", "state", "tasks", "worktrees", "projects"]) {
    mkdirSync(join(root, name), { recursive: true });
  }
  writeFileSync(join(root, "backlog.md"), "# backlog\n");
  writeFileSync(join(root, "package.json"), '{"name":"fleet","private":true}\n');
  writeFileSync(join(root, ".gitignore"), "state/\nworktrees/\nprojects/\n");
  return root;
}

/** A plain (non-git) project working tree under `<fleet>/projects/`. */
function makePlainProject(fleetRoot: string, name: string): string {
  const root = join(fleetRoot, "projects", name);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export const answer = 41\n");
  writeFileSync(join(root, ".gitignore"), "dist/\n");
  return root;
}

/** The sha256 of a file's bytes, so "unchanged" is a measurement. */
function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A `PreToolUse` payload of the shape step 1 measured. */
function payloadFor(tool: string, cwd: string, filePath: string): string {
  return JSON.stringify({
    session_id: "m4p9",
    cwd,
    permission_mode: "bypassPermissions",
    hook_event_name: "PreToolUse",
    tool_name: tool,
    tool_input: { file_path: filePath, content: "BROKEN\n" },
  });
}

/** Run the shipped wrapper as a REAL child, the way the harness invokes it. */
function runWrapper(payload: string): { exitCode: number; stderr: string } {
  const child = spawnSync(process.execPath, [blockEntry], {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { exitCode: child.status ?? -1, stderr: child.stderr ?? "" };
}

/**
 * Play one tool call past a `PreToolUse` hook, by the rule M4-P1 MEASURED and
 * M4-P6 already applies (test/plugin-hooks.test.ts:466).
 *
 * The exit-code half was measured from the outside: hook exit 0 left the file
 * CHANGED and hook exit 2 left it unchanged
 * (delivery/work-history/m4-p1.md:236). `runHookFirst` FALSE is the hook
 * ABSENT, which is the dangerous state criterion 2 requires this test to
 * exercise rather than describe.
 */
function playToolCall(
  runHookFirst: boolean,
  payload: string,
  targetPath: string,
  content: string,
): { hookExit: number | undefined; applied: boolean } {
  let hookExit: number | undefined;
  if (runHookFirst) {
    hookExit = runWrapper(payload).exitCode;
    if (hookExit === 2) {
      return { hookExit, applied: false };
    }
  }
  writeFileSync(targetPath, content);
  return { hookExit, applied: true };
}

/** Every `--- payload (verbatim) ---` line of a capture, in order. */
function capturedPayloads(capturePath: string): string[] {
  const lines = readFileSync(capturePath, "utf8").split("\n");
  const found: string[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (lines[index] === "--- payload (verbatim) ---") {
      found.push(lines[index + 1] as string);
    }
  }
  return found;
}

/* -------------------------------------------------------------------- */
/* Criterion 2, RED WITNESS 1: the working-tree write                    */
/* -------------------------------------------------------------------- */

test("a Write into a project working tree is refused and the same write lands when the hook is absent", () => {
  const fleet = makeFleet();
  try {
    const project = makePlainProject(fleet, "app");
    const target = join(project, "src", "app.ts");

    /* THE PURE DECISION (criterion 2, first half). */
    const decision = block.decideWrite(
      { tool: "Write", targetPath: block.canonicalisePath(target) },
      { kind: "observed", roots: [block.canonicalisePath(project)] },
      undefined,
      "2026-09-17T12:00:00Z",
    );
    assert.equal(decision.verdict, "refuse", decision.reason);
    assert.equal(
      decision.reason.includes("is inside the project working tree"),
      true,
      decision.reason,
    );

    /* THE DANGEROUS STATE, EXERCISED RATHER THAN DESCRIBED. With the hook
       ABSENT the very same tool call lands: the file's bytes and its mtime
       both change. A test that only showed the refusal would be green against
       a program that never had the chance to write. */
    const payload = payloadFor("Write", project, target);
    const before = { sha: sha256Of(target), mtime: statSync(target).mtimeMs };
    /* node stores mtime with sub-millisecond resolution but two writes inside
       one tick can still report the same value, so the loop below waits for
       the clock to move rather than sleeping a guessed interval. */
    const start = Date.now();
    while (Date.now() === start) {
      /* spin until the millisecond changes */
    }
    const absent = playToolCall(false, payload, target, "BROKEN\n");
    assert.equal(absent.applied, true);
    const afterAbsent = { sha: sha256Of(target), mtime: statSync(target).mtimeMs };
    assert.notEqual(afterAbsent.sha, before.sha, "the hook-absent write did not change the bytes");
    assert.notEqual(
      afterAbsent.mtime,
      before.mtime,
      "the hook-absent write did not change the mtime",
    );

    /* THE HOOK INSTALLED: exit 2, and the same call changes nothing. */
    const present = playToolCall(true, payload, target, "WORSE\n");
    assert.equal(present.hookExit, block.EXIT_REFUSE);
    assert.equal(present.applied, false);
    assert.equal(sha256Of(target), afterAbsent.sha, "the refused write changed the file anyway");
    assert.equal(statSync(target).mtimeMs, afterAbsent.mtime, "the refused write touched the mtime");
  } finally {
    rmSync(fleet, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 3, RED WITNESS 2: the ref-update carve-out                  */
/* -------------------------------------------------------------------- */

test("a real git merge --ff-only moves the ref and the block permits every path it wrote", () => {
  const fleet = makeFleet();
  try {
    /* A REAL upstream and a REAL clone of it, inside the fleet's projects/. */
    const upstream = join(fleet, "upstream");
    mkdirSync(upstream, { recursive: true });
    assert.equal(git(upstream, ["init", "-q", "--initial-branch=main"]).status, 0);
    writeFileSync(join(upstream, "app.txt"), "one\n");
    assert.equal(git(upstream, ["add", "-A"]).status, 0);
    assert.equal(git(upstream, ["commit", "-q", "-m", "one"]).status, 0);

    const project = join(fleet, "projects", "app");
    assert.equal(git(fleet, ["clone", "-q", upstream, project]).status, 0);

    writeFileSync(join(upstream, "app.txt"), "two\n");
    assert.equal(git(upstream, ["add", "-A"]).status, 0);
    assert.equal(git(upstream, ["commit", "-q", "-m", "two"]).status, 0);
    assert.equal(git(project, ["fetch", "-q", "origin"]).status, 0);

    const refBefore = git(project, ["rev-parse", "refs/heads/main"]).stdout.trim();

    /* Snapshot the clone so the paths the merge WRITES are derived from the
       filesystem rather than guessed from what a ref update ought to touch. */
    const before = listTree(project);
    const merge = git(project, ["merge", "--ff-only", "origin/main"]);
    const after = listTree(project);
    const refAfter = git(project, ["rev-parse", "refs/heads/main"]).stdout.trim();

    assert.equal(merge.status, 0, `${merge.stdout}${merge.stderr}`);
    assert.notEqual(refAfter, refBefore, "the merge did not move refs/heads/main");

    const written = [...after.keys()].filter(
      (path) => before.get(path) !== after.get(path),
    );
    assert.equal(written.length > 0, true, "the merge wrote nothing, so this proves nothing");

    /* THE CARVE-OUT, over the paths a real merge really wrote. The working
       tree file app.txt is among them and is NOT carved out: a merge that
       updates the working tree is the release manager's act, and this test
       asserts only that the REF UPDATES are permitted, which is the line
       M4-D-27 draws and the one AGENTS.md's clause draws. */
    const canonicalProject = block.canonicalisePath(project);
    const refUpdates = written.filter((path) =>
      block.isGitInternal(canonicalProject, block.canonicalisePath(join(project, path))),
    );
    assert.equal(refUpdates.length > 0, true, `no .git path among ${written.join(", ")}`);
    for (const path of refUpdates) {
      const absolute = block.canonicalisePath(join(project, path));
      const decision = block.decideWrite(
        { tool: "Write", targetPath: absolute },
        { kind: "observed", roots: [canonicalProject] },
        undefined,
        "2026-09-17T12:00:00Z",
      );
      assert.equal(decision.verdict, "permit", `${path}: ${decision.reason}`);
      const wrapper = runWrapper(payloadFor("Write", project, join(project, path)));
      assert.equal(wrapper.exitCode, block.EXIT_PERMIT, `${path}: ${wrapper.stderr}`);
    }

    /* And the criterion's own named path, stated explicitly so the assertion
       does not depend on which files this git version happened to touch. */
    const namedRef = join(canonicalProject, ".git", "refs", "heads", "main");
    const named = block.decideWrite(
      { tool: "Write", targetPath: namedRef },
      { kind: "observed", roots: [canonicalProject] },
      undefined,
      "2026-09-17T12:00:00Z",
    );
    assert.equal(named.verdict, "permit", named.reason);
    assert.equal(named.reason.includes("release-manager carve-out"), true, named.reason);
  } finally {
    rmSync(fleet, { recursive: true, force: true });
  }
});

/** Every regular file under `root`, mapped to a content fingerprint. */
function listTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (directory: string, prefix: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(directory, entry.name);
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(child, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      try {
        out.set(relativePath, sha256Of(child));
      } catch {
        /* a file that vanished between the walk and the read */
      }
    }
  };
  walk(root, "");
  return out;
}

/* -------------------------------------------------------------------- */
/* The carve-out is a CLASS, not one path                                */
/* -------------------------------------------------------------------- */

test("the .git carve-out is segment-wise and does not cover gitignore or a github directory", () => {
  const root = "/fleet/projects/app";
  const roots: ProjectRootsShape = { kind: "observed", roots: [root] };
  const at = "2026-09-17T12:00:00Z";
  const decide = (target: string): DecisionShape =>
    block.decideWrite({ tool: "Write", targetPath: target }, roots, undefined, at);

  /* PERMITTED: this clone's own git internals. */
  for (const carved of [
    `${root}/.git/refs/heads/main`,
    `${root}/.git/MERGE_HEAD`,
    `${root}/.git/HEAD`,
  ]) {
    assert.equal(decide(carved).verdict, "permit", carved);
  }

  /* REFUSED: ordinary working-tree files whose names merely start with, or
     contain, `.git`. A substring test hands every one of these the release
     manager's carve-out, which is the shape this assertion exists to refuse. */
  for (const working of [
    `${root}/.gitignore`,
    `${root}/.gitattributes`,
    `${root}/.github/workflows/gates.yml`,
    `${root}/src/.github/workflows/gates.yml`,
    `${root}/src/my.git/file.ts`,
    `${root}/docs/.git-notes.md`,
  ]) {
    const decision = decide(working);
    assert.equal(decision.verdict, "refuse", `${working} was permitted: ${decision.reason}`);
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 4: the bypass class, two structurally different members     */
/* -------------------------------------------------------------------- */

const PROJECT = "/fleet/projects/app";
const ROOTS: ProjectRootsShape = { kind: "observed", roots: [PROJECT] };
const NOW = "2026-09-17T12:00:00Z";

function declaration(overrides: Partial<BypassShape>): BypassShape {
  return {
    kind: "write-bypass",
    contractVersion: "1",
    project: PROJECT,
    paths: [`${PROJECT}/scripts`],
    reason: "the release pipeline is wedged and the fix is one line in scripts/",
    expiresAt: "2026-09-17T18:00:00Z",
    declaredBy: "orchestrator",
    declaredAt: "2026-09-17T11:00:00Z",
    ...overrides,
  };
}

test("an expired bypass does not permit a write its path list covers and names the declaration", () => {
  const covered = `${PROJECT}/scripts/release.sh`;

  /* THE CONTROL FIRST. A current declaration DOES permit this write, so the
     refusal below is attributable to the expiry and not to a path list that
     never covered anything. Without this the member is green for the wrong
     reason, which is the T-003 shape. */
  const current = block.decideWrite(
    { tool: "Write", targetPath: covered },
    ROOTS,
    declaration({}),
    NOW,
  );
  assert.equal(current.verdict, "permit", current.reason);

  const expired = declaration({ expiresAt: "2026-09-17T11:30:00Z" });
  const decision = block.decideWrite({ tool: "Write", targetPath: covered }, ROOTS, expired, NOW);
  assert.equal(decision.verdict, "refuse", decision.reason);
  /* It names the DECLARATION and the REASON IT DID NOT APPLY (criterion 4). */
  assert.equal(decision.reason.includes(expired.declaredAt), true, decision.reason);
  assert.equal(decision.reason.includes(expired.declaredBy), true, decision.reason);
  assert.equal(decision.reason.includes(expired.reason), true, decision.reason);
  assert.equal(
    decision.reason.includes(`its expiry ${expired.expiresAt} is not after ${NOW}`),
    true,
    decision.reason,
  );

  /* The boundary is CLOSED: an expiry equal to now has expired. */
  const exact = declaration({ expiresAt: NOW });
  assert.equal(
    block.decideWrite({ tool: "Write", targetPath: covered }, ROOTS, exact, NOW).verdict,
    "refuse",
  );
});

test("a current bypass does not permit a write outside its path list and names the declaration", () => {
  const outside = `${PROJECT}/src/app.ts`;
  const inside = `${PROJECT}/scripts/release.sh`;
  const current = declaration({});

  /* THE CONTROL: the same current declaration permits a write it does cover. */
  assert.equal(
    block.decideWrite({ tool: "Write", targetPath: inside }, ROOTS, current, NOW).verdict,
    "permit",
  );

  const decision = block.decideWrite({ tool: "Write", targetPath: outside }, ROOTS, current, NOW);
  assert.equal(decision.verdict, "refuse", decision.reason);
  assert.equal(decision.reason.includes(current.declaredAt), true, decision.reason);
  assert.equal(decision.reason.includes(current.reason), true, decision.reason);
  assert.equal(
    decision.reason.includes(`its path list (1 entry) does not cover ${outside}`),
    true,
    decision.reason,
  );

  /* A declaration for ANOTHER project is the third way one fails to apply,
     and it names the mismatch rather than reporting a bare refusal. */
  const elsewhere = declaration({
    project: "/fleet/projects/other",
    paths: ["/fleet/projects/other/scripts"],
  });
  const wrongProject = block.decideWrite(
    { tool: "Write", targetPath: inside },
    ROOTS,
    elsewhere,
    NOW,
  );
  assert.equal(wrongProject.verdict, "refuse", wrongProject.reason);
  assert.equal(
    wrongProject.reason.includes("it names the project /fleet/projects/other"),
    true,
    wrongProject.reason,
  );

  /* A path list that reaches outside the declared project buys nothing: `/`
     covers every path lexically and is not an explicit path list. */
  const everything = declaration({ paths: ["/"] });
  assert.equal(
    block.decideWrite({ tool: "Write", targetPath: outside }, ROOTS, everything, NOW).verdict,
    "refuse",
  );
});

/* -------------------------------------------------------------------- */
/* Criterion 5: C-1, made falsifiable                                    */
/* -------------------------------------------------------------------- */

test("deleting the entire evidence log changes no decision over the bypass fixture set", () => {
  const fleet = makeFleet();
  try {
    const project = makePlainProject(fleet, "app");
    mkdirSync(join(project, "scripts"), { recursive: true });
    const canonicalProject = block.canonicalisePath(project);
    const evidencePath = join(fleet, block.BYPASS_EVIDENCE_BASENAME);
    const declarationPath = join(fleet, block.BYPASS_BASENAME);

    /* THE FULL CRITERION-4 FIXTURE SET, each as a (declaration, payload)
       pair the wrapper really adjudicates against real files. */
    const fixtures: { label: string; declaration?: Record<string, unknown>; target: string }[] = [
      {
        label: "expired, path covered",
        declaration: {
          ...declaration({}),
          project: canonicalProject,
          paths: [join(canonicalProject, "scripts")],
          expiresAt: "2026-09-17T11:30:00Z",
        },
        target: join(project, "scripts", "release.sh"),
      },
      {
        label: "current, path not covered",
        declaration: {
          ...declaration({}),
          project: canonicalProject,
          paths: [join(canonicalProject, "scripts")],
        },
        target: join(project, "src", "app.ts"),
      },
      {
        label: "current, path covered",
        declaration: {
          ...declaration({}),
          project: canonicalProject,
          paths: [join(canonicalProject, "scripts")],
        },
        target: join(project, "scripts", "release.sh"),
      },
      {
        label: "no declaration at all",
        target: join(project, "src", "app.ts"),
      },
    ];

    const run = (): string[] =>
      fixtures.map((fixture) => {
        if (fixture.declaration === undefined) {
          try {
            unlinkSync(declarationPath);
          } catch {
            /* already absent */
          }
        } else {
          writeFileSync(declarationPath, `${JSON.stringify(fixture.declaration, undefined, 2)}\n`);
        }
        const outcome = block.runHook(payloadFor("Write", project, fixture.target), NOW);
        return `${fixture.label} -> ${String(outcome.exitCode)} ${outcome.stderr.trim()}`;
      });

    /* A LOG WITH A TAIL THAT WOULD CHANGE EVERY ANSWER IF ANYTHING READ IT.
       An empty log proves nothing: a reader of the tail would find nothing to
       read and would agree with the declaration by accident. */
    writeFileSync(
      evidencePath,
      `${JSON.stringify({
        appendedAt: "2026-09-17T09:00:00Z",
        tool: "Write",
        targetPath: join(project, "src", "app.ts"),
        reason: "a line that permits everything, if anyone read it",
        bypass: {
          project: canonicalProject,
          expiresAt: "2099-01-01T00:00:00Z",
          declaredAt: "2026-09-17T08:00:00Z",
          declaredBy: "not-the-orchestrator",
          reason: "a tail nothing may consult",
        },
      })}\n`,
    );
    const withLog = run();

    /* DELETE THE ENTIRE LOG. Not truncate: delete. */
    unlinkSync(evidencePath);
    let stillThere = true;
    try {
      statSync(evidencePath);
    } catch {
      stillThere = false;
    }
    assert.equal(stillThere, false, "the evidence log was not actually deleted");
    const withoutLog = run();

    assert.deepEqual(
      withoutLog,
      withLog,
      "a decision changed when the append-only evidence log was deleted, which means something read it (C-1)",
    );

    /* And the permitting fixture really does APPEND, so the log is evidence
       rather than an unused file: a split that recorded nothing would satisfy
       the assertion above for the wrong reason. */
    const appended = readFileSync(evidencePath, "utf8").trim().split("\n");
    assert.equal(appended.length > 0, true, "the permitted bypass write recorded nothing");
    const last = JSON.parse(appended[appended.length - 1] as string) as {
      targetPath: string;
      bypass: { declaredBy: string };
    };
    assert.equal(last.targetPath, block.canonicalisePath(join(project, "scripts", "release.sh")));
    assert.equal(last.bypass.declaredBy, "orchestrator");
  } finally {
    rmSync(fleet, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 7: fail closed on an unresolvable project root              */
/* -------------------------------------------------------------------- */

test("a request whose project root cannot be resolved is refused and the wrapper exits two", () => {
  /* MEMBER 1: the root set was never established. */
  const unresolved = block.decideWrite(
    { tool: "Write", targetPath: "/anywhere/at/all.ts" },
    { kind: "unresolved", reason: "/fleet/projects could not be listed" },
    undefined,
    NOW,
  );
  assert.equal(unresolved.verdict, "refuse", unresolved.reason);
  assert.equal(unresolved.reason.includes("could not be resolved"), true, unresolved.reason);
  assert.equal(unresolved.reason.includes("could not be listed"), true, unresolved.reason);

  /* MEMBER 2: the payload carries no absolute write target. */
  for (const target of [undefined, "", "src/app.ts"]) {
    const request: WriteRequestShape =
      target === undefined ? { tool: "Write" } : { tool: "Write", targetPath: target };
    const decision = block.decideWrite(request, ROOTS, undefined, NOW);
    assert.equal(decision.verdict, "refuse", `${String(target)}: ${decision.reason}`);
    assert.equal(
      decision.reason.includes("no absolute write target"),
      true,
      decision.reason,
    );
  }

  /* MEMBER 3, END TO END: a cwd under no fleet home at all. The wrapper must
     EXIT 2 naming the resolution failure, because an exit 0 here is the same
     fail-open as an absent hook and looks identical in every log. */
  const outside = mkdtempSync(join(tmpdir(), "m4p9-nofleet-"));
  try {
    const wrapper = runWrapper(payloadFor("Write", outside, join(outside, "app.ts")));
    assert.equal(wrapper.exitCode, block.EXIT_REFUSE, wrapper.stderr);
    assert.equal(wrapper.stderr.includes("no fleet home was found"), true, wrapper.stderr);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }

  /* AND A MALFORMED PAYLOAD, which is the arm a parser is most likely to let
     through quietly. */
  for (const bad of ["", "not json", "[]", '{"cwd":"/tmp"}']) {
    const wrapper = runWrapper(bad);
    assert.equal(wrapper.exitCode, block.EXIT_REFUSE, `${bad}: ${wrapper.stderr}`);
    assert.equal(wrapper.stderr.startsWith("tiphys project-write block:"), true, wrapper.stderr);
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 6: the captured agent turns                                 */
/* -------------------------------------------------------------------- */

test("the captured agent turn changed nothing in the project clone and its payload is refused", () => {
  const capture = readFileSync(endToEndCapture, "utf8");

  /* The blocked arms: the clone is clean and every tracked file's bytes are
     unchanged. Read out of the capture, not restated. */
  const arms = capture.split("======================================================================");
  const blocked = arms.filter((arm) => /^\s*arm: (write|edit)-blocked\b/m.test(arm));
  assert.equal(blocked.length, 2, `expected two blocked arms, found ${String(blocked.length)}`);
  for (const arm of blocked) {
    assert.equal(/git status --porcelain AFTER is empty: YES/.test(arm), true, arm);
    assert.equal(/tracked file shas unchanged: YES/.test(arm), true, arm);
    assert.equal(/^BLOCKED$/m.test(arm), true, arm);
  }

  /* THE CONTROL ARM IS WHAT MAKES THE TWO ABOVE MEAN ANYTHING: the same
     prompt with no hook at all changed the file. */
  const control = arms.find((arm) => /^\s*arm: write-control-no-hook\b/m.test(arm));
  assert.notEqual(control, undefined, "the capture carries no hook-absent control arm");
  assert.equal(
    /git status --porcelain AFTER is empty: NO/.test(control as string),
    true,
    control as string,
  );
  assert.equal(/tracked file shas unchanged: NO/.test(control as string), true, control as string);
  assert.equal(/^WROTE$/m.test(control as string), true, control as string);

  /* And the captured wrapper invocations: the working-tree write exits 2 and
     the ref update exits 0, in the same capture, against the same clone. */
  const exits = [...capture.matchAll(/--- wrapper exit: (\d) ---/g)].map((m) => m[1]);
  assert.deepEqual(exits, ["2", "0"], capture);

  /* Replay the captured payloads through the shipped decision, so the capture
     cannot drift away from the code it is evidence for. */
  const payloads = capturedPayloads(endToEndCapture);
  assert.equal(payloads.length, 2, `expected two captured payloads, found ${String(payloads.length)}`);
  const verdicts = payloads.map((raw) => {
    const read = block.requestFromPayload(raw);
    assert.equal(read.ok, true, JSON.stringify(read));
    const target = (read as { targetPath?: string }).targetPath as string;
    const projectRoot = target.slice(0, target.indexOf("/projects/app") + "/projects/app".length);
    return block.decideWrite(
      { tool: "Write", targetPath: target },
      { kind: "observed", roots: [projectRoot] },
      undefined,
      NOW,
    ).verdict;
  });
  assert.deepEqual(verdicts, ["refuse", "permit"]);
});

/* -------------------------------------------------------------------- */
/* Step 1: the probe record, made executable                             */
/* -------------------------------------------------------------------- */

test("the captured Bash payload carries no write target and the Write and Edit payloads do", () => {
  const payloads = capturedPayloads(payloadCapture).map(
    (raw) => [raw, JSON.parse(raw) as { tool_name: string }] as const,
  );
  assert.equal(payloads.length >= 4, true, `only ${String(payloads.length)} payloads captured`);

  const byTool = new Map<string, string[]>();
  for (const [raw, parsed] of payloads) {
    const list = byTool.get(parsed.tool_name) ?? [];
    list.push(raw);
    byTool.set(parsed.tool_name, list);
  }
  for (const tool of ["Write", "Edit", "Bash"]) {
    assert.equal(byTool.has(tool), true, `no captured ${tool} payload`);
  }

  /* Write and Edit: a resolvable, ABSOLUTE target. */
  for (const tool of ["Write", "Edit"]) {
    for (const raw of byTool.get(tool) as string[]) {
      const read = block.requestFromPayload(raw);
      assert.equal(read.ok, true, raw);
      const target = (read as { targetPath?: string }).targetPath;
      assert.notEqual(target, undefined, `${tool} yielded no target: ${raw}`);
      assert.equal((target as string).startsWith("/"), true, target as string);
    }
  }

  /* Bash: NO target, in every captured arm including the heredoc one. This is
     the measurement that scopes criterion 6, and it is asserted rather than
     described so that a later harness change reddens instead of being read
     past. */
  const bashPayloads = byTool.get("Bash") as string[];
  assert.equal(bashPayloads.length >= 2, true, "only one Bash arm was captured");
  for (const raw of bashPayloads) {
    const read = block.requestFromPayload(raw);
    assert.equal(read.ok, true, raw);
    assert.equal(
      (read as { targetPath?: string }).targetPath,
      undefined,
      `a Bash payload yielded a write target: ${raw}`,
    );
    assert.equal((JSON.parse(raw) as { tool_input: Record<string, unknown> }).tool_input["command"] !== undefined, true, raw);
  }
});

/* -------------------------------------------------------------------- */
/* The manifest registers what the module adjudicates                    */
/* -------------------------------------------------------------------- */

test("the plugin manifest registers the project-write block for exactly the adjudicated tools", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    hooks: { PreToolUse: { matcher?: string; hooks: { command: string }[] }[] };
  };
  const entry = manifest.hooks.PreToolUse.find((row) =>
    row.hooks.some((hook) => hook.command.includes("project-write-block")),
  );
  assert.notEqual(entry, undefined, "the manifest does not register the project-write block");
  const matcher = (entry as { matcher?: string }).matcher;
  assert.notEqual(matcher, undefined, "the block is registered with no matcher, so it sees every tool");
  assert.deepEqual(
    (matcher as string).split("|"),
    [...block.ADJUDICATED_TOOLS],
    `the manifest matcher ${String(matcher)} and ADJUDICATED_TOOLS have drifted apart`,
  );
  /* Bash is NOT registered, and that is the measured residual rather than an
     oversight (witness/captures/m4-p9-pretooluse-payloads.txt:1). */
  assert.equal((matcher as string).split("|").includes("Bash"), false, matcher as string);
});

/* -------------------------------------------------------------------- */
/* The schema and its `--type` row                                       */
/* -------------------------------------------------------------------- */

test("the write-bypass type validates a declaration and refuses one with no expiry", () => {
  const scratch = mkdtempSync(join(tmpdir(), "m4p9-schema-"));
  try {
    const good = join(scratch, "good.json");
    writeFileSync(
      good,
      `${JSON.stringify(
        {
          kind: "write-bypass",
          contractVersion: "1",
          project: "/fleet/projects/app",
          paths: ["/fleet/projects/app/scripts"],
          reason: "the release pipeline is wedged",
          expiresAt: "2026-09-17T18:00:00Z",
          declaredBy: "orchestrator",
          declaredAt: "2026-09-17T11:00:00Z",
        },
        undefined,
        2,
      )}\n`,
    );
    const ok = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "write-bypass", good],
      { encoding: "utf8" },
    );
    assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);

    /* `--type auto` resolves it from its own `kind`, which is what makes the
       one TYPE_TABLE row serve both registrations (M3R-001). */
    const auto = spawnSync(process.execPath, [cliEntry, "validate", "--type", "auto", good], {
      encoding: "utf8",
    });
    assert.equal(auto.status, 0, `${auto.stdout}${auto.stderr}`);

    /* A BYPASS WITH NO EXPIRY IS THE HAZARD THE PLAN NAMES FIRST, and the
       schema is where it stops being representable. */
    const noExpiry = join(scratch, "no-expiry.json");
    const body = JSON.parse(readFileSync(good, "utf8")) as Record<string, unknown>;
    delete body["expiresAt"];
    writeFileSync(noExpiry, `${JSON.stringify(body, undefined, 2)}\n`);
    const bad = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "write-bypass", noExpiry],
      { encoding: "utf8" },
    );
    assert.equal(bad.status, 1, `${bad.stdout}${bad.stderr}`);
    assert.equal(
      `${bad.stdout}${bad.stderr}`.includes("expiresAt"),
      true,
      `${bad.stdout}${bad.stderr}`,
    );

    /* A RELATIVE path list is refused too: a bypass whose paths depend on the
       reader's working directory covers a different set for every reader. */
    const relative = join(scratch, "relative.json");
    writeFileSync(
      relative,
      `${JSON.stringify({ ...JSON.parse(readFileSync(good, "utf8")) as Record<string, unknown>, paths: ["scripts"] }, undefined, 2)}\n`,
    );
    const rel = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "write-bypass", relative],
      { encoding: "utf8" },
    );
    assert.equal(rel.status, 1, `${rel.stdout}${rel.stderr}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
