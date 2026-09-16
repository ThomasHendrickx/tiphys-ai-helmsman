# Cross-environment exclusion: the double-acquire witnesses and the compare-and-swap probe

- phase: M4-P20
- date: 2026-09-16
- subject: M4-D-11, which the intake records as PROTOTYPE-BLOCKED, and the
  dangerous state the M4 plan's section 4.2 names at
  delivery/plan/kernel-plan-m4.md:2886
- toolchain for every capture below: git version 2.43.0, node v22.22.2 at
  `/opt/node22/bin/node`, on the container this repository is built in
- transliteration: none. Every captured block below was checked for non-ASCII
  and control bytes before being pasted, and zero substitutions were required.
  This is recorded because the check ran, not because it found anything.

## What was measured, in one paragraph

Two environments that clone one fleet remote each get their own
`state/orchestrator.lock`, and BOTH acquire it. That is not a defect in the
lease: src/lock.ts:63 declares its exclusion domain as one filesystem and one
clock and explicitly does not claim cross-environment exclusion. The lease
artifact cannot travel because `state/` is in the gitignored set at
src/fleet.ts:28. Separately, a git ref driven by `git push --force-with-lease`
IS a real compare-and-swap, and the BARE form of that flag is VACUOUS in two
different ways while the EXACT-SHA form is not.

## 1. The dangerous state, measured (criteria 4 and 5)

Captured by running the two members against today's code. Both members build a
real fleet home with the kernel's own `init`, publish it to a bare repository,
and clone it, so the `.gitignore` that makes the lease untravelable is the
kernel's rather than the harness's.

```
git: git version 2.43.0
node: v22.22.2
scratch root: /tmp/m4p20-evidence-HfNFeA

== MEMBER A: two clones of one fleet remote, acquiring at once ==
  origin(env-a) = /tmp/m4p20-evidence-HfNFeA/fleet.git
  origin(env-b) = /tmp/m4p20-evidence-HfNFeA/fleet.git
  head(env-a)   = 952461c991193eddd353efb6fc4c35a19946de1f
  head(env-b)   = 952461c991193eddd353efb6fc4c35a19946de1f
  precondition: state/ present in env-a before mkdir? false
  precondition: state/ present in env-b before mkdir? false
  env-a acquire ok=true holderId=e4fd8d66-b618-4061-9532-2fde2ad3cf14
  env-b acquire ok=true holderId=5a95d71e-c039-44cb-850f-e091d7dcada3
  env-a lock file on disk: e4fd8d66-b618-4061-9532-2fde2ad3cf14
  env-b lock file on disk: 5a95d71e-c039-44cb-850f-e091d7dcada3
  env-a lease expired now? false
  env-b lease expired now? false
  git status --porcelain in env-a: ""
  git status --porcelain in env-b: ""

== MEMBER B: clone 2 created FROM clone 1's push, after clone 1 acquired ==
  precondition: state/ present in seq-a before mkdir? false
  seq-a acquire ok=true holderId=2ec97a74-88a4-4743-9350-e29d8e027d81
  after push, git status --porcelain in seq-a: ""
  head(seq-a) = 44a2da929fae153d0dcfb857c9fff2dc87ce2c81
  head(seq-b) = 44a2da929fae153d0dcfb857c9fff2dc87ce2c81
  seq-b carries the holder's published note? true
  precondition: state/ present in seq-b before mkdir? false
  seq-b acquire ok=true holderId=9b9d566c-c607-410a-ab8b-0d259cbe8d70
  seq-a lease expired now? false
  seq-b lease expired now? false
  distinct holder ids? true
```

**Member A is the race. Member B is the stronger statement: there is no race
to lose.** In member B, environment A acquires and then publishes everything
git will let it publish, which the empty `git status --porcelain` after the
push states falsifiably. Environment B is then created FROM that push, stands
at exactly the same commit, and carries the holder's own note. It still
acquires, because the lease was never in the tree to publish.

