import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, writeFileSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathsIdentifySameObject } from "../path-identity.ts";
import {
  buildChildEnv,
  permittedChildEnvNames,
} from "../exec/env.ts";
import {
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import {
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type { GateResult, GateStatus } from "./result.ts";

/**
 * THE CREDENTIAL GATES (kernel plan M2, M2-P8 step 6).
 *
 * Two registered entries, both invoked through the M2-P1 gate subprocess
 * contract (`node src/gates/credentials.ts <gate-id> --result <path>
 * --evidence <dir>`), each writing exactly one GateResult.
 *
 * `credential-scrub` (required, offline). Makes "implementers never create
 * PRs" PROBED rather than believed: it constructs a child environment with
 * the SAME `buildChildEnv` the executor uses (one mechanism, per T-005,
 * never a second implementation) and then probes, FROM INSIDE that
 * environment, every source a pull-request-capable credential could be
 * resolved from. `units` is the number of SOURCES PROBED, never the number
 * of variable names checked: under an allowlist no excluded name can
 * survive by construction, so a name count is a tautology that grows by
 * adding names and measures nothing (M2R-004).
 *
 * THE DERIVED DENYLIST TRIPWIRE IN THIS MODULE, AND WHY IT IS PERMITTED
 * HERE, AND EXACTLY WHAT IT DOES AND DOES NOT COVER.
 * The environment-source probe carries a bounded, allowlist-INDEPENDENT
 * tripwire: it reddens if a documented credential- or code-execution-
 * capable variable is present in the constructed child, even if some
 * future edit puts one on the allowlist in src/exec/env.ts. MECHANISMS.md's
 * row on denylists allows exactly this shape: "where a denylist is
 * unavoidable, DERIVE it by walking the consuming program's closed
 * documented vocabulary once, publishing the walk." The walk covers the
 * vocabularies of the programs a scrubbed child actually runs:
 *
 *   - gh: `gh help environment` documents the token variables as GH_TOKEN,
 *     GITHUB_TOKEN, GH_ENTERPRISE_TOKEN, GITHUB_ENTERPRISE_TOKEN
 *     (GH_TOKEN_VARIABLES).
 *   - git, ssh, node/loader/shell: the askpass, ssh-exec, proxy, config-
 *     injection and code-execution variables git-config(1), git(1),
 *     ssh(1), node(1) and bash(1) document (DANGEROUS_ENV_VOCABULARY;
 *     see that constant for the per-name source).
 *
 * WHY THIS IS A TRIPWIRE, NOT THE SCRUB. The scrub is the allowlist in
 * src/exec/env.ts: nothing outside it can appear in a child by
 * construction, so the allowlist is the real defense. This tripwire is a
 * BOUNDED denylist and cannot enumerate every dangerous name that any
 * program will ever read. What it buys is that "an allowlist widened by an
 * implementer to turn a red gate green" (this phase's declared hazard)
 * costs a red for every name in the walked vocabulary, not just gh's four
 * tokens. A name outside the vocabulary that is also admitted to the
 * allowlist would pass the environment probe green; that residue is the
 * allowlist's responsibility, and this comment states it rather than
 * hiding it. This is also the check M2-P7 step 8 reserves for the M4-era
 * per-invocation extension ("the extension may never include a
 * pull-request-capable credential").
 *
 * THE ENV-INJECTION VECTOR IS BEHAVIORALLY PROBED, NOT JUST NAME-CHECKED.
 * git resolves a credential.helper injected via the GIT_CONFIG_COUNT /
 * GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n family (git-config(1)) at a scope
 * the --global and --system probes cannot see. So beyond the name
 * tripwire, source `git-resolved-config` asks git itself, with NO scope
 * flag, what credential.helper resolves from inside the child (env, then
 * global, then system, then any repo-local config of the child's working
 * directory). A resolvable helper from ANY source, including env
 * injection, reddens the gate.
 *
 * `credential-token` (conditional). When TIPHYS_IMPLEMENTER_TOKEN is
 * absent it reports `not-applicable` NAMING OWNER ACTION A-3, never green.
 * When the token is present it currently reports `error`, deliberately:
 * plan step 7 requires the probe's assertion to be DERIVED from captured
 * API responses for a real scoped implementer token and a real
 * orchestrator token, both of which owner action A-3 (DR-0004 item 4) has
 * not yet provisioned. Deriving the assertion from invented responses is
 * exactly the mechanism T-003 lesson 4 forbids, so until the captures
 * exist the gate FAILS CLOSED (M2-C-3: a check that cannot reach a
 * verdict is `error`). The live witness is deferred to the M2 exit test
 * (plan criterion 7, owner-blocked).
 */

const EX_USAGE = 64; // BSD sysexits, same value src/cli.ts exports.

/** What one source probe concluded. */
export interface SourceProbe {
  /** The credential source's stable name. */
  source: string;
  outcome: "clean" | "resolvable" | "error";
  detail: string;
}

/**
 * gh's documented token vocabulary (see the module comment for the walk).
 * Never permitted in a child environment, allowlisted or not.
 */
export const GH_TOKEN_VARIABLES: readonly string[] = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
];

/**
 * The credential- or code-execution-capable environment vocabulary of the
 * programs a scrubbed child runs, walked from each program's own
 * documentation. A child environment must contain NONE of these,
 * allowlisted or not; the environment probe reddens if any is present.
 * This is a BOUNDED denylist (it cannot list every dangerous name any
 * program will ever read); the allowlist in src/exec/env.ts remains the
 * real defense. Per-name source:
 *
 *   git (git-config(1), git(1)):
 *     GIT_ASKPASS       - program git runs to obtain a password.
 *     GIT_SSH_COMMAND   - shell command git uses for its ssh transport.
 *     GIT_PROXY_COMMAND - external program for git:// connections.
 *     GIT_CONFIG_COUNT  - trigger of the environment config-injection
 *                         family; with GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n
 *                         it injects arbitrary config (e.g. a
 *                         credential.helper) at a scope --global/--system
 *                         cannot see. The numbered KEY_n / VALUE_n members
 *                         are matched by isDangerousEnvName's pattern.
 *   ssh (ssh(1), ssh-add(1)):
 *     SSH_ASKPASS       - program ssh runs to obtain a passphrase.
 *   node / dynamic loader / shell startup (node(1), ld.so(8), bash(1)):
 *     NODE_OPTIONS       - options node applies at startup (can require
 *                          arbitrary modules), arbitrary code execution.
 *     NODE_EXTRA_CA_CERTS- extra CAs node trusts, a TLS-trust channel.
 *     LD_PRELOAD         - shared objects the loader injects into every
 *                          dynamically linked program, arbitrary code.
 *     BASH_ENV           - script bash sources at non-interactive startup.
 *     ENV                - script the POSIX shell sources at startup.
 *
 * GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM are DELIBERATELY absent: they are
 * redirected (CREDENTIAL_STORE_REDIRECTIONS) to empty harness-owned targets
 * and the override runs last in buildChildEnv, so their mere presence is
 * expected and neutralized; flagging them would false-positive on every
 * real run.
 */
export const DANGEROUS_ENV_VOCABULARY: readonly string[] = [
  "GIT_ASKPASS",
  "GIT_SSH_COMMAND",
  "GIT_PROXY_COMMAND",
  "GIT_CONFIG_COUNT",
  "SSH_ASKPASS",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "LD_PRELOAD",
  "BASH_ENV",
  "ENV",
];

/**
 * git-config(1)'s numbered environment config-injection members:
 * GIT_CONFIG_KEY_<n> and GIT_CONFIG_VALUE_<n> for n in [0, COUNT). The
 * index is git's own documented closed shape (a non-negative integer), so
 * this is a vocabulary match, not a widened guess.
 */
const GIT_CONFIG_INJECTION_MEMBER = /^GIT_CONFIG_(KEY|VALUE)_\d+$/;

/** Whether a variable name is in the walked dangerous vocabulary. */
export function isDangerousEnvName(name: string): boolean {
  return (
    DANGEROUS_ENV_VOCABULARY.includes(name) ||
    GIT_CONFIG_INJECTION_MEMBER.test(name)
  );
}

/** The names credential-scrub probes, in probe order. */
export const CREDENTIAL_SOURCES: readonly string[] = [
  "environment",
  "gh-configuration",
  "git-global-config",
  "git-system-config",
  "git-resolved-config",
  "netrc",
  "git-credentials",
];

function probe(source: string, outcome: SourceProbe["outcome"], detail: string): SourceProbe {
  return { source, outcome, detail };
}

/** A regular file with content at a credential-store path. */
function fileProbe(source: string, paths: string[]): SourceProbe {
  const found: string[] = [];
  for (const path of paths) {
    // M2-C-6: the type is established before the open, and a path that is
    // present but not a readable regular file is `error`, never guessed
    // clean and never blocked on.
    const read = readRegularFileIfPresent(path);
    if (read.kind === "refused") {
      return probe(source, "error", read.reason);
    }
    if (read.kind === "read" && read.body.length > 0) {
      found.push(`${path} (${String(read.body.length)} bytes)`);
    }
  }
  if (found.length > 0) {
    return probe(
      source,
      "resolvable",
      `credential store reachable from inside the child environment: ${found.join(", ")}`,
    );
  }
  return probe(source, "clean", `no populated store at ${paths.join(", ")}`);
}

/** Locate an executable on a PATH string, or undefined. */
function findOnPath(pathValue: string | undefined, program: string): string | undefined {
  if (pathValue === undefined) {
    return undefined;
  }
  for (const dir of pathValue.split(delimiter)) {
    if (dir === "") {
      continue;
    }
    const candidate = join(dir, program);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here; keep walking.
    }
  }
  return undefined;
}

