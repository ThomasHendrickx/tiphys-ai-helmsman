import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { assembleBrief } from "./brief.ts";
import { buildChildEnv, scrubRoot } from "./exec/env.ts";
import type { Fleet } from "./fleet.ts";
import { writeTurnEndHook } from "./hooks.ts";
import { poolCreate, poolDestroy, worktreePath } from "./pool.ts";
import {
  checkHoldership,
  executorRecordPath,
  metaPath,
  readRegularFileIfPresent,
  runStep,
  runStepAsync,
  taskDir,
  taskDirExists,
  taskDirOccupied,
  turnEndPath,
  writeTaskMeta,
} from "./task.ts";
import type { GuardResult, TaskMeta, TaskShape } from "./task.ts";

/**
 * tiphys spawn (kernel plan v1, M1-P4 step 4): worktree, brief, turn-end
 * hook, task meta and the executor launch in ONE command.
 *
 * Order, exactly as the plan states it: liveness-guard check (M1-P5; a
 * documented no-op seam in this phase), holdership check, pool create,
 * brief assembly, meta write, executor launch. The holdership check runs
 * before pool create because its refusal must create nothing
 * (criterion 12).
 *
 * Rollback contract, stated narrowly because the broad version would not
 * be honest (the lesson M1-P3's destroy paid for four times over):
 *
 *   - A failure BEFORE pool create removes nothing, because nothing was
 *     created. In particular a duplicate task id leaves any pre-existing
 *     tasks/<id>/ byte-identical: this command writes nothing under
 *     tasks/ until pool create has succeeded (criterion 4, PR-005).
 *   - A failure AFTER pool create and BEFORE the payload starts removes
 *     exactly what this invocation created (the files it wrote, the task
 *     directory when it created it, and the pool worktree) and nothing
 *     else (criterion 5). This holds for a step that RETURNS a failure
 *     and for one that THROWS: every write in that window goes through
 *     runStep, because an unwrapped raise walked past the rollback
 *     entirely and orphaned the worktree, the branch and the pool record
 *     (F-2). The worktree is untouched at that point, so
 *     the removal passes the ordinary pool destroy gates and needs no
 *     force flag: --discard and --delete-branch-force are deliberately
 *     NOT passed, so a worktree that somehow is not pristine refuses and
 *     survives rather than being destroyed by a cleanup path.
 *   - Once the PAYLOAD HAS STARTED, nothing is ever rolled back. The
 *     worktree may hold real work by then, and a cleanup that removed it
 *     would be M1-P3's V-1 data-loss defect with a different name. A
 *     failure after that point reports what happened and changes
 *     nothing.
 *
 * Substrate: everything here is substrate-neutral except the executor,
 * which sits behind ExecutorAdapter (DR-0007). M1 ships exactly one
 * adapter, the local subprocess one.
 */

/** What the adapter is asked to do. Everything crosses as files and exit codes. */
export interface ExecutorRequest {
  taskId: string;
  /** cwd for the payload: the task worktree. */
  worktree: string;
  /** argv of the payload, argv[0] being the program. */
  command: string[];
  /** Script the adapter invokes with the payload exit code when it exits. */
  hookPath: string;
  /** Where the adapter writes its launch record. */
  recordPath: string;
  /** Optional non-completion deadline in seconds (PR-207). */
  deadlineSeconds: number | undefined;
  /**
   * The EXACT environment for BOTH children this launch produces: the
   * payload and the turn-end hook (M2-P8, M2R-004 edit 4). Built by
   * `buildChildEnv` (src/exec/env.ts): allowlisted names only, with the
   * five credential-store pointers redirected to harness-owned paths.
   * `undefined` means the children inherit the parent's environment
   * UNCHANGED, and is only ever passed under `allowPrCredentials`, the
   * declared escape hatch; an adapter must never widen it on its own.
   */
  env: Record<string, string> | undefined;
}

/**
 * Launch outcomes. The distinction between a payload that never started
 * and one that did is load-bearing: only the first authorizes rollback.
 */
export type LaunchOutcome =
  | { kind: "completed"; exitCode: number }
  | { kind: "launch-failed"; reason: string }
  | { kind: "incomplete"; reason: string };