**The precondition lines are not decoration.** A prior probe of this same
question reported that both environments held the lease at a moment when
neither lock directory existed, because it created the directories and then
never asserted anything about them. Every run above prints, before each
acquire, that `state/` was ABSENT in the freshly cloned home, and after each
acquire that the lock file is on disk carrying the holder id the call
returned. The precondition itself, "same origin url and same head", is
implemented as a predicate and is demonstrated FAILING under two structurally
different mismatches before any witness relies on it.

## 2. The compare-and-swap probe (criteria 1 and 2)

`node scripts/probe-cas-ref.mjs --remote <path>` builds a bare repository and
two clones at absolute paths and forces a real contention on
`refs/tiphys/lease`.

```
A accept
B refuse ! [rejected]        8d10d3ba124f3d15e2192e45242e4619075800d2 -> refs/tiphys/lease (stale info)
```

Exit 0. The machine-readable form of the same run:

```
  "gitVersion": "git version 2.43.0",
  "registerBefore": "",
  "registerAfterA": "4599d946cf09a76522061882e2468ff4681934ae",
  "registerAfterB": "4599d946cf09a76522061882e2468ff4681934ae",
  "a": { "expected": "", "accepted": true,  "exit": 0 },
  "b": { "expected": "", "accepted": false, "exit": 1 },
  "singleWinner": true
```

B's full stderr, verbatim:

```
To /tmp/.../remote.git
 ! [rejected]        8d10d3ba124f3d15e2192e45242e4619075800d2 -> refs/tiphys/lease (stale info)
error: failed to push some refs to '/tmp/.../remote.git'
```

The absolute scratch path is elided as `/tmp/.../remote.git` in that block and
nowhere else; the unelided form is in the machine-readable output the guard
test parses. Nothing else in any captured output on this page was altered.

### THE CRITERION SAID "FIRST LINE OF GIT STDERR" AND THAT IS THE WRONG LINE

M4-P20 criterion 1 asks the probe to print `B refuse <first line of git
stderr>`. Measured: this container's global git config sets `push.negotiate`
true, and over the file transport git 2.43.0 then emits

```
fatal: expected 'acknowledgments', received 'packfile'
warning: push negotiation failed; proceeding anyway with push
```

as the FIRST TWO LINES of **every** push, accepted and refused alike. The
first run of this probe therefore printed

```
A accept
B refuse fatal: expected 'acknowledgments', received 'packfile'
```

which is a refusal signature that is byte-identical on the arm that was
ACCEPTED. That is a guard whose condition does not test the property that
matters, which is the shape this repository keeps paying for. The probe now
selects the line carrying git's own `! [rejected]` marker and pins
`push.negotiate=false` command-scoped so the capture is a property of git
rather than of one machine's global config. The marker is git's, so nothing is
hand-written and T-003 still holds.

## 3. The bare force-with-lease form is VACUOUS, in two ways, and the exact-sha form is not (criterion 3)

`node scripts/probe-cas-ref.mjs --vacuity <path>`:

```
bare-lease-absent-register VACUOUS exit 0 bare --force-with-lease pushed by a clone that has never seen the register
bare-lease-after-routine-fetch VACUOUS exit 0 bare --force-with-lease pushed by a stale clone that did a routine fetch first
bare-lease-untracked-namespace SAFE exit 1 bare --force-with-lease into a namespace no fetch refspec covers, live holder present
exact-sha-stale-expectation SAFE exit 1 exact-sha --force-with-lease naming a value the register does not hold
verdict: the bare --force-with-lease form is REFUSED for the design
verdict: the exact-sha form is MANDATED
```

The second row is the one that matters, and it CLOBBERED a live holder:

```
"id": "bare-lease-after-routine-fetch",
"accepted": true,
"exit": 0,
"stderr": " + d65f973...a512b22 a512b226b242cd5247267d17f95dc1b1dbeb5cea -> tiphys-lease (forced update)",
"clobberedLiveHolder": true,
"verdict": "VACUOUS"
```

This reproduces locally what
delivery/verification/m4-prototype-probes.md:150 measured against the real
remote: a routine fetch re-arms the lease, so a stale environment overwrites a
live holder with exit 0 and no refusal.

### The finding this probe adds, which the earlier one did not have

