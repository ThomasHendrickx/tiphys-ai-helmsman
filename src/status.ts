/**
 * THE STATUS LINE (kernel plan M3, M3-P1 steps 5 and 6; R-084).
 *
 * The orchestrator narrates to the owner at MILESTONES ONLY: a phase merged,
 * an incident, a decision needed. Routine noise gets a one-line ack and
 * nothing else. That sparseness is expressed STRUCTURALLY in
 * `schemas/status-line.schema.json` rather than as an instruction: the state
 * vocabulary has exactly five members and none of them means "still working",
 * so a heartbeat is not a thing this contract can say.
 *
 * CONSTRAINT C-1, NAMED BECAUSE IT DECIDES THE SHAPE OF THIS MODULE.
 * "Never read current state from the tail of an append-only log." The stream
 * at `state/status/stream.jsonl` is the HISTORY and is append-only. The
 * current state is `status/current.json`, a whole document rewritten
 * atomically on every emit. `readCurrent` opens `current.json` and nothing
 * else; it does not know the stream's path. A truncated, corrupted or
 * half-written stream therefore cannot change what `tiphys status show`
 * reports, and that is the property criterion 7 witnesses in both directions.
 *
 * THE SPLIT (M4-D-13, decided in the M4-P18 plan section). The two documents
 * used to sit side by side under the gitignored `state/` prefix, so the one
 * sentence that says where the pipeline stands did not survive a fleet being
 * reclaimed: AGENTS.md's `fleet-state-commit-discipline` clause names "the
 * state file that says where the pipeline stands" as DURABLE, and an ignored
 * path can be neither committed nor pushed. So the pointer moved OUT of
 * `state/` to a tracked path and the stream stayed, because the stream is
 * history that a restart rebuilds.
 *
 * C-1 IS THE REASON FOR THE SPLIT AND NOT A CONSTRAINT IT HAS TO DODGE.
 * `readCurrent` opens the whole document and has no code path that reaches
 * the stream, so moving the document changes WHERE it lives and changes
 * NOTHING about how current state is read. The pair of witnesses in
 * test/status.test.ts is re-pointed at the new layout and still reddens
 * under the same mutation: `readCurrent` aimed at STREAM_FILE.
 *
 * ATOMIC REWRITE means write a temp file beside the target and rename. A
 * rename within one directory is atomic on POSIX, so a reader either sees the
 * whole previous document or the whole new one and never a partial write.
 * The temp file is created beside the DURABLE document, so the two paths in
 * the rename stay inside one directory after the split.
 */

import { mkdirSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { refuseOpenForWrite, readRegularFileIfPresent } from "./task.ts";

/**
 * Where the status files live inside a fleet home, and the two directories
 * are on OPPOSITE sides of the fleet `.gitignore` by design (M4-D-13).
 * `STATUS_DIR` is under the ignored `state/` prefix and holds the rebuilt
 * history; `DURABLE_STATUS_DIR` is tracked and holds the one document a
 * restart must not lose.
 */
export const STATUS_DIR = join("state", "status");
export const DURABLE_STATUS_DIR = "status";
export const STREAM_FILE = join(STATUS_DIR, "stream.jsonl");
export const CURRENT_FILE = join(DURABLE_STATUS_DIR, "current.json");

/**
 * The five supervisor-actionable states, blueprint section 5. Duplicated
 * from `schemas/status-line.schema.json` so the CLI can reject a bad state
 * before it composes a record; `test/status.test.ts` asserts the two agree,
 * because a duplicated vocabulary that nothing compares is a vocabulary that
 * drifts.
 */
export const STATUS_STATES: readonly string[] = [
  "blocked",
  "done",
  "failed",
  "needs-decision",
  "phase-change",
];

export interface StatusRecord {
  kind: "status-line";
  at: string;
  run: string;
  project: string;
  state: string;
  detail: string;
  refs: string[];
}

export interface EmitInput {
  run: string;
  project: string;
  state: string;
  detail?: string;
  refs?: string[];
  /** Injected so a test can assert an exact record rather than a shape. */
  at?: string;
}

/** RFC 3339 UTC to whole seconds, the form the schema's pattern accepts. */
export function nowIso(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

export function makeStatusRecord(input: EmitInput): StatusRecord {
  return {
    kind: "status-line",
    at: input.at ?? nowIso(),
    run: input.run,
    project: input.project,
    state: input.state,
    detail: input.detail ?? "",
    refs: input.refs ?? [],
  };
}

export type EmitOutcome =
  | { ok: true; record: StatusRecord }
  | { ok: false; reason: string };

/**
 * Append ONE line to the stream, then rewrite `current.json` atomically.
 *
 * The order is deliberate and is the same ordering rule M2's gate runner
 * learned: the durable history is written first, so a crash between the two
 * leaves a history that is ahead of the pointer rather than a pointer that
 * names an event no record supports.
 */
export function emitStatus(fleetRoot: string, record: StatusRecord): EmitOutcome {
  /* TWO DIRECTORIES SINCE THE SPLIT, and both are created before either is
     written: the ephemeral one is rebuilt by `tiphys resume` after a reclaim
     and the durable one comes across in a clone, so on any given fleet home
     either can be the one that is absent. */
  mkdirSync(join(fleetRoot, STATUS_DIR), { recursive: true });
  mkdirSync(join(fleetRoot, DURABLE_STATUS_DIR), { recursive: true });
  const streamPath = join(fleetRoot, STREAM_FILE);
  const currentPath = join(fleetRoot, CURRENT_FILE);
  const temporaryPath = `${currentPath}.tmp`;

  for (const path of [streamPath, currentPath, temporaryPath]) {
    const refusal = refuseOpenForWrite(path);
    if (refusal !== undefined) {
      return { ok: false, reason: refusal };
    }
  }

  appendFileSync(streamPath, `${JSON.stringify(record)}\n`, "utf8");
  writeFileSync(temporaryPath, `${JSON.stringify(record, undefined, 2)}\n`, "utf8");
  renameSync(temporaryPath, currentPath);
  return { ok: true, record };
}

export type CurrentRead =
  | { ok: true; record: StatusRecord }
  | { ok: false; reason: string };

/**
 * Read the current status. C-1: this function knows only `current.json`.
 *
 * It does not accept a stream path, does not fall back to the stream, and
 * has no code path that opens it. That is what makes criterion 7 a
 * demonstrable property rather than a convention: an implementation that
 * reads the stream is a DIFFERENT function, and the criterion requires it to
 * be written, shown red against corrupt stream bytes, and reverted.
 */
export function readCurrent(fleetRoot: string): CurrentRead {
  const path = join(fleetRoot, CURRENT_FILE);
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { ok: false, reason: `no status has been emitted in ${fleetRoot}` };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      ok: false,
      reason: `${path} is not readable as a status record: ${(error as Error).message}`,
    };
  }
  return { ok: true, record: parsed as StatusRecord };
}

/** One line, the form `tiphys status show` prints. */
export function renderStatus(record: StatusRecord): string {
  const refs = record.refs.length === 0 ? "" : ` refs=${record.refs.join(",")}`;
  return `${record.at} ${record.state} run=${record.run} project=${record.project}${
    record.detail === "" ? "" : ` ${record.detail}`
  }${refs}`;
}
