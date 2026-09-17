import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type {
  ExecutorAdapter,
  ExecutorRecord,
  ExecutorRequest,
  LaunchOutcome,
} from "@tiphys/kernel";
import { invokeTurnEndHook, payloadExitCode } from "./hooks/turn-end.ts";
import {
  deliverStatus,
  fleetRootFromTaskPath,
  resolveKernelCli,
  stateForExitCode,
} from "./status.ts";

/**
 * THE CLAUDE CODE EXECUTOR ADAPTER (kernel plan M4, M4-P5; DR-0040 at
 * delivery/decisions/DR-0040-the-plugin-is-a-second-package-in-the-kernel-repository.md:1).
 *
 * WHAT THIS MODULE IS ALLOWED TO BE, and the restraint is the design. M4-P5
 * criterion 7 is "the adapter implements the interface and nothing else": the
 * hooks are M4-P6's (delivery/plan/kernel-plan-m4.md:882) and the model
 * resolution record is M4-P7's (delivery/plan/kernel-plan-m4.md:1018). So the
 * whole of this file is the three-armed launch contract, and the only thing
 * that makes it the CLAUDE CODE adapter rather than a second copy of the
 * kernel's built-in one is the package it ships in and the manifest beside it.
 * Anything richer here would be a file the next two phases have to unpick.
 *
 * M4-D-01 IS CLOSED AND THIS IS ITS SHIP-PHASE HALF. The decision is option 3,
 * the hybrid: subprocess for ship phases, primitive-backed for read-only
 * fan-out (delivery/plan/m4-intake.md:741). A ship phase is what `tiphys
 * spawn` launches, so this adapter is subprocess-backed, and the primitive
 * half has no phase in M4's plan to land in.
 *
 * THE ORDER OF THE TWO WRITES IS THE WHOLE SAFETY PROPERTY (criterion 8). The
 * launch record goes down BEFORE the payload starts, so a failure to write it
 * is provably a launch that never happened, which is the ONE outcome that
 * authorises the kernel to roll a worktree back. Everything after the payload
 * has started is `incomplete`, whatever went wrong, because the worktree may
 * hold real work by then and a rollback would be M1-P3's V-1 data-loss defect
 * wearing a new adapter's name. The arms are not interchangeable and they are
 * not symmetrical: transposing them turns a diagnostic into a deletion.
 *
 * THE TYPES COME FROM THE PACKAGE NAME (criterion 6). A relative import that
 * climbs out of this directory into the kernel's sources compiles inside this
 * workspace and breaks for every consumer who installs the two packages from
 * npm, and it is silent: the workspace build is green either way.
 * `@tiphys/kernel` publishes this contract deliberately (src/index.ts:1) and
 * it is the only spelling this package uses. The literal escaping-relative
 * token is kept out of this file on purpose, so that a reader grepping the
 * compiled output for one finds only real import specifiers.
 */

/**
 * THE ADAPTER'S NAME, AND IT IS WHAT THE LAUNCH RECORD WILL SAY RAN.
 *
 * It may not be `subprocess`: the kernel's loader refuses that name because
 * the record's `adapter` field is the only artifact that ever says which
 * adapter launched a task, and a loaded adapter claiming the built-in one's
 * name makes every later record unresolvably ambiguous
 * (src/adapters/load.ts:44). The refusal lives in the kernel; the check that
 * THIS name does not trip it lives in test/plugin-adapter.test.ts, compared
 * against the kernel's exported `BUILT_IN_ADAPTER_NAME` rather than against a
 * second copy of the string.
 */
export const ADAPTER_NAME = "claude-code";

