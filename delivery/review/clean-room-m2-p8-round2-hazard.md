# Clean-room DELTA re-review (hazard lens): M2-P8 fix round one

Subject: branch `claude/m2-p8-credential-scoping` at head `bc09a3d` (SECURITY / credential scoping)
Re-reviewer: hazard lens, delta over CR-1470 findings.
Verdict: PENDING

## Progress log
- WORKDIR established.
- Branch fetched; head confirmed `origin/claude/m2-p8-credential-scoping` = `bc09a3d26516a07e28cbea82e2f4ce8a45e43783`, checked out detached. Current with origin/main (origin/main `8439c88` is ancestor; 0 behind, 13 ahead).
- Read CLAUDE.md, MECHANISMS.md, arbitration-m2-p8.md, clean-room-m2-p8-hazard.md (prior CR-H1 medium + O1 low).
- Fix-round code commit: `2de97e4`. Both fixes present in source:
  - CR-H1: `DANGEROUS_ENV_VOCABULARY` walk + `isDangerousEnvName` + `git-resolved-config` behavioral probe (source 5) added to `src/gates/credentials.ts`; module comments corrected in both credentials.ts and env.ts.
  - O1: `buildChildEnv` now `rmSync`+`mkdirSync` re-empties directory targets in `src/exec/env.ts`.
- Next: set up floor toolchain, run gates, then construct independent attacks.

## Gates (floor toolchain node v26.6.0, npm 11.18.0, first on PATH)
- `npm ci`: exit 0 (4 packages, 0 vulnerabilities; no EBADENGINE on floor).
- `npm run build`: exit 0; `git status --porcelain` after build: CLEAN.
- Full suite: running (real-clock watcher/liveness family slow); interim below.

## CR-H1 (prior MEDIUM) verification -- CLOSED at the mechanism

### Mechanism, as fixed
- `src/gates/credentials.ts:152-172` adds `DANGEROUS_ENV_VOCABULARY` (GIT_ASKPASS,
  GIT_SSH_COMMAND, GIT_PROXY_COMMAND, GIT_CONFIG_COUNT, SSH_ASKPASS, NODE_OPTIONS,
  NODE_EXTRA_CA_CERTS, LD_PRELOAD, BASH_ENV, ENV) + `isDangerousEnvName` matching
  the numbered `GIT_CONFIG_(KEY|VALUE)_\d+` family (`:170`).
- `src/gates/credentials.ts:271-307`: environment probe now has THREE arms; the
  first two (gh tokens, dangerous vocabulary) are allowlist-INDEPENDENT and fire
  even on a permitted name. The dangerous arm precedes the (tautological-in-prod)
  stray arm.
- `src/gates/credentials.ts:399-443`: new behavioral source `git-resolved-config`
  runs `git config --get-all credential.helper` with NO scope flag, from the
  child's redirected HOME. Catches env-injected helpers the scoped probes miss.

### Independent attack table (my own scripts, floor toolchain, gh-free PATH)
attack-widen.mjs -- admit each name to the allowlist AND place in child env:

| Admitted name | env probe | verdict |
|---|---|---|
| GIT_ASKPASS | resolvable | RED |
| NODE_OPTIONS | resolvable | RED |
| GIT_SSH_COMMAND | resolvable | RED |
| GIT_CONFIG_COUNT | resolvable | RED |
| GIT_CONFIG_KEY_0 | resolvable | RED |
| GIT_CONFIG_VALUE_0 | resolvable | RED |
| LD_PRELOAD | resolvable | RED |
| SSH_ASKPASS | resolvable | RED |
| GIT_PROXY_COMMAND | resolvable | RED |
| NODE_EXTRA_CA_CERTS | resolvable | RED |
| BASH_ENV | resolvable | RED |
| ENV | resolvable | RED |

All twelve redden even when admitted to the allowlist. The numbered KEY_0/VALUE_0
members redden via the regex, confirming the family (not just the trigger name) is
covered. CR-H1's seven named GREEN cases are now all RED.

### Env-injection behavioral probe (attack-inject.mjs)
Real git ground truth under GIT_CONFIG_COUNT=1/KEY_0=credential.helper/
VALUE_0=!echo password=PR_CAPABLE_TOKEN, empty redirected global+system:
- no-scope `git config --get-all credential.helper`: exit 0, resolves the helper.
- `--global`: exit 1 (sees nothing). `--system`: exit 1 (sees nothing).
Gate probes over the same env:
- git-global-config: clean (MISS). git-system-config: clean (MISS).
- git-resolved-config: RESOLVABLE (CATCH). environment: resolvable (name tripwire
  also fires). VERDICT: red.
