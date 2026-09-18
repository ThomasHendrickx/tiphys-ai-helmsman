import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GH_TOKEN_VARIABLES, isDangerousEnvName } from "../gates/credentials.ts";
import { refuseOpenForWrite, runStep } from "../task.ts";

/**
 * CHILD-ENVIRONMENT CONSTRUCTION (kernel plan M2, M2-P8 steps 2 and 3).
 *
 * Every child the executor launches (the payload and the turn-end hook)
 * receives an environment BUILT here, never inherited. The build is an
 * ALLOWLIST (M2-D-13): a variable crosses into the child only when its
 * exact name is in the list below or in the caller's per-invocation
 * extension. There is no denylist anywhere in this module, because a
 * denylist is a union of the credential names known on the day it was
 * written and grows stale silently; an allowlist fails in the safe
 * direction (a missing variable is a visible breakage, a leaked one is
 * not).
 *
 * REDIRECT, NEVER DROP, THE CREDENTIAL-STORE POINTERS (M2R-004 edit 1).
 * `HOME`, `XDG_CONFIG_HOME`, `GH_CONFIG_DIR`, `GIT_CONFIG_GLOBAL` and
 * `GIT_CONFIG_SYSTEM` are not simply excluded from the allowlist; they are
 * SET to harness-owned empty paths inside the task directory. Dropping any
 * of them is FORBIDDEN, and this comment is the record of why:
 *
 *   - A dropped `HOME` does not remove the home directory; the child's
 *     tools fall back to the real one (or to `/root`), so gh resolves
 *     `$HOME/.config/gh/hosts.yml`, git resolves `~/.gitconfig`,
 *     `~/.netrc` and `~/.git-credentials`, and every default credential
 *     path RETURNS. An environment-only scrub that drops pointers leaves
 *     the credential stores in place, which is exactly finding M2R-004.
 *   - A dropped `GIT_CONFIG_GLOBAL` additionally hands the child the
 *     user's real global git configuration, undoing the EXT-F-02
 *     discipline (v1 M1-P2 criterion 7): the kernel never reads and never
 *     writes user or global git config, and commit identity crosses as
 *     command-scoped GIT_AUTHOR_* / GIT_COMMITTER_* variables only.
 *
 * THE ALLOWLIST IS DATA, NOT A LITERAL INSIDE A SPAWN CALL (step 9). It is
 * exported and `buildChildEnv` takes a per-invocation `extraAllowlist`, so
 * a future caller (the M4-era release-verification wiring designed in
 * delivery/verification/release-verification-interface.md section 6.1)
 * can extend it per invocation and per adapter without touching this
 * module. Nothing in this module knows about release verification; that
 * is deliberate and this phase builds no such awareness.
 *
 * WHY THE THREE TIPHYS_EXIT_TEST_* NAMES ARE HERE. The delivered payload
 * contract (scripts/stub-payload.sh, its documented environment contract)
 * is the one place variables cross the spawn boundary into a payload
 * today, and it names exactly these three. They are listed as exact names
 * rather than as a TIPHYS_* prefix on purpose: a prefix rule would carry
 * ANY variable that happens to start with TIPHYS_, which is a denylist's
 * failure mode wearing an allowlist's name (and is what acceptance
 * criterion 2's TIPHYS_UNRELATED_SECRET witness refutes).
 */

/**
 * The default allowlist. Exact names only; no prefixes, no patterns.
 * Append here only with a recorded reason, and never a credential-capable
 * name. This allowlist is the REAL defense: a name crosses only if it is
 * here (or in a per-invocation extension), so nothing outside it appears
 * in a child by construction. `credential-scrub` (src/gates/credentials.ts)
 * adds a bounded, allowlist-INDEPENDENT tripwire on top: it reddens if a
 * gh-documented token variable OR a git/ssh/node credential- or
 * code-execution-capable variable (its documented vocabulary) is present
 * in the constructed child, even if some future edit wrongly adds one
 * here. That tripwire is a bounded denylist and cannot enumerate every
 * dangerous name; it makes a widened allowlist cost a red for the names it
 * knows, it does not replace this allowlist.
 */
