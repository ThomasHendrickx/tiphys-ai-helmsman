#!/usr/bin/env node
/**
 * M4-P20: the compare-and-swap probe for cross-environment exclusion
 * (kernel plan M4, section 4.2, M4-P20 criteria 1 to 3).
 *
 * WHAT THIS PROBE IS FOR. M4-D-11 proposes a dedicated git ref used as a
 * compare-and-swap register through `git push --force-with-lease`. The
 * decision is PROTOTYPE-BLOCKED, so this probe measures the register
 * against real git rather than reasoning about it. It is a PROBE: it
 * writes nothing into the kernel, it is not imported by `src/`, and the
 * exclusion mechanism it informs is built by M4-P21.
 *
 * C-2 (plan constraint, binding): nothing here reads a pid, probes process
 * liveness, sends a signal, or reads /proc. Every observation is a git
 * command's exit code, stdout or stderr.
 *
 * STANDING WARNING 9 (CLAUDE.md): `git -C <repo> <cmd> <path>` resolves
 * <path> against the REPOSITORY, not against the shell's directory. Every
 * path this file hands to git is absolute, built with resolve() and join().
 *
 * THE THREE MODES.
 *
 *   --remote <path>     criteria 1 and 2. Builds a bare repository at
 *                       <path> and two clones A and B at absolute paths,
 *                       has A win a compare-and-swap with an EXACT-SHA
 *                       expectation and B lose one against a stale
 *                       expectation, and prints exactly two lines:
 *                         A accept
 *                         B refuse <git's own rejection line>
 *                       Exit 0. The refusal text is CAPTURED from the real
 *                       forced contention, never hand-written (T-003).
 *                       The criterion says "first line of git stderr"; see
 *                       refusalStderrLine below for the measurement that
 *                       forced the deviation, and the work history for the
 *                       declaration of it.
 *
 *   --vacuity <path>    criterion 3, the anti-vacuous arm. Measures the two
 *                       ways the lease can be satisfied WITHOUT having seen
 *                       the current value, and prints a failure word for
 *                       each one that accepts such a push.
 *
 *   --namespaces <path> the measurement the plan section did not have.
 *                       delivery/verification/m4-prototype-probes.md:147
 *                       measured that only refs/heads/* is pushable to the
 *                       real remote. A local bare repository accepts every
 *                       namespace, so this mode prints what a LOCAL probe
 *                       can and cannot tell you about the real one.
 *
 * Every mode takes --json to print one machine-readable object after the
 * human lines, which is how the evidence document and the guard test read
 * the result without re-parsing prose.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const USAGE =
  "usage: node scripts/probe-cas-ref.mjs " +
  "(--remote <path> | --vacuity <path> | --namespaces <path>) [--json]";

/** The register's ref name, as M4-D-11 proposes it. */
const LEASE_REF = "refs/tiphys/lease";

/** An all-zero object name: a sha the register can never actually hold. */
const IMPOSSIBLE_SHA = "0000000000000000000000000000000000000000";

/**
 * A deterministic git identity for every scratch repository. CI runners
 * carry no git identity (CLAUDE.md standing warning 5) and this probe must
 * never touch user or global config, so the identity is command-scoped.
 *
 * `push.negotiate` is set TRUE in this container's global git config, and
 * over the file transport git 2.43.0 then prints
 * `fatal: expected 'acknowledgments', received 'packfile'` followed by
 * `warning: push negotiation failed; proceeding anyway with push` on EVERY
 * push, accepted or refused alike. That line is therefore not a refusal
 * signature, it is noise that happens to sort first. It is pinned OFF
 * command-scoped so the capture is a property of git rather than of one
 * machine's global config. The measured difference is recorded in
 * delivery/verification/cross-environment-exclusion-probe.md:1.
 */
const GIT_IDENTITY = [
  "-c",
  "user.name=tiphys-probe",
  "-c",
  "user.email=probe@tiphys.invalid",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "protocol.file.allow=always",
  "-c",
  "push.negotiate=false",
];

