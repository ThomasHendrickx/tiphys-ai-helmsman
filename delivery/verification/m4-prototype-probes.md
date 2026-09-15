# M4 prototype probes: what was measured, and what it overturns

- date: 2026-09-15
- subject: the fourteen questions M4's intake recorded as PROTOTYPE-BLOCKED
- method: eight probe agents and two adversarial reviewers, dispatched as five
  concurrent workflows. Each wrote its findings incrementally to a beacon file;
  all ten beacons are committed verbatim under `delivery/evidence/m4-probes/`
  and are the primary evidence. This document is the summary and the
  consequences, not a replacement for them.
- transliteration: the copied beacons were checked for non-ASCII and control
  bytes before committing. Zero substitutions were required; the check is
  recorded because it ran, not because it found anything.

**Four of these overturn something this repository believed.** Those are first.

## 1. The premise of M4-D-07 is FALSE in this container

**Believed:** a real agent payload cannot authenticate under the kernel's
credential scrub. This is recorded as the first of "three kernel defects found
by USE" at delivery/verification/dr-0034-premise-check.md:102, and the intake
built M4-D-07 and part of the harness-adapter workstream on it.

**Measured:** a Claude Code payload authenticates under the kernel's REAL
scrubbed environment (seven variables, produced by calling `buildChildEnv` with
`process.env`), exit 0, unique nonce echoed. It also authenticates with PATH
and nothing else.

**Why.** The credential is not in the environment at all. It is at an absolute
path OUTSIDE `$HOME`, so redirecting `HOME`, which is the scrub's entire
defense against credential stores (src/exec/env.ts:110), cannot reach it.

**So the minimal `extraAllowlist` for model authentication is THE EMPTY LIST.**
M4-D-07's question, as the intake asks it, has no content.

**What the scrub DOES break is `git push`, and it costs exactly one name.**
Measured against the real endpoint: full environment HTTP 200; scrubbed seven
HTTP 401; scrubbed plus `HTTPS_PROXY` HTTP 200; scrubbed plus `GH_TOKEN` ONLY
still HTTP 401. `GH_TOKEN` carries nothing, exactly as standing warning 6
concluded from a different direction.

**The honest limit, in the prober's own words: it could not distinguish "the
pilot was wrong" from "the pilot ran somewhere else".** One container, one day.
The pilot's report is not refuted; its premise is not reproducible here.

## 2. The `credential-scrub` gate's verdict is INVERTED with respect to real capability

Measured in this container, the gate greens `HTTPS_PROXY`, which grants full
GitHub write, and reddens `GIT_CONFIG_*`, which grants only URL rewriting. The
one name that actually carries push capability is the one it permits.

That is a defect in a shipped gate, and it is the same shape the repository
keeps paying for: the condition does not test the property that matters.

## 3. The credential boundary here is the UID AND THE FILESYSTEM, not the environment

Single-variable experiment, same command, same environment, only the uid
changed: uid 0 AUTHENTICATED; uid 65534 refused with a specific authentication
error and exit 1.

The kernel's scrub is environment-only and spawns the child at the SAME uid, so
a payload keeps read access to the credential file. And redirecting `HOME` hides
a path from RESOLUTION without removing READ ACCESS to the absolute path: a
payload that names `/root/.gitconfig` directly gets the file.

**Consequence for M4.** "Enforced by code" (DR-0039) is weaker than that record
assumed. The environment scrub is real and is not the boundary it reads as. A
uid or a mount is what would make it one, and the kernel uses neither.

**Not established, and the prober said so plainly:** whether removing the
credential file breaks authentication. The session's permission classifier
refused both the mask and a directory listing, citing credential exploration.
The uid experiment establishes that the credential is filesystem-and-uid bound;
it does not isolate which file carries it. No credential contents were read.

## 4. D-8's carve-out does not partition the operations it names

**Believed:** "the orchestrator never writes working-tree content or commits in
projects/; ref updates through designated merge tooling are the carve-out"
(delivery/plan/kernel-plan-v1.md:383). The intake treats this as the hook's
predicate.

**Measured:** a fast-forward merge in a CHECKED-OUT clone rewrites tracked files
on disk. One file's digest changed and another was created.

**So the sanctioned act is a member of the forbidden set.** No path-based hook
can implement the line as written. The carve-out is implementable only if
restated as: allow exactly these NAMED absolute-path tools, constructed so their
writes are ref-only, which log before they act. The hook verifies the NAME; the
tool provides the GUARANTEE. That inversion is the design point, because a hook
cannot inspect what a program will do.

## 5. DR-0010 is answered: option 1 is refuted for ship phases

Full account and the four measured arms are in
delivery/decisions/DR-0010-harness-orchestration-primitive.md:1, updated the
same day. In short: the harness's environment control is a DENYLIST over the
host environment (174 in, 193 out), it FAILS OPEN when its sandbox dependencies
are missing, and one surviving name carries a live credential that is on the
kernel's own dangerous-variable list. The kernel's own path gives seven
variables built from nothing.

