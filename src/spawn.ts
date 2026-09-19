import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { BUILT_IN_ADAPTER_NAME, selectAdapter } from "./adapters/load.ts";
import { assembleBrief } from "./brief.ts";
import {
  CREDENTIAL_STORE_REDIRECTIONS,
  buildChildEnv,
  extensionName,
  extensionReason,
  refuseExtraAllowlist,
  scrubRoot,
} from "./exec/env.ts";
import { guardSharedRegister } from "./exclusion.ts";
import type { ChildEnvExtension } from "./exec/env.ts";
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
import type {
  CredentialHandoverRecord,
  GuardResult,
  PayloadClass,
  TaskCredentialRecord,
  TaskMeta,
  TaskShape,
} from "./task.ts";

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
  /**
   * THE ASSEMBLED BRIEF, and it is NOT optional (M4-P3 criterion 1).
   *
   * The brief is the agent payload's entire input, and until this phase the
   * request did not carry it at all, although the call site already had it:
   * `assembleBrief` returns the path and `spawnTask` pushes it onto
   * `createdFiles` before the launch. So an optional `briefPath` would be an
   * optionality the kernel never exercises, which is a field that cannot go
   * red: every production path supplies it and no test could construct the
   * absent case without inventing one.
   *
   * The three fields below it are `string | undefined` for the opposite
   * reason: nothing in the kernel produces them, they arrive from the caller,
   * and an adapter that needs one says so through `requires` rather than
   * hoping.
   */
  briefPath: string;
  /**
   * The role the payload is being asked to play, verbatim as the caller named
   * it. The kernel neither interprets it nor holds a vocabulary for it; the
   * role briefs are a shipped artifact and the mapping from a role to a brief
   * is the plugin's business.
   */
  role: string | undefined;
  /**
   * THE DECLARED TIER, VERBATIM, AND NEVER A MODEL NAME (M4-P3, the
   * zero-vendor-names requirement). Whatever `role-model-config.yaml`
   * declares, `strongest` or `cheaper` or anything else, crosses this seam
   * unaltered. The tier-to-model mapping lives in the plugin: a mapping in
   * `src/` is what would close off every harness that is not the one it names
   * (delivery/plan/m4-intake.md:377).
   */
  declaredTier: string | undefined;
  /**
   * The delivery phase this task belongs to, CARRIED and never DERIVED.
   *
   * The scope gate derives a phase id from a branch name, and M4-D-22 leaves
   * open whether that convention is the kernel's or the delivering project's.
   * A kernel that derived the phase id from a branch here would settle
   * M4-D-22 by accident, and a shipped constant is the hardest kind of
   * decision to renumber.
   */
  phaseId: string | undefined;
}

/**
 * THE FIELDS AN ADAPTER MAY NAME IN `requires`, AND WHETHER EACH ONE CAN BE
 * ABSENT (M4-P3 criteria 2 and 3).
 *
 * This is the ONE source for both halves of the requirement check, and it is
 * one source on purpose: a list of legal names maintained beside a separate
 * list of presence tests is two things that drift, and the drift is silent in
 * exactly the direction that matters (a new request field nobody can require,
 * or a requirable name nothing can satisfy). `requirableRequestFields` reads
 * its answer back out of this function, so there is nothing to keep in step.
 *
 * The six names set to `true` unconditionally are the ones the KERNEL
 * produces: it has a task id because it was given one, a worktree and a
 * record path because it computed them, a command because it refused an empty
 * one, a hook path because it wrote the hook, and a brief path because
 * `assembleBrief` returned one. None of them can be absent by the time the
 * request is built, and `test/spawn.test.ts` checks that claim against the
 * request an adapter is actually handed rather than leaving it asserted here.
 */
function requestFieldPresence(options: SpawnOptions): Map<string, boolean> {
  const presence = new Map<string, boolean>();
  for (const name of ["taskId", "worktree", "command", "hookPath", "recordPath", "briefPath"]) {
    presence.set(name, true);
  }
  presence.set("deadlineSeconds", options.deadlineSeconds !== undefined);
  presence.set("env", options.allowPrCredentials !== true);
  presence.set("role", options.role !== undefined);
  presence.set("declaredTier", options.declaredTier !== undefined);
  presence.set("phaseId", options.phaseId !== undefined);
  return presence;
}

/** The closed set of names an adapter may name in `requires`, in field order. */
export function requirableRequestFields(): readonly string[] {
  return [
    ...requestFieldPresence({
      taskId: "",
      project: "",
      briefFile: "",
      shape: "ship",
      exec: "",
      deadlineSeconds: undefined,
      offline: false,
      // M4-P8: a REQUIRED SpawnOptions field, and deliberately NOT a
      // requirable request field. `requestFieldPresence` maps names an
      // adapter may declare in `requires`, and every one of them is a field
      // of `ExecutorRequest`; the payload class never crosses that seam, so
      // it appears here only because the literal must typecheck.
      payloadClass: "project",
      role: undefined,
      declaredTier: undefined,
      phaseId: undefined,
    }).keys(),
  ];
}

