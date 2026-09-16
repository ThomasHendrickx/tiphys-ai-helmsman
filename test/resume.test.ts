import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M4-P16: `tiphys resume` rebuilds the ephemeral half of a cloned fleet home.
 *
 * WHAT THESE TESTS ARE FOR, and the distinction is the whole phase. The
 * uninteresting failure is "resume does not exist". The DANGEROUS failures are
 * a resume that reports success while the fleet is not recoverable, and a
 * resume that destroys what a reclaim left behind. Every fixture below is
 * built so that a green result means one of those did not happen, rather than
 * meaning the three directories are present.
 *
 * PRECONDITIONS ARE ASSERTED, NOT ASSUMED. A probe earlier in this repository
 * recorded a witness that passed against directories THAT DID NOT EXIST,
 * because the harness created them on the way to checking. So each fixture
 * builder ends by asserting the state it claims to have built, the assertions
 * live in named helpers rather than inline, and one test below drives those
 * helpers against a fixture that VIOLATES them and requires them to throw. A
 * precondition check that has never been seen to fail is the T-008 shape: a
 * guard that cannot go red.
 */

/* Type stripping runs the same source the CLI does, so the layout constants
   are read from src rather than restated here. A second list is a second
   thing to keep in step, and CLAUDE.md warning 4 makes the computed-URL
   dynamic import the only form that survives the project reference. */
const { EPHEMERAL_DIRS, DURABLE_DIRS, FLEET_DIRS, FLEET_FILES, FLEET_IGNORED } =
  (await import(new URL("../src/fleet.ts", import.meta.url).href)) as {
    EPHEMERAL_DIRS: readonly string[];
    DURABLE_DIRS: readonly string[];
    FLEET_DIRS: readonly string[];
    FLEET_FILES: readonly string[];
    FLEET_IGNORED: readonly string[];
  };

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    ...opts,
  });
}

/**
 * A git identity supplied per command, never read from user or global config
 * (CLAUDE.md warning 5: CI runners have no git identity, and touching global
 * config would be a side effect on the machine running the suite).
 */
const GIT_IDENTITY: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Tiphys Test",
  GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Tiphys Test",
  GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
};

function gitIn(dir: string, args: string[]) {
  return spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: GIT_IDENTITY,
  });
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-m4p16-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** Count of `REBUILT <name>/` lines, which is what criteria 1, 3 and 5 pin. */
function rebuiltLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("REBUILT "))
    .map((line) => line.trim());
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * A digest of the ENTRY SET under dir, which is what criterion 2's "creates
 * nothing" is a claim about. Sorted and relative so it is stable, and it walks
 * into subdirectories so a file created two levels down still moves it.
 */
function treeDigest(dir: string): string {
  const paths: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      paths.push(relative(dir, full).split(sep).join("/"));
      if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(dir);
  paths.sort();
  return createHash("sha256").update(paths.join("\n")).digest("hex");
}

/* ------------------------------------------------------------------ *
 * Fixture preconditions. Named, reused, and driven to failure below.
 * ------------------------------------------------------------------ */

/** Every ephemeral directory is ABSENT. The state a fresh clone is in. */
function assertNoEphemeralPresent(dir: string): void {
  for (const name of EPHEMERAL_DIRS) {
    assert.equal(
      existsSync(join(dir, name)),
      false,
      `precondition violated: ${name}/ is present in ${dir}, so a green resume here would prove nothing`,
    );
  }
}

/** Every durable entry is PRESENT. The state a fresh clone is also in. */
function assertDurablePresent(dir: string): void {
  for (const name of DURABLE_DIRS) {
    assert.ok(
      existsSync(join(dir, name)) && statSync(join(dir, name)).isDirectory(),
      `precondition violated: durable ${name}/ is missing from ${dir}`,
    );
  }
  for (const name of FLEET_FILES) {
    assert.ok(
      existsSync(join(dir, name)) && statSync(join(dir, name)).isFile(),
      `precondition violated: durable ${name} is missing from ${dir}`,
    );
  }
  assert.ok(
    existsSync(join(dir, ".git")),
    `precondition violated: ${dir} has no .git, so it is not a clone`,
  );
}