export interface ProbeOptions {
  /**
   * The variable names the environment source accepts. Defaults to the
   * constructed contract (allowlist plus redirections). Passed explicitly
   * by tests staging dangerous states.
   */
  permittedNames?: ReadonlySet<string>;
}

/**
 * Probe every credential source FROM INSIDE the given child environment.
 * The environment is the one under test: every subprocess probe below runs
 * with `env` as its entire environment, so what is asserted is what a
 * child launched with this environment could actually resolve.
 */
export function probeCredentialSources(
  env: Record<string, string | undefined>,
  options: ProbeOptions = {},
): SourceProbe[] {
  const permitted = options.permittedNames ?? permittedChildEnvNames();
  const probes: SourceProbe[] = [];

  // Source 1: the environment itself. Three checks. The first two are
  // allowlist-INDEPENDENT tripwires (they fire even on a permitted name):
  // no gh-documented token variable, and no git/ssh/node credential- or
  // code-execution-capable variable from the walked vocabulary. The third
  // is the allowlist-dependent stray check (anything outside the
  // constructed contract), which in a real run is tautological because the
  // child is built from that contract, and does real work only in tests
  // that hand-build an env with extra names.
  const names = Object.keys(env).filter((name) => env[name] !== undefined);
  const tokens = names.filter((name) => GH_TOKEN_VARIABLES.includes(name));
  const dangerous = names.filter((name) => isDangerousEnvName(name));
  const strays = names.filter((name) => !permitted.has(name));
  if (tokens.length > 0) {
    probes.push(
      probe(
        "environment",
        "resolvable",
        `pull-request-capable token variable(s) present in the child environment: ${tokens.join(", ")}`,
      ),
    );
  } else if (dangerous.length > 0) {
    probes.push(
      probe(
        "environment",
        "resolvable",
        `credential- or code-execution-capable variable(s) from the walked vocabulary present in the child environment: ${dangerous.join(", ")}`,
      ),
    );
  } else if (strays.length > 0) {
    probes.push(
      probe(
        "environment",
        "resolvable",
        `variable(s) outside the constructed contract present in the child environment: ${strays.join(", ")}`,
      ),
    );
  } else {
    probes.push(
      probe(
        "environment",
        "clean",
        `${String(names.length)} variable(s), all inside the constructed contract, no gh token or walked-vocabulary variable`,
      ),
    );
  }

  // Source 2: gh configuration. The store is hosts.yml at gh's documented
  // resolution order (GH_CONFIG_DIR, else XDG_CONFIG_HOME/gh, else
  // HOME/.config/gh); all three are probed rather than only the first so
  // a partial redirection cannot hide a reachable store. Where a gh
  // binary is resolvable on the child PATH, gh itself is also asked: exit
  // 0 from `gh auth status` means some host authenticated, which is a
  // resolvable credential regardless of which file it came from.
  const ghStorePaths: string[] = [];
  if (env["GH_CONFIG_DIR"] !== undefined) {
    ghStorePaths.push(join(env["GH_CONFIG_DIR"], "hosts.yml"));
  }
  if (env["XDG_CONFIG_HOME"] !== undefined) {
    ghStorePaths.push(join(env["XDG_CONFIG_HOME"], "gh", "hosts.yml"));
  }
  if (env["HOME"] !== undefined) {
    ghStorePaths.push(join(env["HOME"], ".config", "gh", "hosts.yml"));
  }
  let ghProbe = fileProbe("gh-configuration", ghStorePaths);
  if (ghProbe.outcome === "clean") {
    const gh = findOnPath(env["PATH"], "gh");
    if (gh === undefined) {
      ghProbe = probe(
        "gh-configuration",
        "clean",
        `${ghProbe.detail}; no gh binary on the child PATH, so no CLI resolution path exists either`,
      );
    } else {
      const status = spawnSync(gh, ["auth", "status"], {
        env: env as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: 15000,
      });
      if (status.error !== undefined) {
        ghProbe = probe(
          "gh-configuration",
          "error",
          `gh auth status could not be run: ${singleLine(String(status.error))}`,
        );
      } else if (status.status === 0) {
        ghProbe = probe(
          "gh-configuration",
          "resolvable",
          "gh auth status exited 0 from inside the child environment: some host is authenticated",
        );
      } else {
        ghProbe = probe(
          "gh-configuration",
          "clean",
          `${ghProbe.detail}; gh auth status exited ${String(status.status)} (no authenticated host)`,
        );
      }
    }
  }
  probes.push(ghProbe);

  // Sources 3 and 4: git global and system configuration, asked through
  // git itself (`git config --get-all credential.helper`), because git is
  // the program that would resolve a helper and its exit code is the
  // documented contract: 0 with output means the key is set, 1 means it
  // is not. Nothing here parses message text (T-003).
  for (const scope of ["global", "system"] as const) {
    const result = spawnSync("git", ["config", `--${scope}`, "--get-all", "credential.helper"], {
      env: env as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 15000,
    });
    const source = `git-${scope}-config`;
    if (result.error !== undefined) {
      probes.push(
        probe(source, "error", `git config --${scope} could not be run: ${singleLine(String(result.error))}`),
      );
    } else if (result.status === 0 && (result.stdout ?? "").trim() !== "") {
      probes.push(
        probe(
          source,
          "resolvable",
          `git config --${scope} --get-all credential.helper resolves: ${singleLine((result.stdout ?? "").trim())}`,
        ),
      );
    } else {
      probes.push(
        probe(
          source,
          "clean",
          `git config --${scope} --get-all credential.helper exited ${String(result.status)} with no output`,
        ),
      );
    }
  }

  // Source 5 (behavioral): what git ACTUALLY resolves for credential.helper
  // from inside the child, with NO scope flag. This catches the env-injection
  // vector the two scoped probes structurally miss: a credential.helper
  // injected via git's GIT_CONFIG_COUNT / GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n
  // family resolves here (exit 0 with output) while --global and --system see
  // nothing. It resolves env, then global, then system, then any repo-local
  // config of the working directory. The probe runs from the child's
  // redirected HOME (an empty, non-repo directory) rather than the gate's own
  // cwd, so it does not pick up repo-local config of whatever tree the gate
  // happens to run in; repo-local config of an arbitrary worktree is out of
  // the environment scrub's scope (the gate has no worktree). Nothing here
  // parses message text (T-003): the contract is git's exit code.
  const resolvedCwd =
    env["HOME"] !== undefined && existsSync(env["HOME"]) ? env["HOME"] : undefined;
  const resolved = spawnSync("git", ["config", "--get-all", "credential.helper"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout: 15000,
    cwd: resolvedCwd,
  });
  if (resolved.error !== undefined) {
    probes.push(
      probe(
        "git-resolved-config",
        "error",
        `git config --get-all could not be run: ${singleLine(String(resolved.error))}`,
      ),
    );
  } else if (resolved.status === 0 && (resolved.stdout ?? "").trim() !== "") {
    probes.push(
      probe(
        "git-resolved-config",
        "resolvable",
        `git config --get-all credential.helper resolves from inside the child (any source, including env injection): ${singleLine((resolved.stdout ?? "").trim())}`,
      ),
    );
  } else {
    probes.push(
      probe(
        "git-resolved-config",
        "clean",
        `git config --get-all credential.helper exited ${String(resolved.status)} with no output`,
      ),
    );
  }

  // Source 6: ~/.netrc, resolved from the child HOME.
  const netrcPaths = env["HOME"] === undefined ? [] : [join(env["HOME"], ".netrc")];
  if (netrcPaths.length === 0) {
    probes.push(
      probe(
        "netrc",
        "error",
        "HOME is not set in the child environment, so the netrc resolution path cannot be established",
      ),
    );
  } else {
    probes.push(fileProbe("netrc", netrcPaths));
  }

  // Source 7: git's store-backed credential files, both documented
  // locations (~/.git-credentials and $XDG_CONFIG_HOME/git/credentials).
  const credPaths: string[] = [];
  if (env["HOME"] !== undefined) {
    credPaths.push(join(env["HOME"], ".git-credentials"));
  }
  if (env["XDG_CONFIG_HOME"] !== undefined) {
    credPaths.push(join(env["XDG_CONFIG_HOME"], "git", "credentials"));
  }
  if (credPaths.length === 0) {
    probes.push(
      probe(
        "git-credentials",
        "error",
        "neither HOME nor XDG_CONFIG_HOME is set in the child environment, so no store path can be established",
      ),
    );
  } else {
    probes.push(fileProbe("git-credentials", credPaths));
  }

  return probes;
}