/**
 * THE ADAPTER CONTRACT CHECK (M4-P3 criterion 3): a requirement naming a
 * field that does not exist is a DEFECT IN THE ADAPTER, refused when the
 * adapter is taken up and before anything is created.
 *
 * IT IS A DIFFERENT QUESTION FROM `checkAdapterRequirements` BELOW, AND THE
 * ORDER IS LOAD-BEARING. The presence test there answers "is this field
 * absent", and an unknown key is absent too, so a single check written that
 * way would answer a defect in the adapter with a message about a missing
 * flag: an operator would go looking for a `--modelName` that the kernel has
 * no field for and could never accept. Running this one FIRST is what keeps
 * the two answers distinct, and `test/spawn.test.ts` asserts that they say
 * structurally different things rather than merely both refusing.
 */
export function checkAdapterContract(
  adapter: ExecutorAdapter,
): { ok: true } | { ok: false; reason: string } {
  const known = requirableRequestFields();
  // THE DECLARATION IS FOREIGN INPUT, not a value this module produced. From
  // M4-P4 an adapter is resolved from the fleet home, so `requires` arrives
  // from a module the kernel did not write and the TYPE IS A PROMISE, not a
  // guarantee. A missing or non-array declaration reaching `.filter` would be
  // a TypeError raised out of `spawnTask` with no reason line, which is the
  // same "refusal that arrives as a crash" shape the rest of this check
  // exists to prevent, one level lower.
  if (!Array.isArray(adapter.requires)) {
    return {
      ok: false,
      reason:
        `the ${adapter.name} adapter does not declare requires as an array, so the ` +
        `kernel cannot tell what it needs; an adapter that needs nothing declares []`,
    };
  }
  const unknown = adapter.requires.filter((name) => !known.includes(name));
  if (unknown.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `the ${adapter.name} adapter declares a requirement on ${unknown.join(", ")}, ` +
      `which the executor request contract has no field for; the requirable ` +
      `fields are ${known.join(", ")}`,
  };
}

/**
 * THE DECLARED-REQUIREMENT CHECK (M4-P3 criterion 2): a field the adapter
 * declared it needs, and the spawn was not given, is a USAGE ERROR, and a
 * usage error creates nothing.
 *
 * THE DANGEROUS STATE THIS EXISTS FOR is not "an adapter gets undefined". It
 * is an adapter DISCOVERING that it got undefined, and raising, after pool
 * create has already made a worktree, a branch and a pool record. That is the
 * measured `--deadline` defect at src/commands/spawn.ts:81 with a new field:
 * a value the kernel could not represent used to raise inside the adapter,
 * after the creation, and the repair was to refuse at parse time. This is the
 * same repair one field along, and it is the reason the check runs at the top
 * of `spawnTask` rather than beside the launch where the request is built.
 */
export function checkAdapterRequirements(
  adapter: ExecutorAdapter,
  options: SpawnOptions,
): { ok: true } | { ok: false; reason: string } {
  const presence = requestFieldPresence(options);
  const unmet = adapter.requires.filter((name) => presence.get(name) !== true);
  if (unmet.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `the ${adapter.name} adapter requires ${unmet.join(", ")}, and this spawn ` +
      `supplied no value for ${unmet.length === 1 ? "it" : "them"}; nothing was created`,
  };
}

/**
 * THE CREDENTIAL POLICY CHECK (M4-P8 steps 2, 3 and 5), and it runs before
 * ANYTHING is resolved, loaded or created.
 *
 * Three refusals, in this order, and the order is the fail-closed one:
 *
 *   1. an absent or unrecognised `payloadClass`. Checked first so that
 *      refusal 2 never has to reason about an unknown value: without this,
 *      `payloadClass !== "project"` would read an omission as permission.
 *   2. the declared escape hatch asked for on a PROJECT payload. This is
 *      the pairing the phase exists to refuse: `allowPrCredentials` hands
 *      the parent environment over UNCHANGED (see ExecutorRequest.env),
 *      credentials and all, and M2-P8 criterion 1 wrote it for the
 *      orchestrator's own spawns only. Until this phase the option was
 *      reachable from the library seam with nothing between it and a
 *      project payload.
 *   3. an extension entry the child must not carry, which is the same
 *      vocabulary check `buildChildEnv` makes, made EARLIER. The
 *      duplication is deliberate and is not two implementations: both call
 *      `refuseExtraAllowlist`. Making it here as well is what keeps a
 *      rejected widening from costing a worktree, a branch and a pool
 *      record, because `buildChildEnv` does not run until after pool
 *      create.
 *
 * It returns a reason rather than throwing, because every refusal on this
 * path must be able to say "nothing was created" in the same sentence.
 */