/**
 * WHAT THIS ADAPTER CANNOT LAUNCH WITHOUT (M4-P3 criteria 2 and 3).
 *
 * `briefPath` and nothing else, and the declaration is a statement rather
 * than a default. An agent payload's entire input is its brief, so an adapter
 * that runs an agent and declared `[]` would be asserting something false;
 * the kernel's own subprocess adapter declares `[]` truthfully because it
 * runs a command in a directory and reads nothing.
 *
 * STATED PLAINLY BECAUSE IT WOULD OTHERWISE READ AS A GUARD: the kernel
 * always supplies `briefPath` (src/spawn.ts:104 makes it non-optional and
 * `requestFieldPresence` marks it present unconditionally), so the refusal
 * arm this declaration feeds is UNREACHABLE today. That is a property of the
 * kernel's request, not a weakness in the declaration, and the honest
 * declaration is still the true one.
 */
export const ADAPTER_REQUIRES: readonly string[] = ["briefPath"];

/**
 * A payload terminated by a signal has no exit code, and the turn-end hook
 * the kernel generates REFUSES a non-integer argument: it exits 64, which
 * `spawnTask` then surfaces as "the turn-end record could not be written",
 * hiding the real outcome behind a plumbing failure
 * (src/hooks.ts:47, delivery/plan/kernel-plan-m4.md:909).
 *
 * M4-P6 MOVED THE CONVERSION AND THIS RE-EXPORT IS THE WHOLE OF WHAT IS LEFT.
 * It now lives beside the invocation it feeds, in
 * `plugin/src/hooks/turn-end.ts`, because that is the file a witness mutates
 * and the file a second adapter author would read. The name stays exported
 * here so nothing that resolved it through the adapter has to move.
 */
export { payloadExitCode } from "./hooks/turn-end.ts";

/** The launch record this adapter writes, built from the request it was handed. */
function launchRecord(request: ExecutorRequest, launchedAt: Date): ExecutorRecord {
  const record: ExecutorRecord = {
    adapter: ADAPTER_NAME,
    launchedAt: launchedAt.toISOString(),
  };
  if (request.deadlineSeconds !== undefined) {
    record.deadline = new Date(
      launchedAt.getTime() + request.deadlineSeconds * 1000,
    ).toISOString();
  }
  // VERBATIM (M4-P3 criterion 6): what was REQUESTED, with no normalisation
  // and no vocabulary check. The tier-to-model mapping is M4-P7's and the
  // vocabulary is the plugin's, but neither of them is this record's: a
  // record written before the payload starts cannot carry anything anybody
  // could have observed about what was actually served.
  if (request.declaredTier !== undefined) {
    record.requestedTier = request.declaredTier;
  }
  if (request.role !== undefined) {
    record.requestedRole = request.role;
  }
  return record;
}

/** One line of a caught error, so a reason never spans a log line. */
function singleLine(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}