/** Every layout entry is present. The state a LIVE fleet home is in. */
function assertLayoutComplete(dir: string): void {
  assertDurablePresent(dir);
  for (const name of EPHEMERAL_DIRS) {
    assert.ok(
      existsSync(join(dir, name)) && statSync(join(dir, name)).isDirectory(),
      `precondition violated: ephemeral ${name}/ is missing from ${dir}`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Fixture builders.
 * ------------------------------------------------------------------ */

/** A real fleet home, created by the real `tiphys init`, with a remote-able repo. */
function makeOriginFleet(t: { after(fn: () => void): void }): {
  root: string;
  origin: string;
} {
  const root = makeTempDir(t);
  const origin = join(root, "origin-fleet");
  const init = runCli(["init", origin]);
  assert.equal(init.status, 0, `init failed: ${init.stderr}`);
  assertLayoutComplete(origin);
  return { root, origin };
}

/**
 * A CLONE of a fleet home: the measured post-reclamation state. The three
 * gitignored directories do not come across, because gitignored content is
 * not repository content (src/fleet.ts FLEET_IGNORED), and that absence is
 * asserted rather than assumed.
 */
function makeFleetClone(t: { after(fn: () => void): void }): string {
  const { root, origin } = makeOriginFleet(t);
  const clone = join(root, "clone");
  const result = gitIn(root, ["clone", "--quiet", origin, clone]);
  assert.equal(result.status, 0, `clone failed: ${result.stderr}`);
  assertDurablePresent(clone);
  assertNoEphemeralPresent(clone);
  return clone;
}

/**
 * A LIVE fleet home carrying exactly what a session reclamation leaves behind
 * that this command must not touch: an uncommitted worktree file and an
 * unexpired lease. Both are gitignored content, so nothing in git protects
 * them and only resume's own restraint does.
 */
function makeLiveFleet(t: { after(fn: () => void): void }): {
  fleet: string;
  scratchPath: string;
  lockPath: string;
} {
  const { origin } = makeOriginFleet(t);
  const scratchPath = join(origin, "worktrees", "m4-p16-live", "scratch.txt");
  mkdirSync(join(origin, "worktrees", "m4-p16-live"), { recursive: true });
  writeFileSync(scratchPath, "uncommitted work a reclaim did not take\n");
  const lockPath = join(origin, "state", "orchestrator.lock");
  writeFileSync(
    lockPath,
    `${JSON.stringify(
      {
        holder: "m4-p16-live-holder",
        acquiredAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  assertLayoutComplete(origin);
  return { fleet: origin, scratchPath, lockPath };
}

/* ------------------------------------------------------------------ *
 * The tests.
 * ------------------------------------------------------------------ */

test("the layout constants partition the fleet directories into ephemeral and durable", () => {
  /* DERIVED, NOT LISTED. Both sets come out of src/fleet.ts, so a future phase
     that adds a fleet directory reddens here and has to say which half it is
     in, rather than silently landing in neither and being rebuilt by nobody. */
  const union = [...EPHEMERAL_DIRS, ...DURABLE_DIRS].sort();
  assert.deepEqual(union, [...FLEET_DIRS].sort());
  for (const name of EPHEMERAL_DIRS) {
    assert.equal(
      DURABLE_DIRS.includes(name),
      false,
      `${name} is in both halves of the partition`,
    );
  }
  /* The ephemeral half is exactly the gitignored set with its trailing slash
     removed. That equality is the reason resume rebuilds these three and no
     others: a divergence would mean rebuilding something git tracks, or
     leaving something git ignores permanently missing. */
  assert.deepEqual(
    [...EPHEMERAL_DIRS].sort(),
    [...FLEET_IGNORED].map((entry) => entry.replace(/\/$/, "")).sort(),
  );
});

test("the fixture preconditions go red on fixtures that violate them", (t) => {
  /* THE HARNESS'S OWN RED WITNESS. Every other test in this file trusts these
     three helpers, and a check that has never been seen to fail is
     indistinguishable from one that cannot fail. Each helper is driven against
     a fixture that breaks exactly its property. */
  const clone = makeFleetClone(t);

  /* (1) assertNoEphemeralPresent must notice a directory that IS there. This
         is the exact defect the earlier probe shipped: the harness created the
         directories and then reported the check green. */
  mkdirSync(join(clone, EPHEMERAL_DIRS[0] as string));
  assert.throws(
    () => {
      assertNoEphemeralPresent(clone);
    },
    /precondition violated/,
    "assertNoEphemeralPresent stayed green on a clone that already had an ephemeral directory",
  );
  rmSync(join(clone, EPHEMERAL_DIRS[0] as string), { recursive: true });
  assertNoEphemeralPresent(clone);

  /* (2) assertDurablePresent must notice durable content that is gone. */
  const durable = join(clone, DURABLE_DIRS[0] as string);
  rmSync(durable, { recursive: true });
  assert.throws(
    () => {
      assertDurablePresent(clone);
    },
    /precondition violated/,
    "assertDurablePresent stayed green on a clone missing a durable directory",
  );
  mkdirSync(durable);
  assertDurablePresent(clone);

  /* (3) assertLayoutComplete must notice an INCOMPLETE layout, which is the
         state a clone is in and is not the same defect as (1) or (2). */
  assert.throws(
    () => {
      assertLayoutComplete(clone);
    },
    /precondition violated/,
    "assertLayoutComplete stayed green on a clone with no ephemeral directories",
  );
});

test("resume rebuilds the three ephemeral directories in a fleet clone and doctor then reports CHECK layout PASS", (t) => {
  const clone = makeFleetClone(t);

  const result = runCli(["resume"], { cwd: clone });
  assert.equal(result.status, 0, `resume failed: ${result.stderr}`);

  /* EXACTLY THREE LINES, and they name the ephemeral set in its declared
     order. The count is derived from the constant rather than typed as 3, so
     the assertion follows the layout rather than pinning today's size. */
  assert.deepEqual(
    rebuiltLines(result.stdout),
    EPHEMERAL_DIRS.map((name) => `REBUILT ${name}/`),
  );
  assert.equal(
    result.stdout.trim().split("\n").length,
    EPHEMERAL_DIRS.length,
    `resume printed more than the REBUILT lines: ${result.stdout}`,
  );

  assertLayoutComplete(clone);

  /* The layout check is the kernel's own reader of this property, so the
     rehydrated clone is handed back to it rather than to a second opinion
     written here. */
  const doctor = runCli(["doctor"], { cwd: clone });
  assert.match(doctor.stdout, /^CHECK layout PASS/m, doctor.stdout);
});

test("resume in a directory that is not a git repository exits 1, names .git and creates nothing", (t) => {
  const dir = join(makeTempDir(t), "not-a-repo");
  mkdirSync(dir);
  writeFileSync(join(dir, "unrelated.txt"), "content\n");
  assert.equal(existsSync(join(dir, ".git")), false, "precondition violated: .git is present");

  const before = treeDigest(dir);
  const result = runCli(["resume"], { cwd: dir });
  const after = treeDigest(dir);

  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stderr.trim().split("\n").length, 1, result.stderr);
  /* `.git is absent`, NOT a bare `.git`. Measured 2026-09-16 in this phase's
     mutation lab: a bare /\.git/ matched the word `.gitignore` inside the
     DURABLE-content refusal, so a build with the git precondition deleted
     outright still satisfied this assertion and the whole test stayed green.
     That is the guard-that-cannot-go-red shape, found by mutating rather than
     by reading. The phrase asserted here occurs in one message only. */
  assert.match(result.stderr, /\.git is absent/);
  assert.equal(rebuiltLines(result.stdout).length, 0, result.stdout);
  assert.equal(before, after, "resume changed the tree of a directory it refused");
});

test("resume refuses a complete fleet layout whose .git is gone, and creates nothing", (t) => {
  /* THE SECOND MEMBER OF THE GIT-PRECONDITION CLASS, and it ISOLATES that
     precondition: every durable entry is present here, so the durable check
     has nothing to refuse and only the `.git` check can. The first member (a
     bare directory) fails BOTH checks, which is why it alone is not a witness
     for either. */
  const clone = makeFleetClone(t);
  rmSync(join(clone, ".git"), { recursive: true });

  assert.equal(existsSync(join(clone, ".git")), false, "precondition violated: .git survived");
  for (const name of DURABLE_DIRS) {
    assert.ok(
      existsSync(join(clone, name)),
      `precondition violated: durable ${name}/ is missing, so the durable check could refuse instead`,
    );
  }
  for (const name of FLEET_FILES) {
    assert.ok(
      existsSync(join(clone, name)),
      `precondition violated: durable ${name} is missing, so the durable check could refuse instead`,
    );
  }

  const before = treeDigest(clone);
  const result = runCli(["resume"], { cwd: clone });
  const after = treeDigest(clone);

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /\.git is absent/);
  assert.equal(rebuiltLines(result.stdout).length, 0, result.stdout);
  assert.equal(before, after, "resume rehydrated a directory that is not a git repository");
  assertNoEphemeralPresent(clone);
});

test("resume in a git repository that is not a fleet home exits 1, names the missing durable entries and creates nothing", (t) => {
  /* THE SECOND MEMBER OF THE REFUSAL CLASS, and structurally different from
     the first: `.git` is PRESENT here, so the cheap check passes and only the
     durable-content check can refuse. A resume that stopped at `.git` would
     create three directories inside an unrelated repository and exit 0. */
  const dir = join(makeTempDir(t), "stranger-repo");
  mkdirSync(dir);
  assert.equal(gitIn(dir, ["init", "--quiet", "--initial-branch=main"]).status, 0);
  writeFileSync(join(dir, "README.md"), "someone else's repository\n");
  assert.ok(existsSync(join(dir, ".git")), "precondition violated: no .git");
  assert.equal(
    existsSync(join(dir, "backlog.md")),
    false,
    "precondition violated: the stranger repo looks like a fleet home",
  );

  const before = treeDigest(dir);
  const result = runCli(["resume"], { cwd: dir });
  const after = treeDigest(dir);

  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stderr.trim().split("\n").length, 1, result.stderr);
  assert.match(result.stderr, /not a fleet home/);
  assert.match(result.stderr, /backlog\.md/);
  assert.equal(rebuiltLines(result.stdout).length, 0, result.stdout);
  assert.equal(before, after, "resume changed the tree of a repository it refused");
});

test("resume refuses every directory that is not a rehydratable fleet clone, and creates nothing in any of them", (t) => {
  /* THE CLASS TEST. The three tests above each pin ONE member of the refusal
     class, and a witness that reddens under one member and not the others is
     the mistake CLAUDE.md records as "one witness is not a class". This test
     walks all three shapes in one assertion set, so a build that drops EITHER
     precondition reddens it:

       shape 1  no `.git` and no durable content   (both checks would refuse)
       shape 2  durable content, `.git` removed    (only the git check refuses)
       shape 3  `.git` present, no durable content (only the durable check refuses)

     Shapes 2 and 3 are the isolating pair; shape 1 is the ordinary case a user
     actually hits by running resume in the wrong place. */
  const root = makeTempDir(t);

  const bare = join(root, "bare");
  mkdirSync(bare);
  writeFileSync(join(bare, "unrelated.txt"), "content\n");

  const decapitated = makeFleetClone(t);
  rmSync(join(decapitated, ".git"), { recursive: true });

  const stranger = join(root, "stranger");
  mkdirSync(stranger);
  assert.equal(gitIn(stranger, ["init", "--quiet", "--initial-branch=main"]).status, 0);
  writeFileSync(join(stranger, "README.md"), "someone else's repository\n");

  const shapes: Array<{ label: string; dir: string; hasGit: boolean; hasDurable: boolean }> = [
    { label: "no .git and no durable content", dir: bare, hasGit: false, hasDurable: false },
    { label: "durable content with .git removed", dir: decapitated, hasGit: false, hasDurable: true },
    { label: ".git present with no durable content", dir: stranger, hasGit: true, hasDurable: false },
  ];

  for (const shape of shapes) {
    /* PRECONDITIONS PER SHAPE, so a fixture that silently stopped being the
       shape it claims is caught here rather than passing as a refusal. */
    assert.equal(
      existsSync(join(shape.dir, ".git")),
      shape.hasGit,
      `precondition violated for "${shape.label}": .git presence is not as declared`,
    );
    assert.equal(
      existsSync(join(shape.dir, "backlog.md")),
      shape.hasDurable,
      `precondition violated for "${shape.label}": durable presence is not as declared`,
    );

    const before = treeDigest(shape.dir);
    const result = runCli(["resume"], { cwd: shape.dir });
    const after = treeDigest(shape.dir);

    assert.equal(result.status, 1, `"${shape.label}" was not refused: ${result.stdout}`);
    assert.equal(
      rebuiltLines(result.stdout).length,
      0,
      `"${shape.label}" printed a REBUILT line: ${result.stdout}`,
    );
    assert.equal(before, after, `"${shape.label}" was modified by a refused resume`);
    assertNoEphemeralPresent(shape.dir);
  }
});

test("resume on a complete fleet home prints no REBUILT line, and a second consecutive run prints none either", (t) => {
  const { fleet } = makeLiveFleet(t);
  assertLayoutComplete(fleet);

  const first = runCli(["resume"], { cwd: fleet });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(rebuiltLines(first.stdout).length, 0, first.stdout);
  assert.equal(first.stdout, "", `resume printed on a complete fleet: ${first.stdout}`);

  const second = runCli(["resume"], { cwd: fleet });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(rebuiltLines(second.stdout).length, 0, second.stdout);
});

test("resume leaves a live worktree file and an unexpired lease byte-identical", (t) => {
  /* RED WITNESS, DANGEROUS STATE, MEMBER A (criterion 4). The fleet is LIVE:
     uncommitted worktree content and a lease that has not expired. A resume
     written as destroy-and-recreate passes every criterion above this one and
     fails here, which is the point. */
  const { fleet, scratchPath, lockPath } = makeLiveFleet(t);
  const scratchBefore = sha256File(scratchPath);
  const lockBefore = sha256File(lockPath);

  const result = runCli(["resume"], { cwd: fleet });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(rebuiltLines(result.stdout).length, 0, result.stdout);
  assert.ok(existsSync(scratchPath), "resume removed a live worktree file");
  assert.ok(existsSync(lockPath), "resume removed an unexpired lease");
  assert.equal(sha256File(scratchPath), scratchBefore, "the worktree file changed");
  assert.equal(sha256File(lockPath), lockBefore, "the lease changed");
});

test("resume rebuilds only the absent ephemeral directory and leaves the present ones untouched", (t) => {
  /* RED WITNESS, DANGEROUS STATE, MEMBER B (criterion 5), structurally
     different from member A: the layout is HALF rebuilt, which is what an
     interrupted resume leaves. A resume that treats the layout as
     all-or-nothing passes member A and fails here. */
  const { fleet, scratchPath, lockPath } = makeLiveFleet(t);
  const scratchBefore = sha256File(scratchPath);
  rmSync(join(fleet, "state"), { recursive: true });

  assert.equal(
    existsSync(join(fleet, "state")),
    false,
    "precondition violated: state/ still exists",
  );
  assert.ok(
    existsSync(join(fleet, "worktrees")),
    "precondition violated: worktrees/ is gone too, so this is not the half-rebuilt state",
  );
  assert.ok(existsSync(join(fleet, "projects")), "precondition violated: projects/ is gone too");
  assert.equal(existsSync(lockPath), false, "precondition violated: the lease survived rm of state/");

  const result = runCli(["resume"], { cwd: fleet });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(rebuiltLines(result.stdout), ["REBUILT state/"], result.stdout);
  assert.ok(existsSync(join(fleet, "state")), "state/ was not rebuilt");
  assert.equal(
    readdirSync(join(fleet, "state")).length,
    0,
    "resume invented content inside the rebuilt state/",
  );
  assert.ok(existsSync(scratchPath), "resume removed a live worktree file while rebuilding state/");
  assert.equal(sha256File(scratchPath), scratchBefore, "the worktree file changed");
});

test("resume refuses an ephemeral path that exists and is not a directory, and creates nothing", (t) => {
  const clone = makeFleetClone(t);
  const blocked = EPHEMERAL_DIRS[1] as string;
  writeFileSync(join(clone, blocked), "not a directory\n");

  const before = treeDigest(clone);
  const result = runCli(["resume"], { cwd: clone });
  const after = treeDigest(clone);

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /not a directory/);
  /* The refusal is decided BEFORE anything is created, so the ephemeral entry
     that comes first in the order is not left behind by a half-run. */
  assert.equal(rebuiltLines(result.stdout).length, 0, result.stdout);
  assert.equal(before, after, "resume created part of the layout before refusing");
});

test("resume with more than one operand exits 64", (t) => {
  const clone = makeFleetClone(t);
  const result = runCli(["resume", clone, "extra"], { cwd: clone });
  assert.equal(result.status, 64, result.stderr);
  assert.match(result.stderr, /usage: tiphys resume/);
  assertNoEphemeralPresent(clone);
});

test("resume accepts an explicit directory operand and rehydrates that one", (t) => {
  const clone = makeFleetClone(t);
  const elsewhere = makeTempDir(t);
  const result = runCli(["resume", clone], { cwd: elsewhere });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    rebuiltLines(result.stdout),
    EPHEMERAL_DIRS.map((name) => `REBUILT ${name}/`),
  );
  assertLayoutComplete(clone);
  /* The directory the process was STANDING in is untouched, which is what
     makes the operand meaningful rather than decorative. */
  for (const name of EPHEMERAL_DIRS) {
    assert.equal(existsSync(join(elsewhere, name)), false, `${name}/ was created in the cwd`);
  }
});

test("resume is registered in the command table and is reachable by name", () => {
  const usage = runCli([]);
  assert.equal(usage.status, 64);
  assert.match(usage.stderr, /\bresume\b/);
});