So the behavioral probe catches the env-injected helper the scoped probes
structurally miss, exactly as the arbitration prescribed. Defense in depth: both
the vocabulary tripwire and the behavioral resolver redden it.

### RESIDUE judgment (disclosed bound is ACCEPTABLE)
attack-widen.mjs residue block -- credential/exec-capable names OUTSIDE the walked
vocabulary (GIT_EXTERNAL_DIFF, GIT_PAGER, GIT_EDITOR: git runs each as an
arbitrary program):

| Name | admitted to allowlist? | env probe | verdict |
|---|---|---|---|
| GIT_EXTERNAL_DIFF | YES | clean | GREEN (residue) |
| GIT_EXTERNAL_DIFF | NO | resolvable (stray) | RED |
| GIT_PAGER | YES | clean | GREEN (residue) |
| GIT_PAGER | NO | resolvable (stray) | RED |
| GIT_EDITOR | YES | clean | GREEN (residue) |
| GIT_EDITOR | NO | resolvable (stray) | RED |

This is the disclosed residue and it is bounded exactly as the module comment
(credentials.ts:56-64) and env.ts:57-77 state: the tripwire is a BOUNDED denylist,
the allowlist is the real defense. Triggering the residue requires an implementer
to BOTH wrongly widen the shipped allowlist AND pick a name outside the walked
vocabulary. When not admitted, the name is a stray and the gate reddens; the
shipped allowlist admits none of them (verified leak-free below). This matches
MECHANISMS.md's denylist tier ("Name what remains unguarded rather than chasing
it"). The disclosure is honest (module comment states the residue plainly rather
than overclaiming) and the bound is acceptable. NOT a regression -- it is a
correct, narrowed restatement of what the prior review already found (the whole
class was green before; now only a walk-external + allowlisted name is).

## O1 (prior LOW) -- CLOSED
`src/exec/env.ts:199-228`: directory targets are now `rmSync(recursive,force)` then
`mkdirSync` (re-emptied), matching the file targets. attack-o1.mjs seeded leftover
store files (and nested dirs) into all three directory targets + populated both
file targets, rebuilt with the same scrubDir, and confirmed ALL targets empty
after rebuild (RESULT: PASS -- all targets re-emptied).

## Shipped allowlist UNCHANGED and leak-free
- `git diff af56782..bc09a3d -- src/exec/env.ts` adds NO allowlist entries.
- `DEFAULT_CHILD_ENV_ALLOWLIST` = PATH, TMPDIR, locale (LANG..LC_TIME),
  TIPHYS_EXIT_TEST_* contract, command-scoped GIT_AUTHOR_*/GIT_COMMITTER_* only.
  No credential store, no code-exec channel.
- attack-leak.mjs: 26 smuggling channels set in parent (GH_TOKEN family,
  NODE_OPTIONS, LD_PRELOAD, GIT_ASKPASS, GIT_CONFIG_COUNT family, SSH_*, NETRC,
  AWS_*, npm_config_*, GH_HOST, ...). buildChildEnv result: only PATH/TMPDIR/LANG/
  GIT_AUTHOR_* cross; all 5 pointers redirected into scrub root; LEAKED: NONE.

## M2-P1 integration intact
- credential-scrub record well-formed: status green, units 7 (a REAL source was
  added -- git-resolved-config -- so units rose 6->7, not a name-count tautology),
  unitLabel "credential sources probed", evidence probes.json.
- credential-token absent-token: status not-applicable, exit 20, detail names
  owner action A-3 (DR-0004 item 4), "never reports green in this state". Naming
  A-3 confirmed.
- credential-scrub usage error exits 64 (matches credential-gate-usage-errors).

## Red-witness quality of the new tests
- `credential-scrub-widened-allowlist-vocabulary-tripwire`: TWO structurally
  different members (GIT_ASKPASS git-askpass-exec, NODE_OPTIONS node-loader);
  asserts env probe resolvable + verdict red; states pre-fix green. Satisfies the
  class-needs-two-members rule.
- `credential-scrub-env-injected-helper-resolved`: captures REAL git output
  (matches /PR_CAPABLE_TOKEN/), asserts scoped probes clean and behavioral probe
  resolvable; states pre-fix source absent. Anchored to real captured output per
  the strong red-witness form.
- `child-env-directory-target-re-emptied`: three structurally different directory
  targets seeded; states pre-fix mkdir-only survives.
Three behaviors registered in test/behaviors.json.

## Scope
- Files changed in fix-round code commit 2de97e4: src/exec/env.ts,
  src/gates/credentials.ts, test/behaviors.json, test/credentials-gate.test.ts.
  All on the P8 files-to-touch set + standing extras (behaviors.json registry).
  Work-history commits touch delivery/work-history/m2-p8.md only. No stray files.