export const claudeCodeAdapter: ExecutorAdapter = {
  name: ADAPTER_NAME,
  requires: ADAPTER_REQUIRES,
  /**
   * ASYNCHRONOUS because the interface is (M4-P2), and every statement in the
   * body is still synchronous. This adapter does not background anything:
   * constraint C-3 forbids the kernel auto-backgrounding, `spawnTask` awaits
   * this promise, and the payload runs to completion before it settles.
   */
  async launch(request: ExecutorRequest): Promise<LaunchOutcome> {
    const launchedAt = new Date();
    const record = launchRecord(request, launchedAt);

    // WRITE ONE, AND IT IS BEFORE ANYTHING ELSE HAPPENS. A failure here is
    // the only failure this adapter can prove happened before the payload
    // started, so it is the only one that returns `launch-failed`.
    try {
      writeFileSync(request.recordPath, `${JSON.stringify(record, null, 2)}\n`);
    } catch (error) {
      return {
        kind: "launch-failed",
        reason:
          `the ${ADAPTER_NAME} adapter could not write the launch record ` +
          `${request.recordPath} (${singleLine(error)}), so the payload was never ` +
          `started`,
      };
    }

    const [program, ...args] = request.command;
    if (program === undefined) {
      return {
        kind: "launch-failed",
        reason: `the ${ADAPTER_NAME} adapter was handed an empty payload command`,
      };
    }

    // NO SHELL, on purpose and for the same reason the kernel's own adapter
    // refuses one: under a shell a missing payload binary arrives as an
    // ordinary exit code 127, indistinguishable from a payload that ran and
    // failed, and the rollback rule turns on exactly that distinction.
    //
    // AND IT IS NOT WRAPPED IN A try/catch, which is a decision rather than an
    // omission. `spawnSync` reports a failure to start through `error` and
    // that arm is handled below; a THROW from here is something else, and from
    // inside it there is no way to tell whether a process was created. An
    // adapter that answered that with `launch-failed` would be asserting the
    // payload never started on no evidence, and `launch-failed` is the arm
    // that authorises a rollback. Letting the promise reject instead puts the
    // kernel on the arm it built for exactly this: src/spawn.ts:899 leaves the
    // worktree, the task directory and the pool record in place and says the
    // adapter did not report whether the payload started.
    const started = spawnSync(program, args, {
      cwd: request.worktree,
      stdio: "inherit",
      // Spread rather than `env: request.env` so an undefined request.env
      // means "no env option at all", which is Node's documented
      // full-inheritance form. An adapter never widens the environment the
      // kernel built (src/spawn.ts:79).
      ...(request.env === undefined ? {} : { env: request.env }),
    });
    if (started.error !== undefined) {
      return {
        kind: "launch-failed",
        reason:
          `the ${ADAPTER_NAME} adapter could not launch ${program}: ` +
          `${singleLine(started.error)}`,
      };
    }

    // THE PAYLOAD HAS RUN. Every failure from here down is `incomplete`,
    // because the worktree may hold real work now.
    const exitCode = payloadExitCode(started.status, started.signal);

    // STATUS DELIVERY GOES FIRST, AND THE ORDER IS THE ASSERTION (M4-P6
    // criterion 8). Telemetry that can fail a delivery is the hazard, so the
    // emit is placed BEFORE the turn-end invocation on purpose: if anything
    // here could throw or could return early, the turn-end record would not
    // be written and the witness would see it. `deliverStatus` swallows every
    // failure by contract (plugin/src/status.ts:150) and its outcome is read
    // for the record's sake and never for the turn's.
    const delivery = deliverStatusForTurn(request, exitCode);

    const hooked = invokeTurnEndHook({
      hookPath: request.hookPath,
      termination: { status: started.status, signal: started.signal },
      env: request.env,
    });
    if (!hooked.ok) {
      return {
        kind: "incomplete",
        reason:
          `the payload exited ${String(exitCode)} but the turn-end hook ` +
          `${request.hookPath} failed (${hooked.detail}); the worktree and the ` +
          `task directory are left in place${statusSuffix(delivery)}`,
      };
    }
    return { kind: "completed", exitCode };
  },
};

/**
 * Emit the turn's status line, and report only whether it went out.
 *
 * SEPARATED FROM `launch` SO THE SWALLOW IS VISIBLE IN ONE PLACE. Every arm
 * of this function returns a string; none of them can change the outcome the
 * adapter is about to report, and none of them can prevent the turn-end
 * record from being written. That is criterion 8 stated as code rather than
 * as a comment, and the witness drives it by removing the directory the emit
 * writes into.
 */
function deliverStatusForTurn(request: ExecutorRequest, exitCode: number): string {
  const cli = resolveKernelCli();
  if (!cli.ok) {
    return cli.reason;
  }
  const delivered = deliverStatus({
    cliPath: cli.path,
    fleetRoot: fleetRootFromTaskPath(request.recordPath),
    run: request.taskId,
    state: stateForExitCode(exitCode),
    detail:
      `the ${ADAPTER_NAME} adapter finished task ${request.taskId} ` +
      `with exit code ${String(exitCode)}`,
    env: request.env,
  });
  return delivered.delivered ? "" : delivered.reason;
}

/** A failed status delivery is REPORTED, never escalated, in an incomplete
 * reason that already exists. Silence about an undelivered status line is the
 * shape this repository keeps paying for, and a suffix costs nothing. */
function statusSuffix(delivery: string): string {
  return delivery === "" ? "" : ` (the status line was not delivered: ${delivery})`;
}