/**
 * The ExecutorAdapter interface (DR-0007, M1-P4 grounding). The ENTIRE
 * contract is: write the launch record tasks/<id>/executor.json at
 * launch, launch the payload in the task worktree, and ensure the
 * turn-end file is written with the payload exit code on completion. All
 * state crosses this boundary through files and exit codes, never
 * through terminal inspection (FM-055: pane scraping is a race farm;
 * FM-060: every toolbelt boundary is a subprocess with an exit code).
 * A multiplexer-window adapter and a cloud-session adapter are further
 * adapters against this same interface, not kernel changes (M4 era).
 */
export interface ExecutorAdapter {
  readonly name: string;
  /**
   * ASYNCHRONOUS since M4-P2. An agent turn is long and a subprocess is
   * short: a window adapter or a cloud-session adapter cannot express
   * "the turn ended" in a synchronous return, so the signature that only
   * ever fitted the local subprocess case is the one that changes.
   *
   * This is NOT permission to background (constraint C-3). The kernel
   * AWAITS this promise inside `spawnTask`, so the command still ends
   * after the payload does; awaiting a call is not outliving it, and
   * delivery/plan/kernel-plan-v1.md:311 already puts process ownership in
   * the harness rather than the kernel.
   *
   * The three-armed outcome is unchanged and is still the whole contract:
   * only `launch-failed` authorises rollback, because only `launch-failed`
   * asserts that the payload never started. An adapter that cannot tell
   * returns `incomplete` and the kernel touches nothing. What DID change
   * is that `completed` is no longer taken on the adapter's word: see the
   * completion precondition in `spawnTask`.
   */
  launch(request: ExecutorRequest): Promise<LaunchOutcome>;
}

/** The launch record (JSON per DR-0006, shape per PR-207). */
export interface ExecutorRecord {
  adapter: string;
  launchedAt: string;
  /**
   * Absolute ISO-8601 instant by which the task must have completed,
   * present only when --deadline was passed. Recorded as an instant
   * rather than as the raw seconds so the M1-P5 watcher compares it
   * against the clock directly, the way it already compares lease
   * expiry, instead of re-deriving it from launchedAt. The plan fixes
   * the field name and its optionality, not its units; this is the
   * choice, recorded rather than assumed.
   */
  deadline?: string;
}

/**
 * A payload terminated by a signal has no exit code. The shell's
 * convention (128 + signal number) is used so the turn-end record always
 * carries a number. M1 never drives this path; it exists so that the
 * type is honest rather than filled with a guess.
 */
function payloadExitCode(status: number | null, signal: NodeJS.Signals | null): number {
  if (status !== null) {
    return status;
  }
  const signals = constants.signals as unknown as Record<string, number | undefined>;
  const number = signal === null ? undefined : signals[signal];
  return 128 + (number ?? 0);
}

/**
 * The local subprocess adapter, the one M1 ships (and the one the exit
 * test's stub payload uses).
 *
 * The payload runs to COMPLETION before this returns: the kernel never
 * auto-backgrounds anything (plan constraint C-3, FM-054), so there is
 * no daemonize path here to forget to guard.
 *
 * `async` since M4-P2, and its BODY IS UNCHANGED: every statement below
 * is still synchronous, `spawnSync` is still what runs both children, and
 * the promise this now returns is already settled by the time the first
 * `await` on it runs. The keyword is there because the INTERFACE is async
 * for the adapters that need it, not because this adapter gained a
 * concurrency path to get wrong.
 *
 * It runs without a shell on purpose. Under a shell a missing payload
 * binary arrives as an ordinary exit code 127, indistinguishable from a
 * payload that ran and failed, and spawn's rollback rule turns on
 * exactly that distinction.
 */