## Full floor suite (node v26.6.0 first on PATH) -- COMPLETE
- REAL_EXIT: 1. ~230 tests pass; 3 distinct failures, ALL in untouched files:
  - test/watcher.test.ts:419 "the heartbeat schedule is on disk and shared by
    single passes" (0 !== 3)
  - test/watcher.test.ts:269 / :500 "a resident watcher keeps running and backs
    off with growing beacon gaps" / "a resident watcher and a concurrent single
    pass never both surface a wake"
  - test/liveness.test.ts:633 "doctor and the guard return one verdict about one
    beacon"
- These are the documented watcher/liveness real-clock family (CLAUDE.md warning
  11), aggravated by extreme host load: loadavg 32 on 4 cores (8x
  oversubscription), 21 concurrent `node --test` from sibling review agents;
  single tests took 10-21s. The diff touches none of watcher.ts / watcher.test.ts
  / liveness.ts / liveness.test.ts / doctor.ts.
- ALL THREE new fix-round tests PASS in this run:
  - "a leftover store file in a redirected directory target does not survive the
    next buildChildEnv" (O1) -- PASS
  - "a widened allowlist admitting a git or node credential/exec variable still
    reddens the environment probe via the walked vocabulary tripwire" -- PASS
  - "a credential.helper injected via the GIT_CONFIG_COUNT family is caught by the
    no-scope git resolution probe..." -- PASS
- No credential/env/scrub/spawn test among the failures. No regression
  attributable to the fix round.

## Default-toolchain note
Per CLAUDE.md, the default toolchain (node v22.22.2) skips floor-gated tests and
CI on Node 26 is the authority; the floor run above is the authoritative gate.
The work history records both-toolchain evidence (commit bc09a3d).

## M1 exit test --mode local (floor toolchain first on PATH)
- First run: EXIT_TEST_RC 1. It FAILED at step A1 (which runs the kernel's own
  `npm test`), on test/watcher.test.ts:419 and :500 -- the SAME watcher real-clock
  flakes (heartbeat cadence "heartbeat 1" vs expected 2+; concurrency wake race),
  under the 8x-oversubscribed host. The run died at A1 BEFORE reaching the
  scrub-exercising spawn steps (A6+), so this is not a scrub regression; it is the
  untouched watcher/liveness flake family blocking step A1's npm test.
- Retry (best-effort clean witness): re-ran under sustained load 28-32; again
  stuck at A1 (kernel npm test) with no progress, will re-flake on the same
  untouched watcher tests. Not waited to completion (T-008 wall-clock rule): the
  cause is established and non-attributable.
- Nature of the flakes CONFIRMED by reading the tests:
  - watcher.test.ts:419 does `await sleep(500)` against `--interval 0.4` and asserts
    a heartbeat COUNT: inherently real-clock, load-sensitive.
  - watcher.test.ts:500 is self-labelled in its own comment "a real race and its
    result is reported as a rate, not as a proof": under oversubscription both
    racers can surface a wake and the `onceSurfaced !== residentSurfaced` assert
    fails.
- The fix round changed nothing in the spawn launch path the exit test exercises:
  buildChildEnv's set of names that cross and pointers that redirect is unchanged;
  the only env.ts change is re-emptying directory targets (rmSync+mkdirSync, force),
  which attack-o1.mjs exercised across two builds without error. The prior criteria
  contract already ran the exit test end-to-end under the scrub at the prior head.
- CI on Node 26 (a non-oversubscribed runner) is the authority for the real-clock
  family and remains the standard DR-0012 merge condition; a green run there is
  required before merge, as for every phase.

## VERDICT: APPROVE
CR-H1 (medium) is closed at the mechanism and O1 (low) is closed, both verified
with independent attacks. No new high or medium finding. The full-suite and
M1-exit-test non-zero exits are the documented watcher/liveness real-clock flake
family in UNTOUCHED files, triggered by 8x host oversubscription, not regressions
from this fix round; every credential/env/scrub test passes. One residual item is
a bounded, honestly-disclosed residue (a credential/exec-capable name outside the
walked vocabulary, if wrongly admitted to the allowlist, passes the env probe;
the allowlist is the real defense), which is acceptable per MECHANISMS.md's
denylist tier.

### Findings by severity
- HIGH: none.
- MEDIUM: none. (CR-H1 closed.)
- LOW: none blocking. O1 closed. Disclosed residue is acceptable, not a finding.
- OBSERVATION (non-blocking): local full-suite and M1 exit test cannot reach
  exit 0 while the host is 8x oversubscribed by sibling agents; this is a harness
  environment condition, not a defect. CI on Node 26 is the authority.
