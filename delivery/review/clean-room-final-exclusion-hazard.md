# Clean-room hazard review: exclusion group (final M4 state)

- reviewer contract: hazard (T-007)
- framing: evidence-integrity
- produced-by: see verdict JSON (`produced-by`)
- head reviewed: `ad2428b76ef6f53f75b0d7f94c7db50463e077b7`
- group: exclusion primitives -- `src/lock.ts`, `src/exclusion.ts`, `src/pool.ts`,
  `src/watcher.ts`, `src/teardown.ts`, `src/fleet.ts` (about 5066 lines)
- phases whose criteria touch this group: M1-P3, M1-P5, M4-P16, M4-P17,
  M4-P19, M4-P20, M4-P21, M4-P22
- per DR-0047 this is the ONE approval sweep over the FINAL state, not a
  per-phase review; per DR-0027 every file in this group is `src/`, so the
  full contract applies (dual clean-room review, a MEDIUM or worse blocks)

## Setup and method

Clone at
`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/clone`,
detached at the reviewed head, node confirmed as v26.6.0 in the shell that ran
every command below (`export PATH=/tmp/claude-0/n26/bin:$PATH; node --version`
printed `v26.6.0` before every gate/test invocation in this session).

I read `CLAUDE.md` in full, `delivery/decisions/DR-0027-...md` and
`delivery/decisions/DR-0047-...md`, all 41 filenames in `delivery/tuition/`
(contents of the ones plausibly touching this group read in full: T-003,
T-008, T-009, T-014, T-019, T-025, T-028), the plan sections for M1-P3, M1-P4
(holdership caller), M1-P5's intent, M4-P16, M4-P17 (by citation), M4-P19,
M4-P20 (by citation), M4-P21 and M4-P22 in full including their hazard-class
tables and acceptance criteria, and the work histories
`delivery/work-history/m4-p21.md` and `delivery/work-history/m4-p22.md` in
full.

Then I read every line of the six group files (`src/lock.ts` 939 lines,
`src/exclusion.ts` 969, `src/pool.ts` 1310, `src/watcher.ts` 1024 in large
part, `src/teardown.ts` 623 in the parts touching the exclusion guards,
`src/fleet.ts` 201 in full).

## Suite result -- the complete sentence

Interpreter: node v26.6.0 (`/tmp/claude-0/n26/bin/node`, confirmed in the
invoking shell). Build state: `npm run build` exit 0, `git status --porcelain`
empty afterward (clean). Invocation: `npm test`
(`node --test "test/**/*.test.ts"`).

```
tests 1341
pass 1340
fail 1
cancelled 0
skipped 0
todo 0
duration_ms 494621.244357
```

The one failure is `test/gates.test.ts:3571`, `a precondition command exiting
nonzero is error, not a skip, whenever a path-shaped argv element cannot be
opened...`, failing with `spawnSync /tmp/claude-0/n26/bin/node EACCES` inside
`runCliUnprivileged`. `test/gates.test.ts` is not in this group's PATHS
(`src/lock.ts, src/exclusion.ts, src/pool.ts, src/watcher.ts, src/teardown.ts,
src/fleet.ts`), and the failure signature matches CLAUDE.md standing warning 1
exactly (`/tmp/claude-0` is `drwx------`, an unprivileged spawn of an
interpreter under it gets EACCES). I did not chase this further because it is
outside the group; it is reported here rather than silently dropped, per the
"complete sentence" rule (CLAUDE.md standing warning 12). Every test that IS
in this group's files passed, including both C-2 structural grep tests
(`src/lock.ts contains no process probing and no pid identity`, and the
exclusion-module identity test) and the whole of `test/lock.test.ts`,
`test/cross-environment-lock.test.ts`, `test/pool.test.ts`,
`test/watcher.test.ts`, `test/teardown.test.ts`.

## What I tried to break, and what held