export const subprocessAdapter: ExecutorAdapter = {
  name: "subprocess",
  async launch(request: ExecutorRequest): Promise<LaunchOutcome> {
    const launchedAt = new Date();
    const record: ExecutorRecord = {
      adapter: "subprocess",
      launchedAt: launchedAt.toISOString(),
    };
    if (request.deadlineSeconds !== undefined) {
      record.deadline = new Date(
        launchedAt.getTime() + request.deadlineSeconds * 1000,
      ).toISOString();
    }
    // The record write happens BEFORE the payload, so a failure here is
    // provably a launch failure and is safe to roll back. Everything
    // after the payload starts is reported as incomplete instead, which
    // never rolls anything back (F-2's fix must not become V-1's defect).
    const written = runStep(`writing the launch record ${request.recordPath}`, () => {
      writeFileSync(request.recordPath, `${JSON.stringify(record, null, 2)}\n`);
    });
    if (!written.ok) {
      return { kind: "launch-failed", reason: written.reason };
    }

    const [program, ...args] = request.command;
    if (program === undefined) {
      return { kind: "launch-failed", reason: "empty --exec command" };
    }
    const result = spawnSync(program, args, {
      cwd: request.worktree,
      stdio: "inherit",
      // The scrubbed environment (M2-P8). Spread rather than `env:
      // request.env` so an undefined request.env means "no env option at
      // all", which is Node's documented full-inheritance form.
      ...(request.env === undefined ? {} : { env: request.env }),
    });
    if (result.error !== undefined) {
      return {
        kind: "launch-failed",
        reason: `cannot launch ${program}: ${String(result.error)}`,
      };
    }
    const exitCode = payloadExitCode(result.status, result.signal);

    // The payload has run. Every failure below, raised or returned, is
    // reported as incomplete: the worktree may hold real work now, so
    // nothing here may lead to a rollback.
    const hooked = runStep(`invoking the turn-end hook ${request.hookPath}`, () =>
      spawnSync(process.execPath, [request.hookPath, String(exitCode)], {
        stdio: "inherit",
        // The hook child gets the SAME scrubbed environment as the
        // payload (M2R-004 edit 4): a second launch nobody scrubbed is
        // exactly the leak the finding names. The generated hook script
        // itself reads no environment at all (src/hooks.ts), so the
        // scrub cannot break it.
        ...(request.env === undefined ? {} : { env: request.env }),
      }),
    );
    if (!hooked.ok) {
      return {
        kind: "incomplete",
        reason:
          `the payload exited ${String(exitCode)} but the turn-end record could not ` +
          `be written (${hooked.reason}); the worktree and the task directory are ` +
          `left in place`,
      };
    }
    const hook = hooked.value;
    if (hook.error !== undefined || hook.status !== 0) {
      const detail =
        hook.error === undefined ? `exit ${String(hook.status)}` : String(hook.error);
      return {
        kind: "incomplete",
        reason:
          `the payload exited ${String(exitCode)} but the turn-end hook ` +
          `${request.hookPath} failed (${detail}); the worktree and the task ` +
          `directory are left in place`,
      };
    }
    return { kind: "completed", exitCode };
  },
};

/**
 * THE COMPLETION PRECONDITION (M4-P2 step 5).
 *
 * `completed` used to be believed because the only adapter that could
 * return it was the one three lines above, which invokes the turn-end hook
 * itself before returning. Once `launch` is a promise that is no longer
 * true: any adapter may resolve `completed` while its agent is still
 * running, and `spawnTask` would then delete the scrub root out from under
 * a LIVE child's HOME and report success.
 *
 * So the kernel stops taking the adapter's word and reads the artifact the
 * payload's own exit produces. tasks/<id>/turn-end is written by the
 * generated hook (src/hooks.ts:57) with the payload's exit code; it is the
 * same file the watcher wakes on. A `completed` with no readable turn-end
 * record is refused.
 *
 * FOUR distinct refusals, not one, and the distinction is the point. A
 * check written as `existsSync` is green on a present-but-corrupt record,
 * which is a guard whose condition does not test the property that matters.
 * Absent, unreadable, unparseable and wrongly-shaped are all "this is not
 * evidence that the payload ended", and each says which one it was.
 *
 * The read goes through `readRegularFileIfPresent` rather than
 * `readFileSync` so a FIFO at the turn-end path is a refusal and not a
 * hang: this is the same hazard CR-520 records for meta.json, one path
 * along.
 *
 * WHAT THIS DOES NOT DO: it never rolls anything back and it never removes
 * anything. A refusal here is reported with the residue enumerated, exactly
 * like the `incomplete` arm, because the payload demonstrably ran far
 * enough for an adapter to claim it finished.
 */