/** Fold probes into a gate verdict. Any error wins over any red. */
export function verdictFromProbes(probes: SourceProbe[]): {
  status: GateStatus;
  detail: string;
} {
  const errors = probes.filter((entry) => entry.outcome === "error");
  if (errors.length > 0) {
    return {
      status: "error",
      detail: errors.map((entry) => `${entry.source}: ${entry.detail}`).join("; "),
    };
  }
  const resolvable = probes.filter((entry) => entry.outcome === "resolvable");
  if (resolvable.length > 0) {
    return {
      status: "red",
      detail:
        "credential resolvable from inside the scrubbed child environment: " +
        resolvable.map((entry) => `${entry.source}: ${entry.detail}`).join("; "),
    };
  }
  return {
    status: "green",
    detail: `no pull-request-capable credential resolvable from any of the ${String(probes.length)} probed sources`,
  };
}

// ---------------------------------------------------------------------------
// The gate main (subprocess entry per the M2-P1 contract).
// ---------------------------------------------------------------------------

interface GateArgs {
  gateId: string;
  resultPath: string;
  evidenceDir: string;
}

function parseGateArgs(argv: string[]): GateArgs | string {
  const [gateId, ...rest] = argv;
  if (gateId !== "credential-scrub" && gateId !== "credential-token") {
    return "expected a gate id: credential-scrub or credential-token";
  }
  let resultPath: string | undefined;
  let evidenceDir: string | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === "--result" && value !== undefined) {
      resultPath = value;
      i += 1;
    } else if (flag === "--evidence" && value !== undefined) {
      evidenceDir = value;
      i += 1;
    } else {
      return `unknown argument ${String(flag)}`;
    }
  }
  if (resultPath === undefined || evidenceDir === undefined) {
    return "both --result <path> and --evidence <dir> are required";
  }
  return {
    gateId,
    resultPath: isAbsolute(resultPath) ? resultPath : resolve(resultPath),
    evidenceDir: isAbsolute(evidenceDir) ? evidenceDir : resolve(evidenceDir),
  };
}