export function checkCredentialPolicy(
  options: SpawnOptions,
): { ok: true } | { ok: false; reason: string } {
  const declared: readonly PayloadClass[] = ["orchestrator", "project"];
  if (!declared.includes(options.payloadClass)) {
    return {
      ok: false,
      reason:
        `this spawn declares no payload class (payloadClass was ` +
        `${JSON.stringify(options.payloadClass)}); it is required and has no ` +
        `default, because an omitted class would otherwise take the ` +
        `orchestrator's authority by default: pass one of ` +
        `${declared.join(", ")}; nothing was created`,
    };
  }
  if (options.allowPrCredentials === true && options.payloadClass === "project") {
    return {
      ok: false,
      reason:
        `allowPrCredentials is the declared escape hatch from the credential ` +
        `scrub and hands the parent environment over unchanged, so it may not ` +
        `be combined with payloadClass "project": a project payload never ` +
        `receives the orchestrator's credentials; nothing was created`,
    };
  }
  // `reason-required`: THIS is the audited route (DR-0039 condition 2, M4-P8
  // criterion 4), and the argument is passed explicitly rather than
  // defaulted, because a default would be the same "absent takes the
  // permissive arm" shape CR-B-002 is.
  const extensionRefusal = refuseExtraAllowlist(
    options.extraAllowlist ?? [],
    "reason-required",
  );
  if (extensionRefusal !== undefined) {
    return { ok: false, reason: `${extensionRefusal}; nothing was created` };
  }
  return { ok: true };
}

/**
 * Pointer evidence: what the five credential-store redirections actually
 * were where the payload ran, and where that observation came from.
 */
export interface RedirectionEvidence {
  source: "turn-end-record" | "adapter";
  /** Observed value per name; `null` for a name that was unset. */
  values: Readonly<Record<string, string | null>>;
}

/**
 * Render `redirectionSource` into the refusal sentence. It names the ARTIFACT
 * the values were read from, never a party that observed them: the turn-end
 * record is adapter-reachable (src/hooks.ts), so a phrase like "observed
 * child-side", which is what this said until the DR-0047 sweep fix round,
 * asserts more than the kernel checked (CR-F-CRED-001).
 */
function redirectionSourcePhrase(
  source: CredentialHandoverRecord["redirectionSource"],
): string {
  if (source === "turn-end-record") {
    return "read from the turn-end record, which the kernel generates the hook for and an adapter can also write";
  }
  if (source === "adapter") {
    return "read from the adapter's own launch report";
  }
  return "read from no pointer evidence at all";
}

/**
 * COMPARE THE HANDOVER (M4-P8 criterion 6, repaired for CR-B-001).
 *
 * `handed` is what the kernel built and passed, `reported` is the name set
 * the adapter says it launched with, `pointers` is what the five
 * CREDENTIAL_STORE_REDIRECTIONS actually were where the payload ran.
 *
 * TWO PROPERTIES, AND THE STATUS SAYS WHICH WERE CHECKED. The name-set
 * comparison alone used to be written down as `compared`, which an operator
 * reads as "the handover was verified"; an adapter that keeps the name set
 * byte-identical and puts `HOME` and `XDG_CONFIG_HOME` back to their real
 * paths defeats the M2R-004 defense entirely and was recorded as clean. See
 * `CredentialHandoverRecord` for the five status values and for why the
 * VALUES are still never written into the record.
 *
 * The pointer comparison is by value and the values are DISCARDED: only the
 * names that differ survive into `changedRedirections`. A name the kernel
 * never handed over is not compared, because there is no handed value to
 * compare it against, and the name-set arms are what speak to that case.
 */
export function compareHandover(
  handed: Record<string, string> | undefined,
  reported: readonly string[] | undefined,
  pointers?: RedirectionEvidence,
): CredentialHandoverRecord {
  if (handed === undefined) {
    return {
      status: "not-applicable",
      added: [],
      removed: [],
      changedRedirections: [],
    };
  }
  const changedRedirections =
    pointers === undefined
      ? []
      : CREDENTIAL_STORE_REDIRECTIONS.map((redirection) => redirection.name)
          .filter((name) => {
            const handedValue = handed[name];
            if (handedValue === undefined) {
              return false;
            }
            return pointers.values[name] !== handedValue;
          })
          .sort();
  const pointerPart =
    pointers === undefined ? {} : { redirectionSource: pointers.source };
  if (reported === undefined) {
    return {
      status: pointers === undefined ? "unreported" : "pointers-compared",
      added: [],
      removed: [],
      changedRedirections,
      ...pointerPart,
    };
  }
  const handedNames = new Set(Object.keys(handed));
  const reportedNames = new Set(reported);
  return {
    status: pointers === undefined ? "names-compared" : "compared",
    added: [...reportedNames].filter((name) => !handedNames.has(name)).sort(),
    removed: [...handedNames].filter((name) => !reportedNames.has(name)).sort(),
    changedRedirections,
    ...pointerPart,
  };
}

/**
 * Launch outcomes. The distinction between a payload that never started
 * and one that did is load-bearing: only the first authorizes rollback.
 */