- **C-2 (no pid/process-liveness/signal/proc identity)**: grepped
  `pid`, `process.kill`, `/proc/`, `isAlive`, `kill(`, `signal` (case
  insensitive) across all six files. Every hit is either the word "signal"
  used as file-based wake terminology (`src/watcher.ts`'s `SignalIdentity`,
  a per-turn-end content signature, nothing to do with POSIX signals) or the
  word "signal" inside `src/exclusion.ts`'s own `counter`/`clock` staleness
  vocabulary, which the module's own doc comment explains exists BECAUSE C-2
  forbids process probing (src/exclusion.ts:53-58). HELD. The two structural
  tests (`test/cross-environment-lock.test.ts:312` and the equivalent in
  `test/lock.test.ts`) both carry a witnessed negative control (a grep proven
  capable of catching `hostname` in `src/lock.ts` itself), so the guard is not
  the vacuous kind T-008's postscript warns about.
- **`src/pool.ts`'s `lsof -t` staleness proof for a stranded `index.lock`**
  (src/pool.ts:801, 816-843): this queries the OS for open file-descriptor
  holders of a path, which is liveness-adjacent. It was reviewed and PASSED at
  M1-P3 (`delivery/review/final-review-m1-p3.md:324-328`, C-2 examined and
  marked PASS with the lsof probe named as synchronous, non-backgrounding).
  I re-examined it: it answers "does any process hold this FILE open",
  never "does an orchestrator/holder process exist", it never informs an
  exclusion or identity decision (only a git-lock retry), and its failure mode
  is fail-safe (any uncertainty leaves the lock in place and fails loudly,
  src/pool.ts:816-820). Not a new finding; recorded as re-examined and
  cleared rather than silently skipped.
- **C-1 (no reading current state from an append-only log tail)**: grepped
  for tail-reading patterns and confirmed by reading `src/watcher.ts`'s own
  docs (state/last-wake.json is written, never read back, src/watcher.ts:58-60)
  and `src/fleet.ts` (task currency comes only from `meta.json` and the
  turn-end file). HELD.