function turnEndEvidence(
  fleet: Fleet,
  taskId: string,
): { ok: true } | { ok: false; reason: string } {
  const path = turnEndPath(fleet, taskId);
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { ok: false, reason: `the turn-end record ${path} was never written` };
  }
  if (read.kind === "refused") {
    return {
      ok: false,
      reason: `the turn-end record ${path} could not be read (${read.reason})`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `the turn-end record ${path} does not parse as JSON (${detail})`,
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      reason: `the turn-end record ${path} does not parse as a turn-end record`,
    };
  }
  const candidate = parsed as { endedAt?: unknown; exitCode?: unknown };
  if (typeof candidate.endedAt !== "string" || !Number.isInteger(candidate.exitCode)) {
    return {
      ok: false,
      reason:
        `the turn-end record ${path} does not parse as a turn-end record ` +
        `(it needs a string endedAt and an integer exitCode)`,
    };
  }
  return { ok: true };
}

/**
 * Liveness-guard seam (plan step 4). The guard itself is M1-P5 work; in
 * this phase it is a documented no-op, so that P5 adds a body here
 * rather than a new call site in the middle of the spawn sequence.
 */
export function livenessGuard(fleet: Fleet): GuardResult {
  void fleet;
  return { ok: true };
}

/**
 * Tokenise --exec. M1 supports a program plus plain arguments separated
 * by whitespace; there is no shell and no quoting. Anything richer is an
 * adapter's business (M4 era), not a string this kernel re-parses.
 */
export function parseExecCommand(command: string): string[] {
  return command.split(/\s+/u).filter((token) => token !== "");
}

export interface SpawnOptions {
  taskId: string;
  project: string;
  briefFile: string;
  shape: TaskShape;
  exec: string;
  deadlineSeconds: number | undefined;
  /** Passed straight through to pool create (EXT-F-03); see spawnTask. */
  offline: boolean;
  /**
   * DECLARED ESCAPE HATCH from the credential scrub (M2-P8 criterion 1).
   * When true, both children inherit the parent environment unchanged,
   * including any pull-request-capable credential the parent holds. This
   * exists for the orchestrator's own spawns, never for an implementer
   * payload; default is false and the scrub is on.
   */
  allowPrCredentials?: boolean;
  adapter?: ExecutorAdapter;
}

export interface SpawnSuccess {
  meta: TaskMeta;
  exitCode: number;
}

export type SpawnResult =
  | { ok: true; value: SpawnSuccess }
  | { ok: false; reason: string };

/**
 * One spawn. See the module docs for the rollback contract.
 *
 * --offline is passed straight through to pool create and is the only
 * way a fleet can reach an offline base. meta.baseOffline is then COPIED
 * from the pool record the create returned, never recomputed from this
 * flag: pool create attempts the fetch even under --offline and records
 * offline false when it succeeds, so a spawn that trusted its own flag
 * would mark a perfectly fetched base as offline (PR-212, and the
 * provenance inversion measured as V-2 in M1-P3).
 */