export type LaunchOutcome =
  | {
      kind: "completed";
      exitCode: number;
      /**
       * THE NAMES THE ADAPTER REPORTS IT ACTUALLY LAUNCHED WITH (M4-P8
       * criterion 6). Optional, and the optionality is honest rather than
       * lenient: an adapter written before this phase reports nothing, and
       * a kernel that refused every silent adapter would be refusing on an
       * absence of evidence. What the kernel DOES refuse is a reported set
       * that DIFFERS from the one it handed over, which is the adapter
       * saying, in its own record, that it widened the environment.
       *
       * It is NOT on `ExecutorRecord`: that document has a shipped schema
       * with `additionalProperties: false`, and this value is a report to
       * the kernel rather than a durable launch fact for an operator.
       *
       * A DISHONEST ADAPTER IS NOT CAUGHT HERE, and nothing in this field
       * pretends otherwise: an adapter that widens `env` and reports the
       * kernel's set is caught by the child-written probe instead, which
       * is why criterion 5 asserts on a file the CHILD wrote.
       */
      launchedEnvNames?: readonly string[];
      /**
       * THE FIVE CREDENTIAL-STORE POINTERS AS THE ADAPTER LAUNCHED THEM
       * (CR-B-001). Optional for the same honest reason `launchedEnvNames`
       * is, and WEAKER than the kernel's own evidence: it is the adapter's
       * word about its own behaviour. The kernel prefers the turn-end record
       * the generated hook normally writes and falls back to this, and the
       * record says which ARTIFACT it read (`redirectionSource`). That is a
       * weaker claim than which PARTY observed the values, and it used to be
       * spelled as the stronger one; see CredentialHandoverRecord in
       * src/task.ts for the measurement that changed the word.
       */
      launchedRedirections?: Readonly<Record<string, string | null>>;
    }
  | { kind: "launch-failed"; reason: string }
  | {
      kind: "incomplete";
      reason: string;
      /**
       * WHAT AN ADAPTER THAT COULD NOT CONFIRM COMPLETION STILL LAUNCHED
       * WITH (CR-B-003). The payload RAN on this arm, so the handover is a
       * real question here and the kernel now asks it; before this round the
       * comparison sat after the `incomplete` return and `meta.json` carried
       * no `handover` key at all, so a widening on this arm was recorded
       * nowhere. Optional for the same reason as on the `completed` arm.
       */
      launchedEnvNames?: readonly string[];
      launchedRedirections?: Readonly<Record<string, string | null>>;
    };

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
   * WHAT THIS ADAPTER CANNOT LAUNCH WITHOUT (M4-P3 criteria 2 and 3).
   *
   * Every name is a field of `ExecutorRequest`. The kernel cannot know what
   * a given adapter needs, so the adapter DECLARES it and the kernel refuses
   * BEFORE it creates anything, rather than handing over an `undefined` that
   * the adapter discovers once a worktree, a branch and a pool record exist.
   *
   * REQUIRED, never optional: an optional declaration would let an adapter
   * omit it and get the old behaviour back silently, which is the thing this
   * field exists to stop. An adapter that needs nothing declares `[]`, and
   * that is a statement rather than a default.
   */
  readonly requires: readonly string[];
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
  /**
   * WHAT WAS REQUESTED, NOT WHAT WAS RESOLVED (M4-P3 criterion 6).
   *
   * The declared tier the request carried, copied verbatim. Optional in the
   * same sense `deadline` is: present exactly when the request carried one,
   * absent otherwise, never the string "undefined".
   *
   * THERE IS NO RESOLVED MODEL HERE, and the absence is a decision rather
   * than an omission. This record is written BEFORE the payload starts,
   * which is the whole basis of the launch-failed-versus-incomplete
   * distinction, while a harness that requests one model and is served
   * another resolves mid-turn. A resolved model in a launch record would
   * therefore be a value nobody could have observed at the moment it was
   * written. M4-P7 carries the resolved half, at turn end, where it can be
   * true.
   */
  requestedTier?: string;
  /** The role the request carried, copied verbatim. See `requestedTier`. */
  requestedRole?: string;
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
  /*
   * THE NAME IS THE CONSTANT, not a second copy of the string (M4-P4
   * criterion 5). The loader refuses a loaded adapter that claims this name,
   * and a refusal compared against a literal spelled out in another file is
   * a guard that goes quiet the day one of the two is edited.
   */
  name: BUILT_IN_ADAPTER_NAME,
  /*
   * NOTHING, and that is a statement rather than a default (M4-P3). This
   * adapter runs a command in a directory; it reads no brief, plays no role
   * and asks for no tier, so declaring anything here would be a requirement
   * the adapter does not have. The empty declaration is what makes the
   * refusal path exercisable ONLY by an adapter that genuinely needs
   * something, which is the state the check exists for.
   */
  requires: [],
  async launch(request: ExecutorRequest): Promise<LaunchOutcome> {
    const launchedAt = new Date();
    const record: ExecutorRecord = {
      adapter: BUILT_IN_ADAPTER_NAME,
      launchedAt: launchedAt.toISOString(),
    };
    if (request.deadlineSeconds !== undefined) {
      record.deadline = new Date(
        launchedAt.getTime() + request.deadlineSeconds * 1000,
      ).toISOString();
    }
    // VERBATIM (M4-P3 criterion 6): the value the caller supplied, byte for
    // byte, with no normalisation, no lowercasing and no vocabulary check.
    // The kernel holds no tier vocabulary and no role vocabulary, so there is
    // nothing here it could legitimately validate against; a kernel that
    // "tidied" either value would be holding one.
    if (request.declaredTier !== undefined) {
      record.requestedTier = request.declaredTier;
    }
    if (request.role !== undefined) {
      record.requestedRole = request.role;
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
    // WHAT THIS ADAPTER ACTUALLY LAUNCHED WITH (M4-P8 criterion 6), read
    // off `request.env` at the point of report rather than recomputed from
    // the option object: the two spawnSync calls above spread that same
    // value, so a mutation between the handover and the launch shows up
    // here. Sorted so the comparison is over a set, not an insertion order.
    return {
      kind: "completed",
      exitCode,
      ...(request.env === undefined
        ? {}
        : {
            launchedEnvNames: Object.keys(request.env).sort(),
            // The five pointers as this adapter launched them, read off the
            // same `request.env` the two spawnSync calls above spread
            // (CR-B-001). The kernel treats this as the WEAKER of its two
            // pointer sources and prefers the turn-end hook's child-written
            // observation; reporting it anyway means an adapter that cannot
            // run the hook still has something to be compared against.
            launchedRedirections: Object.fromEntries(
              CREDENTIAL_STORE_REDIRECTIONS.map((redirection) => [
                redirection.name,
                request.env?.[redirection.name] ?? null,
              ]),
            ),
          }),
    };
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
):
  | { ok: true; observed?: Readonly<Record<string, string | null>> }
  | { ok: false; reason: string } {
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
  const candidate = parsed as { endedAt?: unknown; exitCode?: unknown; env?: unknown };
  if (typeof candidate.endedAt !== "string" || !Number.isInteger(candidate.exitCode)) {
    return {
      ok: false,
      reason:
        `the turn-end record ${path} does not parse as a turn-end record ` +
        `(it needs a string endedAt and an integer exitCode)`,
    };
  }
  // THE CHILD-WRITTEN POINTER OBSERVATION (CR-B-001). Absent on a record
  // written by an older hook, and the ABSENCE IS NOT A PASS: the caller turns
  // it into a weaker status word (`names-compared`) rather than into silence,
  // which is the whole lesson of the finding one file over. A malformed or
  // partially-typed `env` is read entry by entry and anything that is neither
  // a string nor null is dropped, so a hostile record cannot smuggle an
  // object into the comparison.
  let observed: Record<string, string | null> | undefined;
  if (typeof candidate.env === "object" && candidate.env !== null) {
    observed = {};
    for (const [name, value] of Object.entries(candidate.env as Record<string, unknown>)) {
      if (typeof value === "string" || value === null) {
        observed[name] = value;
      }
    }
  }
  return observed === undefined ? { ok: true } : { ok: true, observed };
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
  /**
   * WHOSE AUTHORITY THIS PAYLOAD RUNS UNDER (M4-P8 step 2). REQUIRED, and
   * there is NO DEFAULT anywhere on this path, in the type or at runtime.
   *
   * A default would be the whole defect: `allowPrCredentials` is reachable
   * from the library seam, which is where the plugin sits, and the pairing
   * this field exists to refuse is the escape hatch on a project payload.
   * If omission meant "orchestrator", a caller would acquire the
   * orchestrator's authority by leaving a field out, which is the quietest
   * way there is to reach a credential. `spawnTask` therefore refuses an
   * absent or unrecognised value before it creates or loads anything,
   * rather than trusting the type: TypeScript is a compile-time promise and
   * the consumer that matters here is a JavaScript plugin.
   */
  payloadClass: PayloadClass;
  /**
   * PER-INVOCATION ALLOWLIST EXTENSIONS, EACH WITH THE REASON IT WAS
   * GRANTED (M4-P8 step 3). Absent means none, which is the measured
   * minimum for model authentication in the probed container
   * (delivery/verification/m4-prototype-probes.md:33).
   *
   * The reason is DATA and a blank one is refused, so a widening cannot be
   * granted without leaving behind something a later reader can check; the
   * granted set is copied into meta.json verbatim. The kernel refuses any
   * entry naming a variable in the walked gh-token or dangerous vocabulary,
   * so this field cannot be used to re-admit a credential.
   */
  extraAllowlist?: readonly ChildEnvExtension[];
  /**
   * The three caller-supplied request fields (M4-P3 criterion 1, M4-D-05).
   * Each is `string | undefined` because nothing in the kernel produces one;
   * `briefPath` is not here because `assembleBrief` does produce it.
   */
  role: string | undefined;
  declaredTier: string | undefined;
  phaseId: string | undefined;
  /**
   * AN ADAPTER OBJECT SUPPLIED DIRECTLY, which only the kernel's own tests
   * do. It outranks `adapterSpecifier` because it is not a request to
   * resolve anything: there is nothing to root, nothing to load, and no
   * trust boundary to cross.
   */
  adapter?: ExecutorAdapter;
  /**
   * THE `--adapter` SPECIFIER, verbatim as the operator typed it (M4-P4
   * criterion 1). `undefined` means the flag was absent, which is NOT the
   * same as an empty one: an absent flag falls through to the fleet home's
   * declared default and then to the built-in adapter, and each of those
   * three outcomes is named in the launch record rather than being silent
   * (criterion 6).
   *
   * The specifier is not resolved here. It is handed to `selectAdapter`,
   * which roots Node module resolution at the FLEET HOME and never at the
   * project clone; see src/adapters/load.ts for why that root is the whole
   * security property of this phase.
   */
  adapterSpecifier?: string;
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

  // THE CREDENTIAL POLICY IS CHECKED BEFORE THE ADAPTER IS EVEN RESOLVED
  // (M4-P8 step 5). Adapter selection reads the fleet home and may EVALUATE
  // a module the kernel did not write (M4-P4), so a spawn whose credential
  // shape is already refused must not get that far: the refusal creates
  // nothing, loads nothing and runs nothing.
  const credentials = checkCredentialPolicy(options);
  if (!credentials.ok) {
    return { ok: false, reason: credentials.reason };
  }

  // THE ADAPTER IS RESOLVED FIRST (M4-P3), earlier than it used to be, and
  // the move is the point rather than a tidy-up: both checks below must
  // refuse before ANYTHING is created, and until this phase the adapter was
  // not named until the launch call site, which is after pool create has made
  // a worktree, a branch and a pool record.
  //
  // M4-P4 PUTS THE LOAD IN THAT SAME WINDOW, and for the same reason one
  // level out. Resolving, evaluating and shape-checking a module the kernel
  // did not write are three more ways to discover that this spawn cannot
  // happen, and every one of them must happen while there is still nothing to
  // roll back: a malformed adapter found after pool create is criterion 4's
  // dangerous state, which is M4-P3's refusal-after-creation shape with a
  // different cause.
  //
  // A DIRECTLY SUPPLIED ADAPTER SHORT-CIRCUITS THE WHOLE SELECTION, including
  // the fleet-home read. The kernel's own tests hand an object across this
  // seam, and a test fleet that happened to declare a default would otherwise
  // silently change which adapter those tests exercised.
  let adapter: ExecutorAdapter;
  if (options.adapter !== undefined) {
    adapter = options.adapter;
  } else {
    const selection = await selectAdapter(fleet, options.adapterSpecifier);
    if (!selection.ok) {
      return { ok: false, reason: selection.reason };
    }
    adapter = selection.adapter ?? subprocessAdapter;
  }

  // A requirement naming a field the contract does not have is a defect in
  // the adapter, refused as the adapter is taken up (criterion 3). It runs
  // BEFORE the presence check because an unknown name is also an absent one,
  // and answering a contract defect with a message about a missing value
  // sends the operator looking for a flag that cannot exist.
  const contract = checkAdapterContract(adapter);
  if (!contract.ok) {
    return { ok: false, reason: contract.reason };
  }

  // A declared requirement the spawn cannot meet is a usage error, and a
  // usage error creates nothing (criterion 2).
  const requirements = checkAdapterRequirements(adapter, options);
  if (!requirements.ok) {
    return { ok: false, reason: requirements.reason };
  }

  const liveness = livenessGuard(fleet);
  if (!liveness.ok) {
    return { ok: false, reason: liveness.reason };
  }
  const holdership = checkHoldership(fleet);
  if (!holdership.ok) {
    return { ok: false, reason: holdership.reason };
  }

  /* THE CROSS-ENVIRONMENT HALF OF THE SAME GUARD (M4-P22 criterion 2), and
     it runs here rather than inside `checkHoldership` because the two answer
     different questions and one of them spawns git. `checkHoldership` above
     has ALREADY RETURNED OK in the state this refuses: the local lease is
     held by this environment, with TIPHYS_HOLDER_ID matching, while the
     shared register names another environment. That is precisely M4-P20's
     measured dangerous state, two clones of one fleet remote each holding a
     live lease, and the local check has no evidence of it because `state/`
     is gitignored so the lease artifact never travels (src/fleet.ts:29).

     IT IS BEFORE pool create, before the task directory, before the brief and
     before any executor, so the refusal creates nothing, which is the same
     ordering rule the adapter and id-reuse refusals above follow. A fleet
     with no declaration gets `off` before any subprocess is spawned. */
  const sharedGuard = guardSharedRegister(fleet.root, "spawn");
  if (sharedGuard.kind === "refused") {
    return { ok: false, reason: sharedGuard.reason };
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
  const briefPath = brief.value.value;
  createdFiles.push(briefPath);

  // THE CREDENTIAL DECISION, WRITTEN DOWN (M4-P8 step 6). The hazard this
  // phase names is a credential reaching a project payload with NO ARTIFACT
  // SAYING SO, so the record is written on every spawn, including the
  // boring one where nothing was widened and the scrub ran. The extensions
  // are copied verbatim, reason and all: a widening whose justification
  // exists only in the caller's source is not auditable from the task
  // directory an operator opens.
  const credentialRecord: TaskCredentialRecord = {
    payloadClass: options.payloadClass,
    scrubMode: options.allowPrCredentials === true ? "inherited" : "scrubbed",
    // BUILT THROUGH THE ACCESSORS (CR-B-002, the record half). Reading
    // `entry.name` directly produced the literal record `{}` for a
    // bare-string entry, so meta.json said a widening happened and not WHICH
    // name was widened. `extensionReason` returning undefined is recorded as
    // an ABSENT key rather than defaulted to "", because a blank reason and a
    // missing one are different facts and the audited route refuses both.
    extensions: (options.extraAllowlist ?? []).map((entry) => {
      const reason = extensionReason(entry);
      return {
        name: extensionName(entry),
        ...(typeof reason === "string" ? { reason } : {}),
      };
    }),
  };

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
    credentials: credentialRecord,
  };
  const wroteMeta = runStep(`writing ${metaPath(fleet, taskId)}`, () => {
    writeTaskMeta(fleet, meta);
  });
  if (!wroteMeta.ok) {
    return rollback(wroteMeta.reason);
  }
  createdFiles.push(metaPath(fleet, taskId));

  // THE HOOK RECORDS THE FIVE POINTERS FROM INSIDE THE CHILD (CR-B-001).
  // Passed on every spawn, including under the declared escape hatch, where
  // the kernel handed no environment over and so compares nothing: a hook
  // whose shape depended on the escape hatch would be one more thing that
  // differs between the two arms, and T-009's lesson is that the arm nobody
  // witnesses is the one that breaks.
  const hook = runStep(`writing the turn-end hook for task ${taskId}`, () =>
    writeTurnEndHook(
      fleet,
      taskId,
      CREDENTIAL_STORE_REDIRECTIONS.map((redirection) => redirection.name),
    ),
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
      () =>
        buildChildEnv({
          parentEnv: process.env,
          scrubDir: scrubRoot(dir),
          // M4-P8 step 3: the per-invocation extension finally has a way to
          // reach this call. Before this phase `extraAllowlist` existed as
          // data and NOTHING passed one, so the field was unreachable from
          // every production path.
          extraAllowlist: options.extraAllowlist ?? [],
        }),
    );
    if (!built.ok) {
      return rollback(built.reason);
    }
    if (!built.value.ok) {
      return rollback(built.value.reason);
    }
    childEnv = built.value.env;
  }

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
        // THE BRIEF THE ADAPTER LAUNCHES AGAINST (M4-P3 criterion 1). The
        // path `assembleBrief` returned, which is already on `createdFiles`
        // and so is already inside the rollback window.
        briefPath,
        role: options.role,
        declaredTier: options.declaredTier,
        phaseId: options.phaseId,
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
  // FROM HERE THE PAYLOAD HAS RUN, ON BOTH REMAINING ARMS (CR-B-003).
  //
  // `launch-failed` returned above and is the only arm where nothing ran.
  // `completed` and `incomplete` both mean a child was launched with an
  // environment, so "which environment did it actually get" is a real
  // question on both, and until this round it was asked on neither the
  // `incomplete` arm nor the arm where the completion precondition fails:
  // the comparison sat below all three returns and `meta.json` carried no
  // `handover` key at all. A widening on those arms was recorded NOWHERE
  // while the same widening on the `completed` arm was recorded and refused.
  // So the comparison moves up to here, ahead of every arm-specific return,
  // and `meta.json` is rewritten before any of them.
  //
  // The turn-end record is read first because it carries the child-written
  // pointer observation, and it is read on the `incomplete` arm too: an
  // adapter that reports incomplete because the HOOK failed leaves no record
  // and the read simply finds nothing, which is a weaker status word and not
  // a pass.
  const evidence = turnEndEvidence(fleet, taskId);
  const pointers: RedirectionEvidence | undefined = (() => {
    if (childEnv === undefined) {
      return undefined;
    }
    if (evidence.ok && evidence.observed !== undefined) {
      return { source: "turn-end-record", values: evidence.observed };
    }
    if (outcome.launchedRedirections !== undefined) {
      return { source: "adapter", values: outcome.launchedRedirections };
    }
    return undefined;
  })();

  // THE HANDOVER CHECK (M4-P8 criterion 6, repaired by CR-B-001).
  // src/spawn.ts's request contract has always FORBIDDEN an adapter widening
  // `env` on its own, in prose, and nothing checked it. The adapter reports
  // the name set it launched with and the kernel compares it; SINCE THIS
  // ROUND the kernel also compares the five credential-store pointers, which
  // is the half a name-set comparison structurally cannot see, because the
  // M2R-004 defense works by redirecting those names rather than by dropping
  // them.
  //
  // IT RUNS AFTER THE PAYLOAD HAS RUN, so it never rolls anything back: the
  // worktree may hold real work by now (the V-1 rule), and the refusal's
  // job is to make the widening impossible to miss, not to destroy
  // evidence of it. The comparison is recorded in meta.json whichever way
  // it goes, so a clean handover is an artifact too.
  const handover = compareHandover(childEnv, outcome.launchedEnvNames, pointers);
  credentialRecord.handover = handover;
  const widened =
    handover.added.length > 0 ||
    handover.removed.length > 0 ||
    handover.changedRedirections.length > 0;
  if (widened) {
    credentialRecord.refusal =
      `the ${adapter.name} adapter launched with an environment that differs ` +
      `from the one the kernel handed it` +
      (handover.added.length === 0 ? "" : `; added ${handover.added.join(", ")}`) +
      (handover.removed.length === 0 ? "" : `; removed ${handover.removed.join(", ")}`) +
      (handover.changedRedirections.length === 0
        ? ""
        : `; the credential-store pointer(s) ` +
          `${handover.changedRedirections.join(", ")} did not have the ` +
          `harness-owned value the kernel handed over, ` +
          `${redirectionSourcePhrase(handover.redirectionSource)}`);
  }
  const rewroteMeta = runStep(`updating ${metaPath(fleet, taskId)}`, () => {
    writeTaskMeta(fleet, meta);
  });
  if (!rewroteMeta.ok) {
    // The payload ran, so nothing is rolled back here either; the record
    // simply could not be completed and says so rather than being silently
    // left at its pre-launch contents.
    return {
      ok: false,
      reason:
        `the payload ran (the ${adapter.name} adapter reported ${outcome.kind}) ` +
        `but the credential record could not be completed ` +
        `(${rewroteMeta.reason}); the worktree ${worktree}, its task directory ` +
        `and the pool record are left in place`,
    };
  }

  if (outcome.kind === "incomplete") {
    // The payload ran, so nothing is rolled back, and the reason says so.
    // The scrub root is deliberately LEFT in place here: the hook child
    // failed, and whatever the children left under the redirected paths
    // is part of the state an operator inspects. The handover verdict is
    // now part of the reason as well as of the record, because this arm's
    // reason is the only thing many callers read.
    return {
      ok: false,
      reason: widened
        ? `${outcome.reason}; and ${credentialRecord.refusal ?? ""}, recorded in ` +
          `${metaPath(fleet, taskId)}`
        : outcome.reason,
    };
  }
  // THE COMPLETION PRECONDITION (M4-P2 step 5). The only arm left is
  // `completed`, and it is the only arm that DESTROYS something (the
  // scrub root, which is a live child's redirected HOME while that child
  // lives). Before M4-P2 the destruction was safe because `launch` was
  // synchronous and the sole adapter wrote the turn-end record itself; an
  // async `launch` lets any adapter resolve `completed` early, so the
  // kernel checks the payload's own artifact instead of believing the
  // report. See turnEndEvidence above for the four refusals.
  //
  // THE READ ITSELF MOVED UP (CR-B-003): `evidence` is computed before the
  // handover comparison, because the turn-end record is where the child's
  // own pointer observation lives. Only the REFUSAL is here, so this arm
  // still refuses exactly what it refused, and it now does so with the
  // handover already written down.
  if (!evidence.ok) {
    // The scrub root is named only when there IS one. Under the declared
    // escape hatch childEnv is undefined and nothing was ever staged under
    // scrubRoot(dir), so naming it would enumerate a path that does not
    // exist, in the one message an operator uses to find the residue.
    const residue =
      childEnv === undefined
        ? `the worktree ${worktree}, its task directory and the pool record are all`
        : `the worktree ${worktree}, its task directory, the pool record and the ` +
          `harness-owned redirect targets under ${scrubRoot(dir)} are all`;
    return {
      ok: false,
      reason:
        `the ${adapter.name} adapter reported the payload completed with exit code ` +
        `${String(outcome.exitCode)}, but ${evidence.reason}, so the kernel does not ` +
        `accept that the payload ended; nothing was rolled back and nothing was ` +
        `removed: ${residue} left in place for inspection; when you have inspected ` +
        `them, close the task with "tiphys teardown --task ${taskId}"` +
        // THE WIDENING IS NAMED ON THIS ARM TOO (CR-B-003). The record already
        // carries it, and this reason is the only thing many callers read, so
        // leaving it out here would make the arm's refusal say less than the
        // artifact beside it.
        (widened
          ? `; and ${credentialRecord.refusal ?? ""}, recorded in ${metaPath(fleet, taskId)}`
          : ""),
    };
  }

  if (widened) {
    return {
      ok: false,
      reason:
        `${credentialRecord.refusal ?? ""}; an adapter never widens the child ` +
        `environment it was given (see ExecutorRequest.env), and the difference ` +
        `is recorded in ${metaPath(fleet, taskId)}; nothing was rolled back ` +
        `because the payload had already run`,
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
