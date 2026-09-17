/**
 * THE STATUS-LINE TESTS (kernel plan M3, M3-P1 criteria 6, 7 and 8; R-084;
 * constraint C-1).
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

const statusModule = (await import(
  new URL("../src/status.ts", import.meta.url).href
)) as {
  STATUS_STATES: readonly string[];
  STATUS_DIR: string;
  DURABLE_STATUS_DIR: string;
  STREAM_FILE: string;
  CURRENT_FILE: string;
  readCurrent: (
    fleetRoot: string,
  ) => { ok: true; record: Record<string, unknown> } | { ok: false; reason: string };
  renderStatus: (record: Record<string, unknown>) => string;
};

/* THE LAYOUT IS READ FROM THE MODULE, NEVER RESTATED HERE (M4-P18, M4-D-13).
   These four paths are the split, and a test that spelled them out again
   would keep passing against a source that had moved one of them, which is
   the divergence the split is supposed to make visible. */
const { STATUS_DIR, DURABLE_STATUS_DIR, STREAM_FILE, CURRENT_FILE } = statusModule;

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runIn(cwd: string, args: string[]): Run {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/**
 * A real fleet home, created by the delivered `tiphys init`. The git identity
 * is command-scoped because CI runners have no git identity and this must
 * never touch user or global config (CLAUDE.md standing warning 5); `init`
 * already does that by design, so nothing extra is needed here beyond not
 * undoing it.
 */
function fleet(): { root: string; dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-status-"));
  const root = join(dir, "fleet");
  const created = spawnSync(process.execPath, [cliEntry, "init", root], {
    encoding: "utf8",
  });
  assert.equal(created.status, 0, created.stdout + created.stderr);
  return {
    root,
    dispose: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Criterion 6: emit appends one line and rewrites current              */
/* ------------------------------------------------------------------ */

test("status emit appends exactly one line to the stream and leaves current.json parsing with the emitted state", () => {
  const { root, dispose } = fleet();
  try {
    const first = runIn(root, [
      "status",
      "emit",
      "--run",
      "r1",
      "--state",
      "phase-change",
      "--detail",
      "x",
    ]);
    assert.equal(first.status, 0, first.stdout + first.stderr);

    const stream = readFileSync(join(root, STREAM_FILE), "utf8");
    assert.equal(
      stream.split("\n").filter((line) => line !== "").length,
      1,
      stream,
    );
    const current = JSON.parse(
      readFileSync(join(root, CURRENT_FILE), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(current["state"], "phase-change");
    assert.equal(current["run"], "r1");
    assert.equal(current["detail"], "x");

    /* A SECOND emit APPENDS rather than replaces, and moves the pointer. The
       first assertion alone would pass against an emitter that truncated the
       stream every time, which is the opposite of an append-only history. */
    const second = runIn(root, ["status", "emit", "--run", "r2", "--state", "done"]);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    const after = readFileSync(join(root, STREAM_FILE), "utf8");
    assert.equal(after.split("\n").filter((line) => line !== "").length, 2);
    assert.ok(after.includes('"run":"r1"'), "the first record was overwritten");
    const moved = JSON.parse(
      readFileSync(join(root, CURRENT_FILE), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(moved["state"], "done");
    assert.equal(moved["run"], "r2");

    /* The atomic rewrite leaves no temp file behind, and the two documents
       are now in two directories (M4-D-13): the stream alone under the
       ignored prefix, the pointer alone under the tracked one beside the
       keep file init wrote. */
    assert.deepEqual(readdirSync(join(root, STATUS_DIR)).sort(), ["stream.jsonl"]);
    assert.deepEqual(
      readdirSync(join(root, DURABLE_STATUS_DIR)).sort(),
      [".gitkeep", "current.json"],
    );
  } finally {
    dispose();
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 7: C-1, and the red witness against the DANGEROUS state     */
/* ------------------------------------------------------------------ */

test("status show survives an unparseable stream, and an implementation of show that reads the stream is red against the same fixture", () => {
  const { root, dispose } = fleet();
  try {
    assert.equal(
      runIn(root, ["status", "emit", "--run", "r1", "--state", "blocked", "--detail", "waiting on DR-0021"]).status,
      0,
    );

    /* THE COMPARISON IS AGAINST THE HEALTHY OUTPUT, captured first. The
       criterion says the output is UNCHANGED, which is a statement about two
       runs; asserting only that the corrupted run still says "blocked" would
       be green against a reader that had silently dropped the detail or the
       refs (M4-P18 criterion 7). */
    const before = runIn(root, ["status", "show"]);
    assert.equal(before.status, 0, before.stdout + before.stderr);

    /* THE DANGEROUS STATE: the append-only history is garbage, and its last
       line is TRUNCATED MID-LINE, which is what a crash between the append
       and the rewrite leaves. C-1 exists because a tail read here would
       produce a wrong ANSWER rather than an error, and a wrong answer about
       whether the fleet is blocked is what reaches the owner. */
    writeFileSync(join(root, STREAM_FILE), "  not json at all\n{\"half\": ");

    const shown = runIn(root, ["status", "show"]);
    assert.equal(shown.status, 0, shown.stdout + shown.stderr);
    assert.equal(shown.stdout, before.stdout, "the corrupted stream changed what show reports");
    assert.match(shown.stdout, /blocked/);
    assert.match(shown.stdout, /run=r1/);

    /* THE RED WITNESS, and it is red against the DANGEROUS STATE rather than
       against an absent feature: this is `show` implemented the forbidden
       way, reading the tail of the log, run against the SAME corrupted
       fixture. It must fail. Written here rather than patched into the source
       because a source patch would have to be reverted by hand, and the
       revert is the step that gets forgotten. */
    const streamPath = join(root, STREAM_FILE);
    let tailReadThrew = false;
    try {
      const lines = readFileSync(streamPath, "utf8")
        .split("\n")
        .filter((line) => line !== "");
      const last = lines[lines.length - 1] as string;
      JSON.parse(last);
    } catch {
      tailReadThrew = true;
    }
    assert.equal(
      tailReadThrew,
      true,
      "the corrupted fixture did not break a tail read, so it does not stage the dangerous state",
    );

    /* And the DELIVERED reader, on the same tree, is still right. The pair is
       what makes this a witness: same fixture, forbidden implementation red,
       delivered implementation green. */
    const current = statusModule.readCurrent(root);
    assert.equal(current.ok, true);
    assert.equal(current.ok === true ? current.record["state"] : "", "blocked");

    /* The corrupted stream is restored to a well-formed one, and `show` is
       unchanged by that too: its answer never depended on the stream. */
    writeFileSync(streamPath, "");
    const afterRestore = runIn(root, ["status", "show"]);
    assert.equal(afterRestore.status, 0);
    assert.match(afterRestore.stdout, /blocked/);
  } finally {
    dispose();
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 8: the state vocabulary is closed and ENFORCED              */
/* ------------------------------------------------------------------ */

test("status emit with a state outside the five-value enum exits nonzero naming the enum, and writes nothing", () => {
  const { root, dispose } = fleet();
  try {
    for (const forbidden of ["progress", "info", "heartbeat"]) {
      const run = runIn(root, ["status", "emit", "--run", "r1", "--state", forbidden]);
      assert.notEqual(run.status, 0, forbidden);
      assert.match(run.stderr, /INVALID #\/state value/, forbidden);
      assert.match(run.stderr, /permitted values/, forbidden);
      /* R-084's sparseness is worth nothing if the refusal still writes. */
      assert.deepEqual(
        readdirSync(join(root, "state")).filter((name) => name === "status"),
        [],
        `${forbidden} created the status directory`,
      );
    }

    /* CONTROL: every one of the five permitted states IS accepted, so the
       refusal above is about the vocabulary and not about emitting at all. */
    for (const permitted of statusModule.STATUS_STATES) {
      const run = runIn(root, ["status", "emit", "--run", "r1", "--state", permitted]);
      assert.equal(run.status, 0, `${permitted}: ${run.stdout}${run.stderr}`);
    }
  } finally {
    dispose();
  }
});

test("the state list in src/status.ts and the enum in the shipped schema are the same set", () => {
  /* A DUPLICATED VOCABULARY THAT NOTHING COMPARES IS A VOCABULARY THAT
     DRIFTS. The CLI needs the list to compose a usage line; the schema is the
     contract. This is the comparison that stops the two from diverging
     silently, and it is the same shape as M3-P3's
     charter-mode-enum-matches-modes one milestone earlier. */
  const schema = JSON.parse(
    readFileSync(join(repoRoot, "schemas", "status-line.schema.json"), "utf8"),
  ) as { properties: { state: { enum: string[] } } };
  assert.deepEqual(
    [...schema.properties.state.enum].sort(),
    [...statusModule.STATUS_STATES].sort(),
  );
  /* And neither of them contains a routine-noise state, which is the whole
     structural claim R-084 makes. */
  for (const noise of ["info", "progress", "heartbeat", "running"]) {
    assert.ok(!schema.properties.state.enum.includes(noise), noise);
  }
});

/* ------------------------------------------------------------------ */
/* M4-P18 / M4-D-13: the split, asserted through git rather than prose  */
/* ------------------------------------------------------------------ */

/**
 * The recorded git contract these two tests consume. `tiphys init` spawns git
 * and this file reads what that produced, so the assertions below are anchored
 * to REAL captured output rather than to a belief about git (red-witness rule
 * (f), CLAUDE.md standing warning 10).
 */
const CONTRACT_CAPTURE = join(
  repoRoot,
  "witness",
  "captures",
  "m4-p18-git-contracts.txt",
);

/** git inside a fleet home, with no user or global identity consulted. */
function gitIn(root: string, args: string[]): Run {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

test("the durable status document is tracked and the stream stays ignored, which is the whole of M4-D-13", () => {
  const { root, dispose } = fleet();
  try {
    assert.equal(
      runIn(root, ["status", "emit", "--run", "r1", "--state", "phase-change"]).status,
      0,
    );

    /* THE QUESTION IS ASKED OF GIT, not of the path spelling. A test that
       asserted `CURRENT_FILE` does not start with "state/" would pass against
       a fleet whose `.gitignore` had grown a rule covering the new location,
       and the property that matters is whether the document can be committed
       and pushed at all (AGENTS.md clause fleet-state-commit-discipline). */
    /* The recorded contract for this probe, including the exit code that
       means NOT IGNORED, is section 2 and section 3 of the capture. */
    const capture = readFileSync(CONTRACT_CAPTURE, "utf8");
    assert.match(capture, /git check-ignore --no-index -v -z --stdin/);

    const currentIgnored = gitIn(root, ["check-ignore", "--no-index", "-q", "--", CURRENT_FILE]);
    assert.equal(currentIgnored.status, 1, `${CURRENT_FILE} is ignored by the fleet .gitignore`);
    const streamIgnored = gitIn(root, ["check-ignore", "--no-index", "-q", "--", STREAM_FILE]);
    assert.equal(streamIgnored.status, 0, `${STREAM_FILE} is not ignored by the fleet .gitignore`);

    /* And the durable half is REACHABLE by a commit, which is the fact the
       previous layout made false: `git add` on an ignored path without -f
       exits nonzero and stages nothing. */
    const added = gitIn(root, ["add", "--", CURRENT_FILE]);
    assert.equal(added.status, 0, added.stderr);
    const staged = gitIn(root, ["diff", "--cached", "--name-only"]);
    assert.equal(staged.stdout.trim(), CURRENT_FILE);
  } finally {
    dispose();
  }
});

test("init tracks the durable status directory in the bootstrap commit, so a clone of a fleet home carries it", () => {
  const { root, dispose } = fleet();
  try {
    /* A CLONE IS THE SUBJECT, not the origin. `tiphys resume` rebuilds the
       ephemeral three and never fabricates durable content, so a durable
       directory that only the origin has is a directory a reclaimed fleet
       does not get back. */
    const listed = gitIn(root, ["ls-files", "--", DURABLE_STATUS_DIR]);
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(listed.stdout.trim(), join(DURABLE_STATUS_DIR, ".gitkeep"));

    /* The same two facts, recorded from a real run against a fleet home this
       test did not build, so the expectation is not this file's own
       invention: witness/captures/m4-p18-git-contracts.txt section 6. */
    const capture = readFileSync(CONTRACT_CAPTURE, "utf8");
    assert.match(capture, /git -C fresh ls-files -- status/);
    assert.match(capture, /status\/\.gitkeep/);
    assert.match(capture, /status\/ PRESENT/);
    assert.match(capture, /state\/ ABSENT/);

    const clone = join(root, "..", "clone-of-fleet");
    const cloned = spawnSync("git", ["clone", "--quiet", root, clone], { encoding: "utf8" });
    assert.equal(cloned.status, 0, cloned.stderr);
    assert.equal(
      existsSync(join(clone, DURABLE_STATUS_DIR)),
      true,
      "the clone did not carry the durable status directory",
    );
    assert.equal(
      existsSync(join(clone, STATUS_DIR)),
      false,
      "the clone carried the ephemeral status directory, so it is not ignored",
    );
  } finally {
    dispose();
  }
});