export async function spawnTask(
  fleet: Fleet,
  options: SpawnOptions,
): Promise<SpawnResult> {
  const { taskId } = options;

  const liveness = livenessGuard(fleet);
  if (!liveness.ok) {
    return { ok: false, reason: liveness.reason };
  }
  const holdership = checkHoldership(fleet);
  if (!holdership.ok) {
    return { ok: false, reason: holdership.reason };
  }

  const command = parseExecCommand(options.exec);
  if (command.length === 0) {
    return { ok: false, reason: "--exec is empty" };
  }

  // CR-301, checked before pool create so the refusal creates nothing and
  // destroys nothing. tasks/<id>/ survives every teardown by design, so a
  // reused id would otherwise overwrite a closed task's records, hand the
  // rollback files it did not create, and leave the previous
  // incarnation's turn-end readable beside a meta that says open.
  if (taskDirOccupied(fleet, taskId)) {
    return {
      ok: false,
      reason:
        `task directory ${taskDir(fleet, taskId)} already holds records for task ` +
        `id ${taskId}; a task id is spawned once, so choose a fresh id or move ` +
        `that directory aside before re-using this one`,
    };
  }

  const created = await poolCreate(fleet, {
    taskId,
    project: options.project,
    offline: options.offline,
  });
  if (!created.ok) {
    return { ok: false, reason: created.reason };
  }
  const poolRecord = created.value;
  const worktree = worktreePath(fleet, taskId);

  // Everything below is rollback-scoped: this list holds exactly what
  // THIS invocation created, in creation order.
  const createdFiles: string[] = [];
  const dir = taskDir(fleet, taskId);
  const createdTaskDir = !taskDirExists(fleet, taskId);
  const rollback = async (reason: string): Promise<SpawnResult> => {
    for (const file of [...createdFiles].reverse()) {
      try {
        unlinkSync(file);
      } catch {
        // Never written, or already gone.
      }
    }
    // The scrub root (harness-owned redirect targets, M2-P8) is created
    // by THIS invocation strictly before the launch, and this rollback
    // only ever runs before the payload has started, so removing it
    // recursively removes only what this invocation staged. It sits
    // inside the task directory, never inside the worktree.
    try {
      rmSync(scrubRoot(dir), { recursive: true, force: true });
    } catch {
      // Never created, or already gone.
    }
    if (createdTaskDir) {
      try {
        rmdirSync(dir);
      } catch {
        // Left in place when it is not empty: whatever is in it was not
        // created by this invocation, and this rollback does not own it.
      }
    }
    const destroyed = await poolDestroy(fleet, {
      taskId,
      discard: false,
      deleteBranchForce: false,
    });
    if (!destroyed.ok) {
      return {
        ok: false,
        reason: `${reason}; rollback of the worktree did not complete: ${destroyed.reason}`,
      };
    }
    return { ok: false, reason };
  };

  // From here to the launch, EVERY step goes through runStep: a raised
  // fs error is folded into the same ok/reason shape a returned failure
  // uses, so one handler covers both and the rollback cannot be walked
  // past (F-2).
  if (createdTaskDir) {
    const made = runStep(`creating the task directory ${dir}`, () => {
      mkdirSync(dir, { recursive: true });
    });
    if (!made.ok) {
      return rollback(made.reason);
    }
  }

  const brief = runStep(`assembling the brief for task ${taskId}`, () =>
    assembleBrief(fleet, taskId, options.briefFile),
  );
  if (!brief.ok) {
    return rollback(brief.reason);
  }
  if (!brief.value.ok) {
    return rollback(brief.value.reason);
  }
  createdFiles.push(brief.value.value);

  const meta: TaskMeta = {
    id: taskId,
    project: poolRecord.project,
    shape: options.shape,
    branch: poolRecord.branchName,
    worktree,
    baseSha: poolRecord.baseSha,
    baseOffline: poolRecord.offline,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  const wroteMeta = runStep(`writing ${metaPath(fleet, taskId)}`, () => {
    writeTaskMeta(fleet, meta);
  });
  if (!wroteMeta.ok) {
    return rollback(wroteMeta.reason);
  }
  createdFiles.push(metaPath(fleet, taskId));

  const hook = runStep(`writing the turn-end hook for task ${taskId}`, () =>
    writeTurnEndHook(fleet, taskId),
  );
  if (!hook.ok) {
    return rollback(hook.reason);
  }
  const hookPath = hook.value;
  createdFiles.push(hookPath);

  const recordPath = executorRecordPath(fleet, taskId);
  createdFiles.push(recordPath);

  // The child environment (M2-P8): built from the allowlist with the
  // credential-store pointers redirected into this task's directory,
  // unless the caller passed the declared escape hatch. Built BEFORE the
  // launch so a staging failure is a rollback, never a half-scrubbed
  // child.
  let childEnv: Record<string, string> | undefined;
  if (options.allowPrCredentials !== true) {
    const built = runStep(
      `constructing the scrubbed child environment for task ${taskId}`,
      () => buildChildEnv({ parentEnv: process.env, scrubDir: scrubRoot(dir) }),
    );
    if (!built.ok) {
      return rollback(built.reason);
    }
    if (!built.value.ok) {
      return rollback(built.value.reason);
    }
    childEnv = built.value.env;
  }

  const adapter = options.adapter ?? subprocessAdapter;
  // AWAITED (M4-P2 step 4), and `runStepAsync` rather than `runStep` is
  // load-bearing rather than cosmetic. `runStep` over a promise-returning
  // callback returns {ok: true, value: <a pending promise>} before the
  // adapter has done anything: the launch-failed arm below would never be
  // reached, `outcome.kind` would be undefined on every launch, and a
  // rejection would leave the result type entirely as an unhandled
  // rejection with no handler to roll back or refuse.
  const launched = await runStepAsync(
    `launching the payload through the ${adapter.name} adapter`,
    async () =>
      adapter.launch({
        taskId,
        worktree,
        command,
        hookPath,
        recordPath,
        deadlineSeconds: options.deadlineSeconds,
        env: childEnv,
      }),
  );
  if (!launched.ok) {
    // An adapter that THREW rather than returning an outcome cannot tell
    // us whether the payload started, and this rollback destroys a
    // worktree. Refusing to guess is the whole lesson of V-1: the state
    // is left in place and enumerated instead.
    //
    // Since M4-P2 this arm also covers a REJECTED promise, and it covers
    // it for the same reason and with the same words: a rejection is an
    // adapter failing to report, and WHEN it rejects tells us nothing,
    // because an adapter that rejects before the payload starts and one
    // that rejects after it dies are indistinguishable from here. An
    // adapter that actually knows the payload never started says so, by
    // RETURNING launch-failed, and that arm rolls back.
    return {
      ok: false,
      reason:
        `${launched.reason}; the ${adapter.name} adapter did not report whether the ` +
        `payload started, so nothing was rolled back: the worktree ${worktree}, its ` +
        `task directory and the pool record are left in place for inspection; when ` +
        `you have inspected them, close the task with "tiphys teardown --task ${taskId}"`,
    };
  }
  const outcome = launched.value;
  if (outcome.kind === "launch-failed") {
    return rollback(`executor launch failed: ${outcome.reason}`);
  }
  if (outcome.kind === "incomplete") {
    // The payload ran, so nothing is rolled back, and the reason says so.
    // The scrub root is deliberately LEFT in place here: the hook child
    // failed, and whatever the children left under the redirected paths
    // is part of the state an operator inspects.
    return { ok: false, reason: outcome.reason };
  }
  // THE COMPLETION PRECONDITION (M4-P2 step 5). The only arm left is
  // `completed`, and it is the only arm that DESTROYS something (the
  // scrub root, which is a live child's redirected HOME while that child
  // lives). Before M4-P2 the destruction was safe because `launch` was
  // synchronous and the sole adapter wrote the turn-end record itself; an
  // async `launch` lets any adapter resolve `completed` early, so the
  // kernel checks the payload's own artifact instead of believing the
  // report. See turnEndEvidence above for the four refusals.
  const evidence = turnEndEvidence(fleet, taskId);
  if (!evidence.ok) {
    return {
      ok: false,
      reason:
        `the ${adapter.name} adapter reported the payload completed with exit code ` +
        `${String(outcome.exitCode)}, but ${evidence.reason}, so the kernel does not ` +
        `accept that the payload ended; nothing was rolled back and nothing was ` +
        `removed: the worktree ${worktree}, its task directory, the pool record and ` +
        `the harness-owned redirect targets under ${scrubRoot(dir)} are all left in ` +
        `place for inspection; when you have inspected them, close the task with ` +
        `"tiphys teardown --task ${taskId}"`,
    };
  }

  // The scrub root is ephemeral. Both children have exited: the turn-end
  // record exists and parses, which is the payload's own exit writing
  // itself down, and the launch promise has been awaited, so the harness-
  // owned redirect targets have no further reader. That sentence used to
  // read "the launch is synchronous, C-3", and it stopped being true the
  // moment `launch` returned a promise; a comment asserting a dead
  // invariant is how the next reader re-derives the defect, so the
  // reasoning is restated rather than left. C-3 is still satisfied, by
  // the await rather than by the signature. This removal touches ONLY the
  // scrub root, never the worktree, so it cannot be a V-1-shaped loss.
  if (childEnv !== undefined) {
    try {
      rmSync(scrubRoot(dir), { recursive: true, force: true });
    } catch {
      // A leftover empty scrub directory is benign; failing a completed
      // spawn over its cleanup would not be.
    }
  }
  return { ok: true, value: { meta, exitCode: outcome.exitCode } };
}