function runCredentialScrub(evidenceDir: string, startedAt: string): {
  result: GateResult;
  evidenceBody?: string;
} {
  // The gate's harness-owned scrub root lives inside its own evidence
  // directory: the gate probes the CONSTRUCTION, and the construction is
  // the same buildChildEnv the executor calls, so what is green here is
  // the same mechanism spawn hands its children.
  const built = buildChildEnv({
    parentEnv: process.env,
    scrubDir: join(evidenceDir, "scrub-env"),
  });
  if (!built.ok) {
    return {
      result: makeGateResult({
        gate: "credential-scrub",
        status: "error",
        units: 0,
        unitLabel: "credential sources probed",
        startedAt,
        endedAt: new Date().toISOString(),
        detail: `the child environment could not be constructed: ${built.reason}`,
      }),
    };
  }
  const probes = probeCredentialSources(built.env);
  const verdict = verdictFromProbes(probes);
  const units = verdict.status === "error" ? 0 : probes.length;
  return {
    result: makeGateResult({
      gate: "credential-scrub",
      status: verdict.status,
      units,
      unitLabel: "credential sources probed",
      startedAt,
      endedAt: new Date().toISOString(),
      detail: verdict.detail,
      evidence: ["probes.json"],
    }),
    evidenceBody: `${JSON.stringify(probes, null, 2)}\n`,
  };
}