export const DEFAULT_CHILD_ENV_ALLOWLIST: readonly string[] = [
  // Program resolution and scratch space.
  "PATH",
  "TMPDIR",
  // Locale, so a child's tool output is not re-localised mid-suite.
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_COLLATE",
  "LC_CTYPE",
  "LC_MESSAGES",
  "LC_MONETARY",
  "LC_NUMERIC",
  "LC_TIME",
  // The payload contract of the exit-test harness (see module comment).
  "TIPHYS_EXIT_TEST_MODE",
  "TIPHYS_EXIT_TEST_TASK",
  "TIPHYS_EXIT_TEST_REPORT",
  // Command-scoped git identity (EXT-F-02 option B): the ONLY sanctioned
  // way identity reaches a child, and never a credential.
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_AUTHOR_DATE",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "GIT_COMMITTER_DATE",
];

/**
 * ONE PER-INVOCATION ALLOWLIST EXTENSION, AND THE REASON IT WAS GRANTED
 * (M4-P8 step 3). The reason is DATA, not a comment beside the call site:
 * a widening whose justification lives in a source comment is invisible to
 * the record a later reader opens, and "an extension with no recorded
 * reason" is one of this phase's declared hazard items. An empty reason is
 * therefore a REFUSAL and never a permitted shorthand.
 */
export interface ChildEnvExtension {
  /** Exact variable name, same semantics as a default-allowlist entry. */
  name: string;
  /** Why this invocation may carry it. Non-empty; blank is refused. */
  reason: string;
}

/**
 * What an extension entry may be written as.
 *
 * THE BARE STRING IS THE PRE-M4-P8 FORM AND IT IS KEPT DELIBERATELY. The
 * field has existed since M2-P8 as `readonly string[]` and the kernel's own
 * tests model a widened allowlist with it (test/credentials-gate.test.ts).
 * A string carries NO reason, so it cannot carry the audit half; both forms
 * are refused identically for a dangerous NAME, which is the safety half.
 *
 * THE SENTENCE THAT USED TO STAND HERE WAS FALSE AND IS WITHDRAWN. It said a
 * bare string "cannot satisfy the audited route: the route's entry point is
 * `SpawnOptions.extraAllowlist`, which is typed `ChildEnvExtension[]` and
 * cannot express one", and delivery/work-history/m4-p8.md item 8 repeated it.
 * That is a COMPILE-TIME argument about a RUNTIME seam, and the same phase
 * rejected exactly that argument one field over: test/payload-credentials.ts
 * records that "the consumer that reaches this seam is a JavaScript plugin,
 * and a missing field there is `undefined`, not a compile error". A clean-room
 * review reproduced both a bare string and `{name}` with no `reason` crossing
 * into a project payload through `spawnTask` (CR-B-002, HIGH), and this round
 * re-reproduced both before changing anything. A type is not a guard at a seam
 * a plugin reaches, and `refuseExtraAllowlist` with `reason-required` is the
 * guard.
 */
export type ChildEnvExtensionEntry = string | ChildEnvExtension;

/** The variable name an entry names, whichever form it is written in. */
export function extensionName(entry: ChildEnvExtensionEntry): string {
  return typeof entry === "string" ? entry : entry.name;
}

/** The recorded reason, or undefined for the bare-string form. */
export function extensionReason(
  entry: ChildEnvExtensionEntry,
): string | undefined {
  return typeof entry === "string" ? undefined : entry.reason;
}

/**
 * WHETHER THIS CALLER DEMANDS A RECORDED REASON.
 *
 * NO DEFAULT, DELIBERATELY. A default here would be the very shape
 * CR-B-002 is: an omitted argument silently taking the permissive arm.
 * Every call site says which contract it is enforcing, and the two that
 * exist say different things for reasons written at each of them.
 */