/** Run git in an absolute directory and return the raw result. */
function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...GIT_IDENTITY, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "tiphys-probe",
      GIT_AUTHOR_EMAIL: "probe@tiphys.invalid",
      GIT_COMMITTER_NAME: "tiphys-probe",
      GIT_COMMITTER_EMAIL: "probe@tiphys.invalid",
    },
  });
  if (result.error) {
    throw new Error(
      `git ${args.join(" ")} failed to spawn: ${result.error.message}`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Run git and throw on any nonzero exit. Setup steps use this. */
function gitOrThrow(cwd, args) {
  const result = git(cwd, args);
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${String(result.status)}\n${result.stderr}`,
    );
  }
  return result;
}

/** Run git with stdin and throw on any nonzero exit. */
function gitInputOrThrow(cwd, args, input) {
  const result = spawnSync("git", ["-C", cwd, ...GIT_IDENTITY, ...args], {
    encoding: "utf8",
    input,
  });
  if (result.error) {
    throw new Error(
      `git ${args.join(" ")} failed to spawn: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${String(result.status)}\n${result.stderr ?? ""}`,
    );
  }
  return (result.stdout ?? "").trim();
}

/**
 * The line of a git stderr block that carries git's OWN rejection marker,
 * falling back to the first non-empty line.
 *
 * WHY THIS IS NOT "the first line", which is what M4-P20 criterion 1 asks
 * for literally. Measured 2026-09-15, git 2.43.0: with `push.negotiate`
 * true the first stderr line is a negotiation warning that is BYTE-
 * IDENTICAL on the accepted push and on the refused one, so a signature
 * taken from it cannot tell accept from refuse. That is a guard whose
 * condition does not test the property that matters (CLAUDE.md, the
 * red-witness rule one level up). The marker is git's, not this probe's:
 * nothing here hand-writes the refusal text, which stays T-003 compliant.
 */
function refusalStderrLine(stderr) {
  const lines = stderr.split("\n").map((line) => line.trim()).filter(Boolean);
  const rejected = lines.find((line) => line.startsWith("! [rejected]"));
  if (rejected !== undefined) {
    return rejected;
  }
  return lines[0] ?? "<git printed nothing on stderr>";
}

/** The version of git that produced every capture in this run. */
function gitVersion() {
  const result = spawnSync("git", ["--version"], { encoding: "utf8" });
  return (result.stdout ?? "").trim();
}

/**
 * Build a bare repository plus one clone per name, all at ABSOLUTE paths
 * under root. The bare repository stands in for the fleet remote; each
 * clone stands in for one environment's fleet home.
 */
function buildScratchFleet(root, cloneNames) {
  const absRoot = resolve(root);
  rmSync(absRoot, { recursive: true, force: true });
  mkdirSync(absRoot, { recursive: true });

  const remote = join(absRoot, "remote.git");
  mkdirSync(remote, { recursive: true });
  gitOrThrow(remote, ["init", "--bare", "--initial-branch=main", "--quiet"]);

  // A seed commit, so the clones are not empty and `main` resolves.
  const seed = join(absRoot, "seed");
  mkdirSync(seed, { recursive: true });
  gitOrThrow(seed, ["init", "--initial-branch=main", "--quiet"]);
  writeFileSync(join(seed, "backlog.md"), "# backlog\n", "utf8");
  gitOrThrow(seed, ["add", "backlog.md"]);
  gitOrThrow(seed, ["commit", "--quiet", "-m", "seed"]);
  gitOrThrow(seed, ["remote", "add", "origin", remote]);
  gitOrThrow(seed, ["push", "--quiet", "origin", "main"]);

  const clones = {};
  for (const name of cloneNames) {
    const target = join(absRoot, name);
    gitOrThrow(absRoot, ["clone", "--quiet", remote, target]);
    clones[name] = target;
  }
  return { root: absRoot, remote, clones };
}

/**
 * Write a lease document as a single commit with no parent and return its
 * sha. The register's VALUE is a commit sha; the lease document is that
 * commit's only file. Nothing is checked out, so this never touches a
 * working tree.
 */
function makeLeaseCommit(cloneDir, holderId) {
  const document = `${JSON.stringify({ holderId, ref: LEASE_REF }, null, 2)}\n`;
  const blob = gitInputOrThrow(
    cloneDir,
    ["hash-object", "-w", "--stdin"],
    document,
  );
  const treeSha = gitInputOrThrow(
    cloneDir,
    ["mktree"],
    `100644 blob ${blob}\tlease.json\n`,
  );
  return gitOrThrow(cloneDir, [
    "commit-tree",
    treeSha,
    "-m",
    `lease ${holderId}`,
  ]).stdout.trim();
}

/** Point a local ref at a sha, without a working tree. */
function setLocalRef(cloneDir, ref, sha) {
  gitOrThrow(cloneDir, ["update-ref", ref, sha]);
}

/** Read the remote's current value for a ref, or "" when it is absent. */
function readRemoteRef(remote, ref) {
  const result = git(remote, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${ref}^{commit}`,
  ]);
  return result.status === 0 ? result.stdout.trim() : "";
}