function runCredentialToken(startedAt: string): {
  result: GateResult;
  evidenceBody?: string;
} {
  if (process.env["TIPHYS_IMPLEMENTER_TOKEN"] === undefined) {
    return {
      result: makeGateResult({
        gate: "credential-token",
        status: "not-applicable",
        units: 0,
        unitLabel: "tokens probed",
        startedAt,
        endedAt: new Date().toISOString(),
        detail:
          "TIPHYS_IMPLEMENTER_TOKEN is not present: owner action A-3 " +
          "(DR-0004 item 4, the scoped implementer token) has not been " +
          "performed, so there is no token to probe. This gate never " +
          "reports green in this state.",
      }),
    };
  }
  // Fail closed (M2-C-3). See the module comment: the safe negative
  // probe's assertion must be derived from captured API responses (plan
  // M2-P8 step 7), and those captures require the very tokens A-3
  // provisions. Guessing a response shape here is T-003 lesson 4.
  return {
    result: makeGateResult({
      gate: "credential-token",
      status: "error",
      units: 0,
      unitLabel: "tokens probed",
      startedAt,
      endedAt: new Date().toISOString(),
      detail:
        "TIPHYS_IMPLEMENTER_TOKEN is present, but the probe's assertion " +
        "contract has not yet been derived from captured API responses " +
        "(kernel plan M2, M2-P8 step 7; owner action A-3). Refusing to " +
        "assert against an invented response shape (T-003 lesson 4); " +
        "this gate fails closed until the captures exist and is " +
        "witnessed live at the M2 exit test.",
    }),
  };
}