**The vacuity depends on the REMOTE-TRACKING REF, not on
`--force-with-lease` as such.** The third row is the discriminator: the same
bare form, the same live holder, pushed into `refs/tiphys/lease`, a namespace
no fetch refspec covers, is REFUSED with `(stale info)`.

That matters for two reasons.

- **A probe that only ever tested a custom namespace would have called the bare
  form SAFE.** This one did, on its first run, before the arm was moved to a
  branch. The reassuring result was real and was about the wrong configuration.
- **The design cannot take comfort from the custom namespace anyway**, because
  CLAUDE.md standing warning 14, as generalised on 2026-09-15, records that
  only `refs/heads/*` is pushable from this container and that a dedicated ref
  must be read as a dedicated BRANCH. The safe configuration is exactly the one
  that is not available.

So the conclusion stands and is now derived rather than inherited: **M4-P21
must use the EXACT-SHA form of `--force-with-lease`.** The control arm confirms
the exact-sha form refuses a stale expectation, so the mandate is not vacuous
in the other direction.

## 4. What a LOCAL bare repository can and cannot tell you about the namespace

`node scripts/probe-cas-ref.mjs --namespaces <path>`:

```
refs/tiphys/lease accept exit 0
refs/heads/tiphys-lease accept exit 0
refs/tags/tiphys-lease accept exit 0
refs/notes/tiphys-lease accept exit 0
```

All four accept. The real fleet remote answers three of those four with HTTP
403 (delivery/verification/m4-prototype-probes.md:147). This arm exists so that
a green local run is not read as a measurement of the remote, and the probe
prints that sentence itself rather than leaving it to a reader.

## 5. WHAT THIS PROBE DID NOT COVER (criterion 6)

Stated first, per the fix-round contract's third item, because a search whose
scope is wrong returns an empty result indistinguishable from an absence of
defects.

1. **Clock skew is not probed at all.** `isExpired` compares a lease timestamp
   against the LOCAL clock at src/lock.ts:153, so two environments bring two
   clocks. Nothing here varies a clock. The prototype probes document already
   records a stronger result in this area, that a locally-measured no-change
   duration over the register avoids the comparison entirely, and this phase
   neither confirms nor refutes it.
2. **Every capture here is against a LOCAL BARE REPOSITORY, not against
   GitHub.** Server-side ref-update ordering is therefore INFERRED, not
   measured. The file transport and the smart HTTP transport are different
   code paths on both sides.
3. **No concurrent push from two HOSTS was attempted.** The contention above
   is sequential and forced by construction (a deliberately stale expectation),
   which is a stronger and more deterministic witness than a race but is a
   different thing from a real simultaneous race. The prototype probes document
   records a real barrier-synchronised race against the real remote; this probe
   does not repeat it.
4. **The 403 on non-branch namespaces was not re-measured here**, and its
   origin, GitHub or the agent proxy, remains unresolved. This document relies
   on the earlier measurement for that fact and says so rather than restating
   it as its own.
5. **Nothing here tests a MECHANISM**, because none exists. M4-P20 is tests and
   a probe only. The two property witnesses that assert single-holder exclusion
   are gated on `src/exclusion.ts`, which M4-P21 adds.
6. **Lease RENEWAL and RELEASE across environments were not exercised.** Only
   acquire was. A renew or release path may have its own cross-environment
   behaviour and this phase says nothing about it.

## 6. What this costs M4-P21

- The register is a BRANCH under `refs/heads/`, not a custom namespace.
- The expectation is an EXPLICIT SHA. The bare form is refused for the design,
  and section 3 above is the evidence rather than an assertion.
- A nonzero exit does NOT mean "I lost": a transport failure exits 1 too, which
  the guard test asserts in its own comment. The API needs three states, with
  INDETERMINATE resolved by re-reading the register.
- The two gated witnesses in `test/cross-environment.test.ts` are the acceptance
  target, and the expiry guard in that file goes RED the day `src/exclusion.ts`
  lands. **That file is not on M4-P21's files-to-touch list as the plan
  currently writes it**, which is a scope gap the orchestrator has to close
  before M4-P21 is dispatched, not something the M4-P21 implementer can
  discover from their own brief.