export type ReasonRequirement = "reason-required" | "reason-optional";

/**
 * REFUSE AN EXTENSION THE CHILD MUST NOT CARRY (M4-P8 step 4, criteria 3
 * and 4).
 *
 * Until this phase `buildChildEnv` spread the extension into the copy loop
 * unconditionally, so an extension naming `GH_TOKEN` crossed into a child
 * and the `credential-scrub` gate stayed green, because that gate builds
 * its OWN environment with no extension and probes the CONSTRUCTION rather
 * than a real spawn. The allowlist is still the defense and it gains no
 * name here; what this adds is that WIDENING it per invocation is checked
 * against the same vocabulary the gate walks.
 *
 * ONE VOCABULARY, NOT TWO. `GH_TOKEN_VARIABLES` and `isDangerousEnvName`
 * are IMPORTED from src/gates/credentials.ts rather than copied here or
 * moved: plan step 4 offers move-or-re-export and requires the choice be
 * recorded, and duplicating the walked vocabulary would create two lists
 * that drift silently in the direction that matters. The import makes
 * src/exec/env.ts and src/gates/credentials.ts a cycle, which is this
 * repository's existing shape rather than a new one (thirteen cycles in
 * `src/` at this branch's merge base, one of them src/spawn.ts to
 * src/adapters/load.ts and back). The one rule the cycle imposes: NOTHING
 * in this module may read an imported binding at module-evaluation time,
 * only inside a function body, or the module loaded second hits the
 * temporal dead zone. `test/payload-credentials.test.ts` imports both
 * modules in both orders so that rule is checked rather than remembered.
 *
 * The two refusals are ORDERED name-first: a dangerous name is refused
 * whatever reason accompanies it, so a persuasive reason can never buy a
 * credential into a child.
 *
 * THE REASON CHECK IS WRITTEN AS A POSITIVE VALIDITY TEST, AND THAT IS THE
 * WHOLE OF FINDING CR-B-002 (clean-room-retro-B-criteria, HIGH).
 *
 * Until this round the guard read
 * `reason !== undefined && reason.trim().length === 0`, which fires only on
 * a PRESENT-but-blank reason. `extensionReason` returns `undefined` for a
 * bare string entry and for an object with no `reason` property, so the
 * first conjunct excused the absent case and the entry was ACCEPTED. The
 * mechanism is general: a refusal predicate whose condition requires the
 * value to be PRESENT leaves ABSENT unchecked, and the field this module's
 * own doc comment calls mandatory ("every entry carries an exact name and a
 * reason") is exactly the kind of field that reaches it as `undefined`.
 *
 * The repair is the spelling this repository already uses where it got this
 * right: compute a POSITIVE `usable` predicate (src/cutover.ts:140 is the
 * same shape, and `extensionName`'s `typeof name !== "string"` test two
 * refusals above is the same shape again), then decide what to do with
 * `!usable`. Absent, blank and non-string all reach `!usable` by different
 * routes and the refusal SAYS which one it was, because an operator reading
 * "carries no reason" about an entry that has one is looking for the wrong
 * thing.
 *
 * `reasonRequirement` is what the two call sites differ on, and neither is
 * a default:
 *
 *   reason-required   the AUDITED route (`checkCredentialPolicy` in
 *                     src/spawn.ts). DR-0039 condition 2 and M4-P8
 *                     criterion 4 are enforced here: an extension with no
 *                     usable reason is refused before anything is created.
 *   reason-optional   `buildChildEnv`, the pre-M4-P8 library seam, which
 *                     documents the bare-string form and whose own tests
 *                     model a widened allowlist with it. A blank reason is
 *                     still refused there; an ABSENT one is the documented
 *                     shorthand for "this caller records nothing", and the
 *                     caller that must not be allowed that shorthand does
 *                     not reach this module without passing through the
 *                     audited route first.
 */