function gateMain(argv: string[]): number {
  const parsed = parseGateArgs(argv);
  if (typeof parsed === "string") {
    process.stderr.write(
      `credentials gate: ${parsed}\n` +
        "usage: node src/gates/credentials.ts credential-scrub|credential-token " +
        "--result <path> --evidence <dir>\n",
    );
    return EX_USAGE;
  }
  const startedAt = new Date().toISOString();
  const outcome =
    parsed.gateId === "credential-scrub"
      ? runCredentialScrub(parsed.evidenceDir, startedAt)
      : runCredentialToken(startedAt);

  if (outcome.evidenceBody !== undefined) {
    const evidencePath = join(parsed.evidenceDir, "probes.json");
    const refusal = refuseOpenForWrite(evidencePath);
    if (refusal !== undefined) {
      process.stderr.write(`credentials gate: ${refusal}\n`);
      return exitCodeForStatus("error");
    }
    const wrote = runStep(`writing ${evidencePath}`, () => {
      writeFileSync(evidencePath, outcome.evidenceBody as string);
    });
    if (!wrote.ok) {
      process.stderr.write(`credentials gate: ${wrote.reason}\n`);
      return exitCodeForStatus("error");
    }
  }

  const recordRefusal = refuseOpenForWrite(parsed.resultPath);
  if (recordRefusal !== undefined) {
    process.stderr.write(`credentials gate: ${recordRefusal}\n`);
    return exitCodeForStatus("error");
  }
  const written = runStep(`writing ${parsed.resultPath}`, () => {
    writeFileSync(parsed.resultPath, renderGateResult(outcome.result));
  });
  if (!written.ok) {
    process.stderr.write(`credentials gate: ${written.reason}\n`);
    return exitCodeForStatus("error");
  }
  return exitCodeForStatus(outcome.result.status);
}

// Main guard: run as a gate subprocess when executed directly, inert on
// import (tests import the probe functions without running a gate).
const entry = process.argv[1];
if (entry !== undefined) {
  const isMain = pathsIdentifySameObject(fileURLToPath(import.meta.url), entry);
  if (isMain) {
    process.exit(gateMain(process.argv.slice(2)));
  }
}
