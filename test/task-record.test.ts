import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * READING A TASK RECORD, AND THE FOUR WAYS IT FAILS (CR-F02; T-036's
 * mechanism).
 *
 * `readTaskMeta` returned `undefined` for four different situations: an absent
 * file, one that is not a regular file or could not be read, a body that does
 * not parse, and a body that parses and is not a task record. Only the FIRST
 * is a category that is empty BY OBSERVATION. The other three are categories
 * that are empty BY CONSTRUCTION: there is something there and this read could
 * not turn it into a record, which is what a task killed mid-write looks like.
 *
 * Callers that decide whether work is in flight, or that report an absence,
 * turn that one value into "there is no task here". `classifyTaskMeta` is the
 * upstream read that keeps the four apart; this file is its witness.
 *
 * Sources are imported through the computed-URL dynamic-import pattern
 * (standing warning 4).
 */

interface TaskMetaRead {
  kind: "read" | "absent" | "unreadable" | "unparsable" | "malformed";
  reason?: string;
  meta?: { id: string; status: string };
}

interface TaskModule {
  classifyTaskMeta: (fleet: { tasksDir: string }, taskId: string) => TaskMetaRead;
  readTaskMeta: (
    fleet: { tasksDir: string },
    taskId: string,
  ) => { id: string; status: string } | undefined;
}

const taskModule = (await import(
  new URL("../src/task.ts", import.meta.url).href
)) as TaskModule;

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-task-record-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** A well-formed record, as `writeTaskMeta` renders one. */
function goodMeta(id: string): string {
  return `${JSON.stringify(
    {
      id,
      project: "/somewhere/projects/demo",
      shape: "ship",
      branch: `task/${id}`,
      worktree: `/somewhere/worktrees/${id}`,
      baseSha: "0".repeat(40),
      baseOffline: false,
      status: "open",
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
}

test(
  "a task record that is truncated and one that fails the field check are each distinguishable from an absent record",
  (t) => {
    /*
     * TWO STRUCTURALLY DIFFERENT MEMBERS OF ONE CLASS, and they are different
     * in the stage that fails rather than in the bytes: one dies in JSON.parse
     * (a write cut off mid-object), the other parses perfectly and is not a
     * task record (a write that completed against an older or wrong shape).
     * Two truncations at two offsets would be one member twice.
     */
    const tmp = makeTempDir(t);
    const tasksDir = join(tmp, "tasks");
    const fleet = { tasksDir };

    const write = (id: string, body: string): void => {
      mkdirSync(join(tasksDir, id), { recursive: true });
      writeFileSync(join(tasksDir, id, "meta.json"), body);
    };

    // THE BASELINE, empty by observation: no directory, no file.
    const absent = taskModule.classifyTaskMeta(fleet, "no-such-task");
    assert.equal(absent.kind, "absent");

    // A directory with no meta.json is ALSO absent, and that is deliberate:
    // the observation is about the record, not about the directory.
    mkdirSync(join(tasksDir, "empty-dir"), { recursive: true });
    assert.equal(taskModule.classifyTaskMeta(fleet, "empty-dir").kind, "absent");

    // MEMBER 1: truncated mid-write. Real bytes, cut at a real offset.
    const full = goodMeta("truncated");
    write("truncated", full.slice(0, Math.floor(full.length / 2)));
    const truncated = taskModule.classifyTaskMeta(fleet, "truncated");
    assert.equal(
      truncated.kind,
      "unparsable",
      `a truncated record was classified ${truncated.kind}`,
    );
    assert.notEqual(
      truncated.kind,
      "absent",
      "a truncated record reads as an absence, so a caller cannot tell a task " +
        "killed mid-write from a task that was never there",
    );
    assert.match(truncated.reason ?? "", /does not parse as JSON/);
    assert.match(truncated.reason ?? "", /meta\.json/);

    // MEMBER 2, STRUCTURALLY DIFFERENT: parses cleanly, is not a task record.
    write(
      "wrong-shape",
      `${JSON.stringify({ id: "wrong-shape", project: "/p", shape: "expedition" }, null, 2)}\n`,
    );
    const malformed = taskModule.classifyTaskMeta(fleet, "wrong-shape");
    assert.equal(
      malformed.kind,
      "malformed",
      `a record failing the field check was classified ${malformed.kind}`,
    );
    assert.notEqual(malformed.kind, "absent");
    assert.match(malformed.reason ?? "", /shape/);

    // A THIRD STAGE, kept apart from both: present and not openable as a
    // regular file. A FIFO here used to hang the reader forever (CR-520).
    const fifoDir = join(tasksDir, "fifo-record");
    mkdirSync(fifoDir, { recursive: true });
    const mkfifo = spawnSync("mkfifo", [join(fifoDir, "meta.json")], { encoding: "utf8" });
    if (mkfifo.status === 0) {
      const unreadable = taskModule.classifyTaskMeta(fleet, "fifo-record");
      assert.equal(unreadable.kind, "unreadable", `a FIFO was classified ${unreadable.kind}`);
      assert.notEqual(unreadable.kind, "absent");
    }

    // THE GREEN CONTROL. Without it every assertion above is satisfied by a
    // reader that never returns `read` at all.
    write("healthy", goodMeta("healthy"));
    const healthy = taskModule.classifyTaskMeta(fleet, "healthy");
    assert.equal(healthy.kind, "read");
    assert.equal(healthy.meta?.id, "healthy");
    assert.equal(healthy.meta?.status, "open");

    // AND THE NARROWING IS STILL THE NARROWING. `readTaskMeta` collapses all
    // four onto `undefined` by design, so a caller that uses it is choosing
    // not to make the distinction; this pins that it is a choice rather than
    // an accident, and that the healthy arm still reads.
    for (const id of ["no-such-task", "truncated", "wrong-shape"]) {
      assert.equal(taskModule.readTaskMeta(fleet, id), undefined);
    }
    assert.equal(taskModule.readTaskMeta(fleet, "healthy")?.id, "healthy");
  },
);

test("every task-record behavior in the registry resolves by name to a test title in this file", () => {
  const behaviors = JSON.parse(
    readFileSync(fileURLToPath(new URL("./behaviors.json", import.meta.url)), "utf8"),
  ) as Record<string, string>;
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  for (const id of ["task-record-unreadable-is-not-absent"]) {
    assert.ok(Object.hasOwn(behaviors, id), `behavior ${id} does not resolve in test/behaviors.json`);
    assert.ok(
      source.includes(`"${behaviors[id] as string}"`),
      `behavior ${id} is registered but its description is not a test title in this file`,
    );
  }
});