export function refuseExtraAllowlist(
  entries: readonly ChildEnvExtensionEntry[],
  reasonRequirement: ReasonRequirement,
): string | undefined {
  for (const entry of entries) {
    const name = extensionName(entry);
    if (typeof name !== "string" || name.length === 0) {
      return (
        `an allowlist extension entry names no variable ` +
        `(${JSON.stringify(entry)}); every entry carries an exact name and a reason`
      );
    }
    if (GH_TOKEN_VARIABLES.includes(name)) {
      return (
        `the allowlist extension entry ${name} is a documented gh token variable ` +
        `and may never cross into a child environment; the default allowlist ` +
        `gains no credential name and neither may an extension`
      );
    }
    if (isDangerousEnvName(name)) {
      return (
        `the allowlist extension entry ${name} is in the walked credential- or ` +
        `code-execution-capable vocabulary (src/gates/credentials.ts) and may ` +
        `never cross into a child environment`
      );
    }
    const reason = extensionReason(entry);
    const usable = typeof reason === "string" && reason.trim().length > 0;
    if (!usable) {
      const shape =
        reason === undefined
          ? "no reason field at all"
          : typeof reason !== "string"
            ? `a reason that is not a string (${JSON.stringify(reason)})`
            : `a blank reason (${JSON.stringify(reason)})`;
      if (reasonRequirement === "reason-required" || reason !== undefined) {
        return (
          `the allowlist extension entry ${name} carries ${shape}; an extension ` +
          `is an audited widening and a reason that is absent, blank or not a ` +
          `string records nothing a later reader could check`
        );
      }
    }
  }
  return undefined;
}

/** One redirected credential-store pointer. */
export interface CredentialRedirection {
  /** The environment variable name. */
  name: string;
  /** Whether the harness-owned target is a directory or a file. */
  kind: "directory" | "file";
  /** Path of the target relative to the scrub root. */
  relativePath: string;
}

/**
 * The five pointers, redirected in this order. Each names a credential
 * store's location; see the module comment for why none may be dropped.
 */
export const CREDENTIAL_STORE_REDIRECTIONS: readonly CredentialRedirection[] = [
  { name: "HOME", kind: "directory", relativePath: "home" },
  { name: "XDG_CONFIG_HOME", kind: "directory", relativePath: "xdg-config" },
  { name: "GH_CONFIG_DIR", kind: "directory", relativePath: "gh-config" },
  { name: "GIT_CONFIG_GLOBAL", kind: "file", relativePath: "gitconfig-global" },
  { name: "GIT_CONFIG_SYSTEM", kind: "file", relativePath: "gitconfig-system" },
];

/** Directory name of the scrub root inside a task directory. */
export const SCRUB_DIR_NAME = "scrub-env";

/** Where spawn puts the harness-owned redirect targets for a task. */
export function scrubRoot(taskDir: string): string {
  return join(taskDir, SCRUB_DIR_NAME);
}

/**
 * Every variable name the constructed environment may contain: the
 * allowlist, the per-invocation extension, and the redirected pointers.
 */
export function permittedChildEnvNames(
  extraAllowlist: readonly ChildEnvExtensionEntry[] = [],
): Set<string> {
  return new Set([
    ...DEFAULT_CHILD_ENV_ALLOWLIST,
    ...extraAllowlist.map(extensionName),
    ...CREDENTIAL_STORE_REDIRECTIONS.map((redirection) => redirection.name),
    "GIT_CONFIG_NOSYSTEM",
  ]);
}

export interface ChildEnvSpec {
  /** The environment the values are copied FROM (usually process.env). */
  parentEnv: Record<string, string | undefined>;
  /**
   * Absolute path of the harness-owned scrub root. Created (with its five
   * redirect targets) by this call; must sit inside a directory this
   * invocation owns, which for spawn is the task directory.
   */
  scrubDir: string;
  /**
   * Per-invocation allowlist extension (step 9's only obligation to the
   * future). Exact names, same semantics as the default list.
   *
   * SINCE M4-P8 EVERY ENTRY IS CHECKED before anything is staged: see
   * `refuseExtraAllowlist` for the two refusals and for why the bare-string
   * form is still accepted here while the audited route cannot produce one.
   */
  extraAllowlist?: readonly ChildEnvExtensionEntry[];
}

