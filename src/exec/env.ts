import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
 * name: `credential-scrub` (src/gates/credentials.ts) probes the
 * constructed environment and treats the gh-documented token variables as
 * never-permitted regardless of this list.
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
  extraAllowlist: readonly string[] = [],
): Set<string> {
  return new Set([
    ...DEFAULT_CHILD_ENV_ALLOWLIST,
    ...extraAllowlist,
    ...CREDENTIAL_STORE_REDIRECTIONS.map((redirection) => redirection.name),
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
   */
  extraAllowlist?: readonly string[];
}

export type ChildEnvResult =
  | { ok: true; env: Record<string, string> }
  | { ok: false; reason: string };

/**
 * Build the child environment: create the scrub root and its five empty
 * redirect targets, copy the allowlisted names that are present in the
 * parent environment, then OVERRIDE the five pointers with the
 * harness-owned paths. The override runs last and unconditionally, so a
 * pointer that is also (wrongly) allowlisted still ends up redirected.
 *
 * A failure to stage any redirect target fails the whole construction:
 * an unredirected pointer would silently fall back to the default
 * credential path, so there is no partial success here (fail closed).
 */
export function buildChildEnv(spec: ChildEnvSpec): ChildEnvResult {
  const made = runStep(`creating the scrub root ${spec.scrubDir}`, () =>
    mkdirSync(spec.scrubDir, { recursive: true }),
  );
  if (!made.ok) {
    return { ok: false, reason: made.reason };
  }

  const env: Record<string, string> = {};
  const names = [
    ...DEFAULT_CHILD_ENV_ALLOWLIST,
    ...(spec.extraAllowlist ?? []),
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
      const created = runStep(`creating the redirect target ${target}`, () =>
        mkdirSync(target, { recursive: true }),
      );
      if (!created.ok) {
        return { ok: false, reason: created.reason };
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
  return { ok: true, env };
}