- **T-003 (a lease test with no real contention is worthless)**: read every
  concurrency test in `test/lock.test.ts` and
  `test/cross-environment-lock.test.ts`. The ones with "concurrent" in the
  name launch real parallel `spawnSync` CLI invocations or overlapping async
  calls against one lock file / one register ref and assert exactly one
  winner (e.g. "five concurrent lock acquires yield exactly one winner",
  "a renew and a takeover staged against the same lease serialize to exactly
  one winner"). Contention is FORCED by racing real filesystem/git operations,
  not simulated. HELD for the paths these tests cover.
- **The MAIN THING I found does not fail an existing test.** It is a path no
  criterion and no test asks about at all: what happens when the SHARED
  register publish (`sharedCommit`, src/lock.ts:543-566) loses its
  compare-and-swap AFTER the local half of a `renew` or a `release` has
  already won. See Finding F-1 below. This is the composition hazard the
  sweep instructions describe: a criterion satisfied when M1-P3 landed (three
  milestones before the shared layer existed), silently invalidated by M4-P21
  composing a second mutation onto the same call.

## Finding F-1 (HIGH): a lost register publish during `renew` or `release`
leaves the local lease and the shared register permanently disagreeing, and
the SAME environment that caused it cannot repair it without waiting out the
stale window

### The mechanism (not just the instance)

`src/lock.ts`'s own comment on `sharedCommit` states the invariant the whole
two-layer design depends on:

> "Called only AFTER the local mutation succeeded, so the two layers agree
> or the local one is rolled back by the caller: a register entry with no
> local lease behind it would exclude every environment including the one
> that wrote it." (src/lock.ts:537-541)

`acquireLease` (src/lock.ts:602-708) honors this: if the local mutation wins
and the register publish (`sharedCommit`) then loses, it rolls the local
lease back to absent through a second call to `applyLeaseMutation`
(src/lock.ts:684-690) before returning failure.

`renewLease` (src/lock.ts:726-818) and `releaseLease` (src/lock.ts:836-916)
do NOT. Both perform the local mutation first
(`applyLeaseMutation`, src/lock.ts:783 and src/lock.ts:878), and if the
subsequent `sharedCommit` call then loses its compare-and-swap, both simply
return `{ ok: false, reason: ... }` (src/lock.ts:800-807 for renew,
src/lock.ts:898-905 for release) with **no attempt to undo the local
mutation that already landed**. The invariant the module's own comment
states is upheld by exactly one of its three callers.

The CLI (`src/commands/lock.ts:246-284`) does not compensate: `renew` and
`release` both just check `outcome.ok` and print the failure reason
(`failure(outcome)`); neither inspects or reports what the local lease file
now actually contains.

### The two concrete consequences, both reproduced against the real code

**Release**: a `release` whose local half wins and whose register publish
loses leaves the LOCAL lease gone (the file is unlinked) while the REGISTER
still reports this exact environment as `held`. Because the register's
`acquire` path refuses whenever `held && !stale` regardless of who is asking
(src/exclusion.ts:690-701), this SAME environment cannot re-acquire its own
fleet -- not even with `--take-over`, since the stale check is evaluated
before the takeover flag is even consulted (src/exclusion.ts:690-713) -- until
`staleWindowSeconds` (default 900s) elapses on its own clock. There is no
retry path: a second `release` call sees the local lease already absent and
refuses immediately with "release refused: no lease present"
(src/lock.ts:863-865) before ever reaching the register again. The register
never gets corrected.

**Renew**: a `renew` whose local half wins (new `expiresAt`, new `token`
written to the lease file) and whose register publish loses returns
`{ ok: false, reason: "shared exclusion refused renew: ..." }` to the caller
-- reported as a FAILURE -- while the local lease file has, in fact, already
been extended to a new expiry under a new token. A caller (an operator, or a
future automated renewal loop implied by the module's own "the holder renews
at or before half-life" discipline, src/lock.ts:93-96) that treats `ok: false`
as "my renewal did not happen" is wrong about the state of its own lock file.

### Reproduction

Both were reproduced directly against the compiled behavior of this exact
head's `src/lock.ts` and `src/exclusion.ts` (imported as modules, not
reimplemented), using a real bare git remote and the module's own exported
primitives (`preflightShared`, `applyLeaseMutation`, `casWrite`) staged to
force the exact race window between the local mutation and the register
publish -- the same two-phase sequence `renewLease`/`releaseLease` execute
internally, just with a concurrent register write interleaved between the
phases (mirroring a retried renew, a second command instance, or ordinary
contention against the shared remote):

Release repro
(`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/repro/repro.mjs`),
captured output:

```
LOCAL RELEASE RESULT: {"won":true}
RELEASE PUBLISH OUTCOME (expected: lost): {"kind":"lost","reason":"! [rejected]        3c3ba580fbf38eb91fa5ae3a810b64a73b0c53fd -> tiphys/lease (stale info)"}
LOCAL LEASE AFTER (expected: absent): {"kind":"absent"}
REGISTER AFTER (expected: still HELD by this env): {"kind":"present", ... "document":{"state":"held","envId":"7463c248-8df8-4933-9c5e-23a31989fbd8", ...}}
RE-ACQUIRE ATTEMPT BY THE SAME ENVIRONMENT (expected: refused): {"ok":false,"reason":"shared exclusion refused acquire: register refs/heads/tiphys/lease is held by environment 7463c248-8df8-4933-9c5e-23a31989fbd8 until 2026-09-18T12:34:57.397Z; signal=counter, fencing counter 3 has stood still for 0ms of the 900000ms this environment requires, and no clock comparison was made", ...}

=== VERDICT ===
local lease present: false
register still reports held: true
register holder is THIS environment: true
re-acquire by this same environment succeeded: false
```

Renew repro
(`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/repro2/repro-renew.mjs`),
captured output:

```
LOCAL RENEW RESULT: {"won":true}
RENEW PUBLISH OUTCOME (expected: lost): {"kind":"lost","reason":"! [rejected]        5a34e16d99f695e58a126af4859612dd28323f08 -> tiphys/lease (stale info)"}
WHAT THE CALLER SEES: {"ok":false,"reason":"shared exclusion refused renew: the compare-and-swap on refs/heads/tiphys/lease was lost: ...; signal=counter"}

=== VERDICT ===
caller was told ok: false
local lease token now: renew-token-xyz (new token means the local mutation DID land)
local lease expiresAt advanced: true
DIVERGENCE: caller sees failure while local state already advanced: true
```

Both scripts are still present at the paths above for re-execution.

### Why this is reachable, per DR-0027's reachability test

This is not confined to the "genuinely unrehearsable" half M4-P22 already
names (a real second machine, a real clock, GitHub's real ref-update
ordering, criterion 5). The race I forced is ORDINARY contention against one
shared remote: any two writers to the register ref within the same
narrow window reproduces it, including two invocations from the SAME
environment (a retried CLI call after a timeout, a watchdog re-issuing
`lock renew` because the first attempt appeared to hang). The feature is
opt-in (`tiphys.sharedExclusion` in the fleet's `package.json`), but once a
fleet opts in -- which is the fleet's entire reason to declare the field --
this is squarely the path DR-0027 calls a real user path: it runs through
the shipped `tiphys lock renew` / `tiphys lock release` commands with no
flag or test-only seam involved.

### Composition angle (why a per-phase review could not have found this)

M1-P3 (2+ milestones before the shared layer existed) shipped acceptance
criterion 4: **"every failing renew leaves the file byte-identical"**
(delivery/plan/kernel-plan-v1.md, M1-P3 criterion 4). That was true and
tested at the time -- M1-P3 owned no shared layer, so every failing renew
really was a pure local refusal with the file untouched. M4-P21 composed a
second, independent mutation (the register publish) onto the SAME renew call
without preserving that guarantee: with `sharedExclusion` declared, a
"failing" renew (from the caller's point of view: `ok: false`) now very much
does NOT leave the file byte-identical -- it leaves it advanced. Neither
M4-P21's own acceptance criteria (which test criterion 8, "release... is
refused and the register sha is byte-identical", only for the NON-HOLDER
case) nor M4-P22's criteria exercise the holder's-own-release-or-renew
publish-loss arm. The M4-P21 work history's own residue list (item 9,
`delivery/work-history/m4-p21.md:428-431`) documents a narrower, adjacent gap
-- that ACQUIRE's rollback can itself fail and that failure is not handled --
but never states that RENEW and RELEASE have no rollback attempt in the
first place. This finding is therefore new: not previously identified by
either phase's own review, and it is exactly the shape DR-0047's final sweep
exists to catch (a criterion satisfied when it landed, silently broken by a
later phase's composition on top of it).

### Concrete fix

Give `renewLease` and `releaseLease` the same discipline `acquireLease`
already has: on a lost or indeterminate `sharedCommit` after a won local
mutation, roll the local lease back to its pre-mutation observed state (the
original bytes for renew; re-create the original lease document for release)
through a second `applyLeaseMutation` call with a fresh token, exactly as
`acquireLease` does at src/lock.ts:684-690, and only then return failure. The
existing residue item 9 (a failed rollback is itself unhandled) then applies
uniformly to all three operations rather than only to acquire, which is a
smaller, already-acknowledged residue rather than a silent gap.

## Hazard classes addressed

See the verdict JSON's `hazard-classes-addressed[]` for the structured form.
In prose:

- **H-B** (a guard whose condition does not test the property that matters):
  Finding F-1. The module's own stated invariant ("the two layers agree or
  the local one is rolled back") is not tested against the renew/release
  arms, and nothing reddens when it is violated.
- **H-C** (a green bundle read as a gate-level assertion): cleared for this
  sweep. Every suite number above is quoted from the `node --test` summary
  directly, not from a bundle-level gate report, and the one failure present
  is named rather than absorbed.
- **H-D** (a guard shipped without its carve-out gets switched off): related
  to F-1 but not filed separately -- the ACQUIRE path's carve-out (rollback)
  was correctly shipped; what is missing is that the same carve-out was never
  extended to the two siblings sharing its invariant.
- **H-E** (the path that cannot be rehearsed is the one that fails): cleared,
  with a correction. M4-P22 criterion 5 correctly names GitHub's real
  ref-ordering as unrehearsable, but F-1's race is NOT confined to that
  unrehearsable half -- it reproduces against a local bare-repository CAS
  race, which is exactly the kind of thing the phase's own criteria 4/5
  witnesses already rehearse for the ACQUIRE path. The gap is that the
  equivalent race was never rehearsed for RENEW or RELEASE.
- **H-J** (an agent-shaped payload breaks assumptions a subprocess never
  tested): cleared for this group. M4-P16/M4-P17/M4-P19's reclaim-shaped
  hazards (a live worktree, a missing pool record, a dirty reconstructed
  worktree) are all criteria with red witnesses I read and spot-checked
  against the shipped code; I found no new gap here.
- **H-K** (measuring the wrong configuration): cleared, addressed by this
  document's "complete sentence" suite section above.

## Criteria walked

See the verdict JSON's `criteria[]`. Two are walked in full because they are
the ones Finding F-1 falsifies or narrows:

- M1-P3 criterion 4 ("every failing renew leaves the file byte-identical"):
  MET as a pure-local statement (verified by `test/lock.test.ts`'s renew
  tests, all passing), but the composed system (M1-P3 + M4-P21) no longer
  satisfies the plain reading of this sentence once `sharedExclusion` is
  declared. Recorded as met-with-a-composition-caveat rather than silently
  passed or silently failed, since the criterion's own text was never
  amended to scope out the shared-layer case.
- M4-P21 criterion 8 ("Release goes through the same compare-and-swap. A
  release attempted by a non-holder is refused and the register sha is
  byte-identical before and after."): MET exactly as worded -- it only
  claims something about the non-holder arm, which is real and tested
  (`a release by a non-holding environment is refused and the register sha
  is byte-identical`, passing). The criterion simply never asked about the
  holder's-own-release-publish-loss arm, which is where F-1 lives.

Other acceptance criteria for phases in this group were spot-read against
the shipped code and their own passing tests (C-2's structural grep,
takeover-vs-renew serialization, the four red witnesses of M4-P16, the CAS
probe of M4-P20) rather than walked exhaustively one by one in this
document; the hazard contract directs effort at composition and the class
tables rather than at a full per-criterion re-derivation DR-0027 already
narrows away from ceremony. Not reached: a live rehearsal against a second
real machine and a real GitHub remote (M4-P22 criterion 4/5's own
unrehearsable half) -- I did not have a second environment to rehearse
against, and I say so rather than asserting I covered it.

## Negative control on my own instrument

Before finalizing, I validated the verdict JSON against
`schemas/verdict.schema.json` with the kernel's own validator:

```
$ node bin/tiphys.ts validate --type auto /tmp/claude-0/final-sweep/verdict-final-exclusion-hazard.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
(exit 1; the SKIPPED lines are the Kind B derived checks that need --context
to compare against the plan/work-history, per src/commands/validate.ts's own
exit-code contract: "1 = at least one violation, OR a derived check that
could not run". Zero schema-level INVALID diagnostics were printed for this
document.)
```

Then I copied the document, flipped `verdict` to `APPROVE` while `findings[]`
still contained the `high`-severity F-1 entry, and re-ran the validator:

```
$ node bin/tiphys.ts validate --type auto /tmp/negative-control.json
INVALID # value does not satisfy the requirements its own shape triggers here
INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"
(exit 1)
```

The instrument goes red on the mutant and produces zero such lines on the
real document: the negative control held.

## Verdict

**FIX-ROUND-NEEDED.** Finding F-1 is HIGH: it is reachable through the
shipped `tiphys lock renew` / `tiphys lock release` commands with no
test-only flag, it silently violates the two-layer design's own stated
invariant, it defeats the shared-exclusion layer's whole purpose (an
environment can end up excluded from its own fleet, or believe a renewal
failed when it did not), and DR-0012 condition 2 bars an unresolved
high-or-medium finding from an APPROVE regardless of how the merge already
happened under DR-0047's deferred-sweep arrangement.

## The JSON verdict, embedded rather than landed

This verdict reads FIX-ROUND-NEEDED. `check-dual-review` reads the TOP LEVEL of
`delivery/review/` non-recursively as its corpus, so landing this as its own
`verdict-*.json` there would correctly turn that gate red. It is embedded here
instead, so the evidence lands without the gate reading a committed verdict.

```json
{
  "kind": "verdict",
  "phase": "M1-P3",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "claude-sonnet-5",
  "framing": "evidence-integrity",
  "review-contract": "hazard",
  "findings": [
    {
      "id": "F-1",
      "severity": "high",
      "evidence": [
        "src/lock.ts:537-541 states the invariant: 'the two layers agree or the local one is rolled back by the caller'",
        "src/lock.ts:684-690 (acquireLease) rolls the local lease back on a lost sharedCommit; src/lock.ts:783-807 (renewLease) and src/lock.ts:878-905 (releaseLease) do not, on the same lost-sharedCommit arm",
        "src/commands/lock.ts:246-284 forwards outcome.ok to the operator with no inspection of the local lease file's actual post-mutation content",
        "reproduction transcript, release: /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/repro/repro.mjs, captured output shows LOCAL LEASE AFTER: absent, REGISTER AFTER: still held by this environment, RE-ACQUIRE ATTEMPT BY THE SAME ENVIRONMENT: refused",
        "reproduction transcript, renew: /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/repro2/repro-renew.mjs, captured output shows WHAT THE CALLER SEES: ok:false while local lease token/expiresAt already advanced (DIVERGENCE: true)",
        "M1-P3 acceptance criterion 4 ('every failing renew leaves the file byte-identical', delivery/plan/kernel-plan-v1.md) is falsified by the composed system once tiphys.sharedExclusion is declared",
        "M4-P21 acceptance criterion 8 (delivery/plan/kernel-plan-m4.md:3033-3034) only tests the non-holder release arm; the holder's-own-publish-loss arm is untested by any criterion in M4-P21 or M4-P22",
        "delivery/work-history/m4-p21.md:428-431 documents a narrower adjacent residue (acquire's own rollback can itself fail) but never states renew/release lack a rollback attempt at all",
        "npm test at this head: tests 1341, pass 1340, fail 1, skipped 0 (node v26.6.0, dist/ built, invocation `npm test`); the one failure is test/gates.test.ts:3571, outside this group's files, matching CLAUDE.md standing warning 1's /tmp/claude-0 EACCES trap"
      ],
      "concrete-fix": "In src/lock.ts, give renewLease and releaseLease the same rollback acquireLease already performs at src/lock.ts:684-690: on a lost or indeterminate sharedCommit after the local applyLeaseMutation already won, issue a second applyLeaseMutation call that restores the local lease to its pre-mutation observed state (the original lease bytes for renew; the original present lease document for release) under a fresh token, and only then return { ok: false }. Register a red-witness test per operation, structurally mirroring the existing acquire-rollback tests, that forces the register CAS to lose after the local mutation has already won and asserts the local lease file is byte-identical to its pre-call state afterward."
    }
  ],
  "criteria": [
    {
      "id": "m1-p3-criterion-4",
      "quote": "lock renew by the holding holderId on an unexpired lease exits 0 and strictly increases expiresAt; lock renew on an expired lease exits nonzero even when holderId matches (EXT-F-01 witness: paused-holder renewal after expiry fails); lock renew with a non-matching holderId exits nonzero; every failing renew leaves the file byte-identical.",
      "evidence": [
        "test/lock.test.ts's renew tests all pass at this head (npm test: tests 1341, pass 1340, fail 1 unrelated to this group)",
        "As a pure-local statement (no tiphys.sharedExclusion declared) the criterion holds: renewLease's local-only failure arms (expired, holder mismatch) never call applyLeaseMutation at all, so the file is untouched",
        "Once tiphys.sharedExclusion is declared, a renew that wins locally and then loses the register publish returns ok:false (a 'failing renew' from the caller's point of view) while the file is NOT byte-identical: reproduction at /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/repro2/repro-renew.mjs shows the local token and expiresAt advanced"
      ],
      "met": true
    },
    {
      "id": "m4-p21-criterion-8",
      "quote": "Release goes through the same compare-and-swap. A release attempted by a non-holder is refused and the register sha is byte-identical before and after.",
      "evidence": [
        "test 'a release by a non-holding environment is refused and the register sha is byte-identical' passes at this head",
        "test 'a release by the holding environment advances the register to free through the same compare-and-swap' passes at this head",
        "The criterion's text names only the non-holder arm and the holder's normal-success arm; it does not name the holder's release-succeeds-locally-then-loses-the-publish arm, which is where Finding F-1 lives and which no test in test/cross-environment-lock.test.ts exercises",
        "reproduction: /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/repro/repro.mjs"
      ],
      "met": true
    }
  ],
  "deviations-judged": [],
  "hazard-classes-addressed": [
    {
      "class-id": "H-B",
      "probed": "Read src/lock.ts's own stated cross-layer invariant (src/lock.ts:537-541) and checked whether each of the three callers of sharedCommit (acquireLease, renewLease, releaseLease) upholds it on a lost publish. Confirmed by direct code reading that only acquireLease does, then forced the divergent arm for renewLease and releaseLease with two live reproductions against a real bare git remote (casWrite racing the register between the local mutation and the publish), captured at /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-hazard/repro/repro.mjs and .../repro2/repro-renew.mjs.",
      "finding": "F-1"
    },
    {
      "class-id": "H-C",
      "probed": "Quoted the node --test summary's own printed pass/fail/skipped counts directly from this session's captured run (tests 1341, pass 1340, fail 1, skipped 0) rather than a bundle-level gate report, and named the one failing test explicitly rather than folding it into an aggregate green/red.",
      "cleared-because": "Every number in this review's suite section is a direct quote of the test runner's own summary block for this exact invocation at this exact head; no gate-bundle abstraction was interposed between the evidence and the claim."
    },
    {
      "class-id": "H-D",
      "probed": "Checked whether the shared-exclusion layer's fail-closed carve-out (present for acquire: refuse before any local write, and roll back on publish loss) was extended uniformly to renew and release, which share the same cross-layer invariant.",
      "finding": "F-1"
    },
    {
      "class-id": "H-E",
      "probed": "Read M4-P22 criterion 5's own statement of what is unrehearsable (a second real machine, a real clock, GitHub's real ref-update ordering) and checked whether Finding F-1's race requires any of those. It does not: it reproduces against one bare local git remote with two writers, which is the same shape M4-P21's own group-3/group-4 witnesses already rehearse for the acquire and takeover arms.",
      "cleared-because": "F-1 is filed under H-B/H-D rather than H-E because its race is rehearsable with ordinary local tooling; the genuinely unrehearsable half (a real second machine, a real GitHub remote, GitHub's own ref-update ordering under concurrent pushes) remains correctly named as such by M4-P22 criterion 5 and I did not attempt to rehearse it myself, having no second real environment available in this review."
    },
    {
      "class-id": "H-J",
      "probed": "Read M4-P16's four red-witness criteria (live worktree survival, half-rebuilt-state resume), M4-P17's post-reclaim doctor report criteria, and M4-P19's reconstructed-record teardown criteria (dirty worktree refusal, unlanded-branch refusal) against src/pool.ts and src/teardown.ts, checking each guard's condition against the dangerous state it claims to redden against.",
      "cleared-because": "Each of these criteria's guard condition matches the property its own hazard-table row claims (verified by reading the guard code alongside its criterion text); I found no new agent-shaped-payload gap in this group beyond what is already named and tested by these phases' own red witnesses."
    },
    {
      "class-id": "H-K",
      "probed": "Recorded interpreter version, build state, invocation, and skipped count together for the one suite run in this review, and investigated the single failing test's signature against CLAUDE.md's documented environment traps before attributing it to this group.",
      "cleared-because": "The one failure present (test/gates.test.ts:3571) is outside this group's files and matches a documented, unrelated environment trap (CLAUDE.md standing warning 1's /tmp/claude-0 permission trap for an unprivileged spawn of a scratch-prefix interpreter); it is reported rather than silently omitted, but it is not evidence of a defect in this group."
    }
  ]
}

```