/**
 * One compare-and-swap attempt. `expected` is the sha the caller believes
 * the register currently holds; "" means "I expect it to be absent"; null
 * means the BARE --force-with-lease form, which is the vacuous one.
 */
function casPush(cloneDir, remote, ref, sha, expected) {
  const lease =
    expected === null
      ? "--force-with-lease"
      : `--force-with-lease=${ref}:${expected}`;
  const result = git(cloneDir, ["push", lease, remote, `${sha}:${ref}`]);
  return {
    accepted: result.status === 0,
    status: result.status,
    stderr: result.stderr,
    refusalLine: refusalStderrLine(result.stderr),
  };
}

/* ------------------------------------------------------------------ */
/* Mode: --remote (criteria 1 and 2)                                   */
/* ------------------------------------------------------------------ */

function runRemoteMode(path) {
  const fleet = buildScratchFleet(path, ["A", "B"]);
  const { remote, clones } = fleet;

  // A and B both start from the same view: the register is absent.
  const before = readRemoteRef(remote, LEASE_REF);
  if (before !== "") {
    throw new Error(
      `precondition failed: ${LEASE_REF} already exists at ${before}`,
    );
  }

  const aSha = makeLeaseCommit(clones.A, "holder-A");
  setLocalRef(clones.A, LEASE_REF, aSha);
  // The EXACT-SHA form, expecting absence. This is the create half.
  const aResult = casPush(clones.A, remote, LEASE_REF, aSha, "");

  const afterA = readRemoteRef(remote, LEASE_REF);

  // B's expectation is STALE: it believes the register is still absent,
  // which is exactly what a second environment that never fetched believes.
  const bSha = makeLeaseCommit(clones.B, "holder-B");
  setLocalRef(clones.B, LEASE_REF, bSha);
  const bResult = casPush(clones.B, remote, LEASE_REF, bSha, "");

  const afterB = readRemoteRef(remote, LEASE_REF);

  const lines = [
    aResult.accepted ? "A accept" : `A refuse ${aResult.refusalLine}`,
    bResult.accepted ? "B accept" : `B refuse ${bResult.refusalLine}`,
  ];

  return {
    lines,
    json: {
      mode: "remote",
      gitVersion: gitVersion(),
      ref: LEASE_REF,
      remote,
      cloneA: clones.A,
      cloneB: clones.B,
      registerBefore: before,
      registerAfterA: afterA,
      registerAfterB: afterB,
      a: {
        expected: "",
        pushed: aSha,
        accepted: aResult.accepted,
        exit: aResult.status,
        stderr: aResult.stderr,
      },
      b: {
        expected: "",
        pushed: bSha,
        accepted: bResult.accepted,
        exit: bResult.status,
        stderr: bResult.stderr,
        refusalLine: bResult.refusalLine,
      },
      singleWinner: aResult.accepted && !bResult.accepted && afterB === aSha,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mode: --vacuity (criterion 3)                                       */
/* ------------------------------------------------------------------ */

function runVacuityMode(path) {
  const fleet = buildScratchFleet(path, ["holder", "challenger"]);
  const { remote, clones } = fleet;
  const findings = [];

  /* THE REGISTER IS A BRANCH HERE, NOT A CUSTOM NAMESPACE, AND THAT IS
     LOAD-BEARING RATHER THAN COSMETIC. Two separate reasons:

     - CLAUDE.md standing warning 14 as generalised on 2026-09-15 records
       that only `refs/heads/*` is pushable from this container, so a
       "dedicated ref" must be read as a dedicated BRANCH.
     - The BARE --force-with-lease form takes its expected value from the
       clone's REMOTE-TRACKING ref, and a clone only has one for a ref its
       remote's fetch refspec covers. The default refspec covers
       refs/heads/* and nothing else. Measured below: the same bare push
       into an UNTRACKED namespace is REFUSED, so probing vacuity there
       would have produced a reassuring result for the wrong reason. */
  const branchRef = "refs/heads/tiphys-lease";

  /* (a) THE REGISTER DOES NOT EXIST AT ALL.
     A clone that has never seen the register pushes with the BARE
     --force-with-lease. If that is accepted, the lease was satisfied by a
     clone that had seen nothing, which is not a compare-and-swap. */
  const naiveSha = makeLeaseCommit(clones.challenger, "holder-naive");
  setLocalRef(clones.challenger, branchRef, naiveSha);
  const absentArm = casPush(clones.challenger, "origin", branchRef, naiveSha, null);
  findings.push({
    id: "bare-lease-absent-register",
    description:
      "bare --force-with-lease pushed by a clone that has never seen the register",
    ref: branchRef,
    accepted: absentArm.accepted,
    exit: absentArm.status,
    stderr: absentArm.stderr,
    verdict: absentArm.accepted ? "VACUOUS" : "SAFE",
  });

  // Reset the register for the second arm, whatever the first arm did.
  git(remote, ["update-ref", "-d", branchRef]);

  /* (b) THE CLONE FETCHED, SO ITS REMOTE-TRACKING VALUE MOVED UNDER IT.
     The holder takes the register. The challenger, whose knowledge of the
     register is from BEFORE the holder wrote it, does a routine fetch and
     then pushes with the BARE form. The fetch re-arms the lease with the
     holder's value, so the bare form protects a value the challenger never
     decided against. This is the arm that reproduces
     delivery/verification/m4-prototype-probes.md:150 locally. */
  const holderSha = makeLeaseCommit(clones.holder, "holder-live");
  setLocalRef(clones.holder, branchRef, holderSha);
  const holderArm = casPush(clones.holder, "origin", branchRef, holderSha, "");
  if (!holderArm.accepted) {
    throw new Error(
      `precondition failed: the live holder could not take the register\n${holderArm.stderr}`,
    );
  }

  const challengerSha = makeLeaseCommit(clones.challenger, "holder-challenger");
  setLocalRef(clones.challenger, branchRef, challengerSha);
  // The routine fetch. Nothing about it is a takeover attempt: it is the
  // ordinary `git fetch origin` any environment runs many times a day.
  gitOrThrow(clones.challenger, ["fetch", "--quiet", "origin"]);
  const staleArm = casPush(
    clones.challenger,
    "origin",
    branchRef,
    challengerSha,
    null,
  );
  const afterStale = readRemoteRef(remote, branchRef);
  findings.push({
    id: "bare-lease-after-routine-fetch",
    description:
      "bare --force-with-lease pushed by a stale clone that did a routine fetch first",
    ref: branchRef,
    accepted: staleArm.accepted,
    exit: staleArm.status,
    stderr: staleArm.stderr,
    clobberedLiveHolder: staleArm.accepted && afterStale === challengerSha,
    verdict: staleArm.accepted ? "VACUOUS" : "SAFE",
  });

  /* (c) THE DISCRIMINATOR, and it is why arm (b) had to move to a branch.
     The SAME bare form, the SAME live holder, into a namespace the clone's
     fetch refspec does not cover, so no remote-tracking ref exists. If this
     is SAFE while (b) is VACUOUS, then the vacuity is a property of the
     remote-tracking ref rather than of --force-with-lease as such, and a
     probe that only ever tested an untracked namespace would have called
     the bare form safe. */
  const untrackedSha = makeLeaseCommit(clones.challenger, "holder-untracked");
  setLocalRef(clones.holder, LEASE_REF, holderSha);
  const seedUntracked = casPush(clones.holder, "origin", LEASE_REF, holderSha, "");
  if (!seedUntracked.accepted) {
    throw new Error(
      `precondition failed: could not seed ${LEASE_REF}\n${seedUntracked.stderr}`,
    );
  }
  setLocalRef(clones.challenger, LEASE_REF, untrackedSha);
  gitOrThrow(clones.challenger, ["fetch", "--quiet", "origin"]);
  const untrackedArm = casPush(
    clones.challenger,
    "origin",
    LEASE_REF,
    untrackedSha,
    null,
  );
  findings.push({
    id: "bare-lease-untracked-namespace",
    description:
      "bare --force-with-lease into a namespace no fetch refspec covers, live holder present",
    ref: LEASE_REF,
    accepted: untrackedArm.accepted,
    exit: untrackedArm.status,
    stderr: untrackedArm.stderr,
    verdict: untrackedArm.accepted ? "VACUOUS" : "SAFE",
  });

  /* THE CONTROL. The same challenger, same staleness, with the EXACT-SHA
     form naming a value the register does not hold. If this is also
     accepted then the exact-sha form is vacuous too and the whole design is
     refuted, which is why the control is here rather than assumed. */
  git(remote, ["update-ref", branchRef, holderSha]);
  const controlArm = casPush(
    clones.challenger,
    "origin",
    branchRef,
    challengerSha,
    IMPOSSIBLE_SHA,
  );
  findings.push({
    id: "exact-sha-stale-expectation",
    description:
      "exact-sha --force-with-lease naming a value the register does not hold",
    ref: branchRef,
    accepted: controlArm.accepted,
    exit: controlArm.status,
    stderr: controlArm.stderr,
    verdict: controlArm.accepted ? "VACUOUS" : "SAFE",
  });

  const bareIsVacuous = findings
    .filter((finding) => finding.id.startsWith("bare-lease"))
    .some((finding) => finding.verdict === "VACUOUS");
  const exactIsVacuous = findings
    .filter((finding) => finding.id.startsWith("exact-sha"))
    .some((finding) => finding.verdict === "VACUOUS");

  const lines = findings.map(
    (finding) =>
      `${finding.id} ${finding.verdict} exit ${String(finding.exit)} ${finding.description}`,
  );
  lines.push(
    bareIsVacuous
      ? "verdict: the bare --force-with-lease form is REFUSED for the design"
      : "verdict: the bare --force-with-lease form was NOT shown vacuous here",
  );
  lines.push(
    exactIsVacuous
      ? "verdict: the exact-sha form is ALSO vacuous, which refutes M4-D-11"
      : "verdict: the exact-sha form is MANDATED",
  );

  return {
    lines,
    json: {
      mode: "vacuity",
      gitVersion: gitVersion(),
      ref: LEASE_REF,
      remote,
      findings,
      bareIsVacuous,
      exactIsVacuous,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mode: --namespaces                                                  */
/* ------------------------------------------------------------------ */

function runNamespacesMode(path) {
  const fleet = buildScratchFleet(path, ["A"]);
  const { remote, clones } = fleet;
  const sha = makeLeaseCommit(clones.A, "holder-namespace");
  const candidates = [
    "refs/tiphys/lease",
    "refs/heads/tiphys-lease",
    "refs/tags/tiphys-lease",
    "refs/notes/tiphys-lease",
  ];
  const results = [];
  for (const ref of candidates) {
    setLocalRef(clones.A, ref, sha);
    const pushed = casPush(clones.A, remote, ref, sha, "");
    results.push({
      ref,
      accepted: pushed.accepted,
      exit: pushed.status,
      refusalLine: pushed.refusalLine,
    });
  }
  const lines = results.map(
    (result) =>
      `${result.ref} ${result.accepted ? "accept" : "refuse"} exit ${String(result.exit)}`,
  );
  lines.push(
    "note: a LOCAL bare repository is not the real remote. " +
      "delivery/verification/m4-prototype-probes.md:147 measured HTTP 403 " +
      "for every namespace outside refs/heads/* against the real fleet remote, " +
      "so a local accept here is NOT evidence that the namespace is usable there.",
  );
  return {
    lines,
    json: { mode: "namespaces", gitVersion: gitVersion(), remote, results },
  };
}

/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--remote" || arg === "--vacuity" || arg === "--namespaces") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: `${arg} requires a path` };
      }
      if (options.mode !== undefined) {
        return { usageError: "exactly one mode may be given" };
      }
      options.mode = arg.slice(2);
      options.path = value;
      index += 1;
      continue;
    }
    return { usageError: `unknown argument: ${arg}` };
  }
  if (options.mode === undefined) {
    return { usageError: "a mode is required" };
  }
  return { options };
}

function main(argv) {
  const { options, usageError } = parseArgs(argv);
  if (usageError !== undefined) {
    process.stderr.write(`${usageError}\n${USAGE}\n`);
    return 64;
  }
  const runners = {
    remote: runRemoteMode,
    vacuity: runVacuityMode,
    namespaces: runNamespacesMode,
  };
  let outcome;
  try {
    outcome = runners[options.mode](options.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`probe failed: ${message}\n`);
    return 1;
  }
  process.stdout.write(`${outcome.lines.join("\n")}\n`);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(outcome.json, null, 2)}\n`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