export type ChildEnvResult =
  | { ok: true; env: Record<string, string> }
  | { ok: false; reason: string };

/**
 * Build the child environment: create the scrub root and its five EMPTY
 * redirect targets, copy the allowlisted names that are present in the
 * parent environment, then OVERRIDE the five pointers with the
 * harness-owned paths. The override runs last and unconditionally, so a
 * pointer that is also (wrongly) allowlisted still ends up redirected.
 *
 * EVERY redirect target is re-emptied on every build, directory and file
 * alike: a leftover store file from a prior same-taskId incarnation (a
 * .git-credentials or hosts.yml written into a directory target, or a
 * populated gitconfig-global file) must not survive a rebuild and smuggle
 * configuration into the next child (M2-P8 fix round 1, review finding O1).
 * File targets are rewritten empty; directory targets are removed and
 * recreated so they are empty too.
 *
 * A failure to stage any redirect target fails the whole construction:
 * an unredirected pointer would silently fall back to the default
 * credential path, so there is no partial success here (fail closed).
 */
export function buildChildEnv(spec: ChildEnvSpec): ChildEnvResult {
  // THE EXTENSION IS CHECKED FIRST, BEFORE ANY DIRECTORY IS MADE (M4-P8
  // criteria 3 and 4). A refusal that had already staged a scrub root would
  // leave the caller's rollback holding something this call created, and
  // the whole point of refusing here is that a rejected widening costs
  // nothing and changes nothing.
  // `reason-optional`, and the argument is passed rather than defaulted: see
  // `ReasonRequirement`. This seam predates M4-P8 and documents the
  // bare-string form; the audited route demands a reason one layer up, in
  // `checkCredentialPolicy`, before anything is created.
  const refusal = refuseExtraAllowlist(spec.extraAllowlist ?? [], "reason-optional");
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }

  const made = runStep(`creating the scrub root ${spec.scrubDir}`, () =>
    mkdirSync(spec.scrubDir, { recursive: true }),
  );
  if (!made.ok) {
    return { ok: false, reason: made.reason };
  }

  const env: Record<string, string> = {};
  const names = [
    ...DEFAULT_CHILD_ENV_ALLOWLIST,
    ...(spec.extraAllowlist ?? []).map(extensionName),
  ];
  for (const name of names) {
    const value = spec.parentEnv[name];
    if (value !== undefined) {
      env[name] = value;
    }
  }

  for (const redirection of CREDENTIAL_STORE_REDIRECTIONS) {
    const target = join(spec.scrubDir, redirection.relativePath);
    if (redirection.kind === "directory") {
      // Re-empty the directory target on every build (remove then
      // recreate), exactly as the file targets are rewritten empty below,
      // so a leftover store file from an earlier incarnation cannot
      // smuggle configuration in (review finding O1).
      const cleared = runStep(`re-emptying the redirect target ${target}`, () => {
        rmSync(target, { recursive: true, force: true });
        mkdirSync(target, { recursive: true });
      });
      if (!cleared.ok) {
        return { ok: false, reason: cleared.reason };
      }
    } else {
      // The file target is written EMPTY on every build, so a leftover
      // from an earlier incarnation cannot smuggle configuration in.
      const refusal = refuseOpenForWrite(target);
      if (refusal !== undefined) {
        return { ok: false, reason: refusal };
      }
      const written = runStep(`staging the empty redirect target ${target}`, () =>
        writeFileSync(target, ""),
      );
      if (!written.ok) {
        return { ok: false, reason: written.reason };
      }
    }
    env[redirection.name] = target;
  }
  // Apple Git reads a prefix system config in addition to GIT_CONFIG_SYSTEM.
  // This fixed kernel value is applied after copying and cannot be inherited.
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  return { ok: true, env };
}