## 6. A third gate status is a small edit and a silent semantics change

**The vocabulary is four words** (src/gates/result.ts:47) with a closed
exit-code table. Adding a fifth is eleven inserted lines across three files and
produces exactly ONE type error.

**That is not the cost.** With the vocabulary edit alone, a bundle containing one
ordinary green gate plus one gate reporting the NEW status printed
`gates: every applicable gate is green` and exited 0. The compiler said nothing,
because the aggregation uses `if` chains rather than an exhaustive switch.

**So DR-0038's real work is the aggregation precedence, not the enum**, and the
naive implementation introduces a guard that cannot go red into the gate runner
itself.

**A third status word already exists and is unreachable.**
schemas/report.schema.json:507 admits `amber`, and the schema's own comment says
it is not one of the runner's four statuses and no producer defines an exit code
for it. DR-0038 makes an existing reporting word reachable.

**One claim the prober did NOT measure and flagged as such:** a VACUOUS third
status appears constructible, because the never-green-by-omission rewrite fires
only for `status === "green"`. That is precisely the shape M2-C-2 exists
against, and it must be re-measured rather than inherited from a reading.

## 7. The decorrelation check compares STRINGS, not families, reproduced

Run against a fixture carrying the two real `produced-by` values from this
repository's own reviews: **green, reported as decorrelated**, while one of them
contains the words "Anthropic model family". A byte-identical repeat IS caught,
which is the control proving the green is the check working as written.

An ABSENT dimension is also RED, indistinguishable BY STATUS from a real
correlation violation and separated only by prose.

## 8. A git ref IS a real compare-and-swap, with three conditions the recommendation omitted

Two clones of the real fleet remote, raced against a shared barrier. Create
race: exactly one winner, the loser refused server-side. Update race: exactly
one winner, and the refusal names both the actual and the expected sha, which is
a fencing token for free.

Three conditions M4-D-11 did not state:

1. **Only `refs/heads/*` is pushable here.** Tags, notes and custom namespaces
   all return HTTP 403. A "dedicated ref" must be read as a dedicated BRANCH.
2. **The expectation must be an explicit sha.** Bare `--force-with-lease` uses
   the local remote-tracking ref, so a routine fetch re-arms it. Measured: a
   stale environment fetched, then pushed with the bare form, and CLOBBERED a
   live holder with exit 0 and no refusal.
3. **Nonzero does NOT mean "I lost".** A transport failure exits 1 too. The API
   needs three states, with INDETERMINATE resolved by re-reading the ref.

**The best result, and it is stronger than the recommendation claimed:** safety
does not depend on the freshness rule being right. A challenger judged a live,
renewing holder stale and attempted takeover; the CAS refused it. The freshness
rule controls reclaim LATENCY only. And no clock comparison is needed if the
rule is a locally-measured no-change duration over the register: with one
holder's timestamp set a year fast, the timestamp rule (which is what
src/lock.ts does) says "wait forever" while the duration rule proceeds
correctly.

## 9. Standing warning 14 was too narrow, and is generalised

A second, independent instance was measured: `git push --dry-run` reported
`* [new tag]`, `* [new reference]` and `* [new branch]` with exit 0 for three
refs whose real pushes returned HTTP 403. The warning recorded this only for
`--delete`. The rule is now that a dry-run does not probe push AUTHORIZATION at
all. CLAUDE.md is amended.

## 10. The write-block hook: sound for file tools, unsound for Bash

A real plugin with a `PreToolUse` hook refused a working-tree write in a project
clone and permitted a designated ref update, in the same configuration, in real
sessions, with a control proving the write would otherwise have landed.

Three defects found in the same pass:

- **The Bash arm is structurally unsound.** The hook receives a path FIELD for
  the file tools and a STRING for Bash. Two non-exotic constructions got a write
  through, one reproduced end to end. The Bash block belongs in filesystem
  permissions or a mount, not in a hook.
- **A hook that exits 1 does not block.** Any uncaught exception exits 1, so a
  BUGGY write-block is an ABSENT write-block and nothing reports it. The
  acceptance criterion must include a witness that reddens when the hook itself
  is broken.
- **The matcher is an allowlist of tool names**, so any MCP tool taking a path
  falls outside it.

**Not established:** whether `PreToolUse` hooks fire at all under a bypass
permission mode. If they do not, a launch flag defeats the whole block. It is
one run and it must happen before any design depends on the hook.

## What this costs the intake

M4-D-01 and M4-D-11 are answered. M4-D-07's premise is gone and the question
must be re-asked. The write-block phase gains a restated carve-out and loses its
Bash arm. DR-0038's phase gains the aggregation work and a vacuity re-measure.
DR-0039's "enforced by code" is downgraded to "enforced for the environment, and
the environment is not the boundary".

**Six probes ran and four overturned a belief. That ratio is the argument for
running the other prototypes before the phases that depend on them, rather than
planning on desk research.**
