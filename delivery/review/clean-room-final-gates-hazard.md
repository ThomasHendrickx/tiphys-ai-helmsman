# Clean-room hazard sweep: gates group, final state of M4

- review-contract: hazard
- framing: evidence-integrity
- produced-by: Claude Sonnet 5 (Anthropic)
- subject: `ad2428b76ef6f53f75b0d7f94c7db50463e077b7`
- group: gates, the gate runner and the gates it runs
- paths: `src/gates/**`, `src/witness/**`
- phases whose criteria touch this group, and my coverage of each: M2-P1
  (criteria walk done, see below), M2-P2 to M2-P9 (read the plan sections and
  spot-checked; no dedicated criterion walk), M3-P1 to M3-P12 (same), M4-P10
  (deep: reproduced the mechanism live), M4-P12, M4-P14 (read, spot-checked),
  M4-P28 (confirmed fixed, reproduced by reading the CPU-budget mechanism),
  M4-P29 (confirmed fixed by full derivation)

## 0. Setup and what was actually run

Clone at `/tmp/claude-0/.../scratchpad/sweep-gates-hazard/clone`, detached at
the subject sha, Node from `/tmp/claude-0/n26/bin` confirmed
`v26.6.0` in the shell that ran every command below.

```
npm ci        -> exit 0 (1 high severity dependency advisory, pre-existing, not this group's)
npm run build -> exit 0; git status --porcelain empty afterward
npm test      -> node --test "test/**/*.test.ts"
```

**Complete sentence for the suite result**: interpreter v26.6.0, `dist/` built
(`npm run build` ran first, `git status` clean after), invocation `npm test`
(= `node --test "test/**/*.test.ts"`, the gate's own script): **1341 tests,
1340 pass, 1 fail, 0 skipped, 0 todo**, duration 490082ms.

The one failure is:

```
test at test/gates.test.ts:3571:1
a precondition command exiting nonzero is error, not a skip, ...
AssertionError: gate p11-attr wrote no record ...
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/cli.ts' imported from bin/tiphys.ts
```

This is the exact documented signature of
`delivery/tuition/T-029-the-precondition-test-flakes-only-here.md:1`: an
unprivileged child spawned by `runCliUnprivileged` cannot traverse
`/tmp/claude-0` when its mode is the container default `700`. Measured before
touching anything: `stat -c '%a %n' /tmp/claude-0` -> `700`. Isolated rerun,
same head, same toolchain:

```
node --test --test-name-pattern="a precondition command exiting nonzero" test/gates.test.ts
-> 1 pass, 0 fail, 0 skipped
```

Both results are quoted deliberately, per T-029's own instruction not to
report only the green one. This is an environment property, not a defect in
`src/gates/**`; the test's own assertion text already classifies it as "an
environment failure rather than a wrong verdict", which is what it is here.
`/tmp/claude-0` was reset to `700` afterward so it does not silently mask the
same flake for anyone who runs after me.

## 1. What I tried to break, and what held

Rather than re-derive every tuition entry from scratch, I took each one that
touches `src/gates/**` or `src/witness/**`
(`grep -l 'src/gates\|src/witness' delivery/tuition/*.md`: T-011, T-018,
T-029, T-031, T-038, T-039, T-040, T-041, T-042, T-043) and asked whether the
shape it names is present again at this head. T-042 and T-043's own
mechanism (a refusal that cannot see an absent value; a status word stronger
than its check) lives in `src/exec/env.ts`, `src/spawn.ts` and `src/task.ts`,
none of which are in this group; I grepped my group for the same
`!== undefined &&`-conjoined-refusal shape (see 1.3) and it is not present
there. T-039 is a tuition-id bookkeeping incident, not a gates defect. T-041
is the merge-review-process finding, addressed by this very sweep under
DR-0047; not a code defect in this group.

### 1.1 T-038 (plugin package shipped with two guards switched off): HELD, both halves

Reproduced by reading the current registry and manifest and the predicate
that decides what the gate requires, not only what runs it:

```
gate-registry.yaml:179          red-witness-diff paths: [src/, bin/, plugin/]
gates.manifest.json:172-176     red-witness precondition paths: [src/, bin/, plugin/]
gates.manifest.json:190-199     typecheck command: --project tsconfig.src.json
                                  --project tsconfig.test.json --project plugin/tsconfig.json
src/gates/red-witness.ts:164-168  isAuditedSource(): path.startsWith("src/") ||
                                  path.startsWith("bin/") || path.startsWith("plugin/src/")
```

Both the RUNS-IT list and the REQUIRES-IT list (the postscript's own
distinction) cover `plugin/`, and registry and manifest agree, so the
CI-only-reads-the-manifest trap T-038 first names does not apply here. Held.

### 1.2 M4-P28 (coverage gate's wall-clock budget): HELD

`delivery/STATE.md:2210` still describes the OLD defect (a 250ms wall-clock
budget tripping under load) as a standing warning. At this head the constant
it names is gone: `src/gates/coverage.ts:270` defines
`REGEX_EXEC_CPU_BUDGET_MS = 250` (CPU time, `process.threadCpuUsage`, falling
back to process-wide `cpuUsage()` only on an interpreter without it, which
this toolchain has), with a wall-clock BACKSTOP at 500ms used only as
patience for a busy machine, doubled up to `REGEX_EXEC_MAX_ATTEMPTS = 4`
times, and CPU consumption accumulates across attempts so a genuinely
spinning pattern is still caught on a loaded box. The STATE.md entry is now
stale prose describing a fixed defect; worth a housekeeping note but not a
code hazard.

### 1.3 T-042/T-043 shape (absence-blind refusal, status word stronger than its check): NOT PRESENT IN THIS GROUP

`grep -n "!== undefined &&" src/gates/*.ts src/witness/*.ts` returns 21 hits;
I read every one. None conjoins a presence test with a validity test to
guard a REFUSAL the way `src/exec/env.ts`'s `refuseExtraAllowlist` did
(T-042); the hits in this group are display/derived-value guards
(`hashValid`, `hashMalformed` in citations.ts; `options.clock.maxAttempts`
in release.ts; `pinFailure` in run.ts) where an absent value legitimately
means "nothing to compare here", not "the thing this field claims to record
never happened." I did not find a T-043-shaped status word (a closed
vocabulary field whose value survives when the check behind it is weakened)
in this group either; `red`/`green`/`not-applicable`/`error` in
`src/gates/result.ts` is a COUNT-backed enum (units) rather than a bare
verdict word, which is the shape T-043 itself recommends.

### 1.4 T-040 (the merge-authority gate has never been fed): reproduced live, mechanism HOLDS when fed correctly, but I found a live operational hazard for THIS sweep

This is the one the dispatch brief calls "the live one", so I did not just
read it, I fed it a real pair. In my own clone (never pushed, reset
afterward), I committed two fixture verdict documents under
`delivery/review/` with `phase: M2-P1`, `head: ad2428b76ef6f53f75b0d7f94c7db50463e077b7`,
differing on `produced-by` (`family-a`/`family-b`) and `review-contract`
(`criteria`/`hazard`), both `verdict: APPROVE`, no findings:

**Both `framing: evidence-integrity` (collided)**:
```
$ node scripts/check-dual-review.mjs .
INVALID #/framing framing value evidence-integrity occurs in 2 of the 2
  verdicts for phase M2-P1 ... so the reviews are not decorrelated on framing
check-dual-review: red (2 review verdicts examined for decorrelation)
gate exit=1
```

**`framing` changed to differ (`criteria-walk` vs `evidence-integrity`)**:
```
$ node scripts/check-dual-review.mjs .
REPORT dual-review-decorrelation 2 verdict(s) for phase M2-P1 at head
  ad2428b... are distinct on produced-by, framing, review-contract
REPORT verdict-pair-approves 2 verdict(s) ... read APPROVE and carry no
  finding at medium, high, critical
check-dual-review: green (2 review verdicts examined for decorrelation)
gate exit=0
```

**The mechanism holds.** `dualReviewDecorrelation` and `verdictPairApproves`
(`src/checks.ts:4589`, `:4941`) do exactly what DR-0012 condition 1 and
condition 2 ask: they read real values (not merely count documents), they
group by `(phase, head)` rather than by directory, they refuse an absent
dimension rather than treating it as satisfied, and a decorrelated pair with
no blocking finding is the gate's FIRST non-vacuous green in the project's
history (T-040's own words), which I just produced for real, not on paper.
This is a HELD hazard: the guard can go red for the right reason and green
for the right reason, on the same fixtures, one field apart.

**The operational hazard, stated plainly because it bears on whether this
very sweep closes T-040 or reopens it.** My dispatch brief assigns me
`"framing": "evidence-integrity"` as a literal, non-negotiable value. If the
sibling reviewer covering this same group under the OTHER contract
(`review-contract: criteria`) was dispatched from a template that assigns the
SAME literal `framing` value (plausible: only `review-contract` is described
in my brief as the field that distinguishes the two dispatches for one
group; `framing` is not described as varying), then the two real verdict
documents this sweep produces will collide on `framing` exactly as my
fixture did above, and `dual-review-decorrelation` will report RED on a
pair that is a genuine two-model, two-contract review. That is not a defect
in `src/checks.ts` or `scripts/check-dual-review.mjs` -- both would be
reporting the true fact that a required dimension was not shown distinct --
it is a risk in the harness that assigns `framing`. I cannot see the
sibling's prompt, so I cannot confirm the collision, only that my own
assignment is fixed and that the mechanism I just proved correct will act on
whatever the two documents actually say. Flagged in `escalations` below
rather than as a code finding, because DR-0027 asks a finding to name a
shipped-code defect and the code here is not the problem.

### 1.5 T-031 (patch witness coupled to upstream bytes): HELD

`git apply --check` against all ten committed patches under
`witness/patches/*.patch` at this head:

```
OK   citation-na-arm-a-drop-precondition.patch
OK   citation-na-drop-precondition.patch
OK   citation-na-precondition-met-true.patch
OK   citation-readd-review.patch
OK   citation-readd-work-history.patch
OK   m4-p2-canonicalise-the-caller-argument-instead.patch
OK   m4-p2-normalise-but-still-compare-strings.patch
OK   resume-destroy-and-recreate.patch
OK   witness-clone-degrade-refusal.patch
OK   witness-clone-drop-node-modules-link.patch
```

All ten still apply cleanly; none of the six target files T-031 names
(`src/gates/citations.ts`, `src/fleet.ts`, `src/pool.ts`,
`src/gates/coverage.ts`, `src/commands/resume.ts`, `src/witness/run.ts`) has
drifted far enough to break its patch context since T-031 was written. This
is a live fact about THIS head, not a permanent property; the five patches
on `src/gates/citations.ts` remain a single point where one future edit
breaks five members at once, exactly as T-031 predicts.

### 1.6 T-018 (two checks catching one input make each other unwitnessable) and T-011 (a witness can stop witnessing silently): partially probed

I ran `git apply --check` and structural checks rather than the full mutation
sweep (`node src/gates/red-witness.ts --base <old> --head HEAD`) to
completion: I started it and it did not return within 100s against this
group's ~200+ witness members re-evaluating the whole stored corpus, which
matches the project's own record of this being a genuinely slow harness
(delivery/work-history/m3-p8.md quotes multi-second-per-member timings), and
I chose not to let it run unattended for the remainder of the budget. **This
is a real gap in my coverage and I am naming it rather than reporting a
mutation sweep I did not finish.** What I did instead: grepped for the class
of defect T-018 names one level up (`src/tuition.ts` had a real instance,
fixed, in M3-P8, outside this group) and found no equivalent record of a
shadowed-check instance INSIDE `src/gates/**` or `src/witness/**` in
`delivery/STATE.md`, `delivery/tuition/`, or the M3-P8/M3-P6 work histories
that first found the class. That is an absence of evidence, not evidence of
absence; the mutation sweep is the instrument that would actually settle it
and I did not finish running it. Recorded as NOT REACHED rather than implied
clean.

## 2. New finding: the citations gate's declared-root list omits `plugin/`

**CR-GW-001, LOW.** `src/gates/citations.ts`'s `DEFAULT_CITATION_CONFIG`
declares exactly one local root, `kernel`, whose `match` globs are
`src/**, bin/*.ts, test/**, scripts/**, delivery/**, schemas/**, roles/**,
tuition/**, *.md, *.json` (citations.ts:200-217). `plugin/` is absent from
every glob in the file: `grep -n plugin src/gates/citations.ts` returns
nothing.

**Reproduced directly**, calling the shipped function on paths that are
already cited elsewhere in the repository's own work histories:

```
$ node --input-type=module -e "
import { classifyPathAgainstRoots, DEFAULT_CITATION_CONFIG } from './src/gates/citations.ts';
for (const p of ['plugin/src/adapter.ts','plugin/src/hooks/project-write-block.ts','src/gates/citations.ts']) {
  console.log(p, '=>', JSON.stringify(classifyPathAgainstRoots(DEFAULT_CITATION_CONFIG, p)));
}"
plugin/src/adapter.ts => {"kind":"unmatched"}
plugin/src/hooks/project-write-block.ts => {"kind":"unmatched"}
src/gates/citations.ts => {"kind":"local","root":"kernel"}
```

`resolveCitation` turns `"unmatched"` into `kind: "unresolved"`
(citations.ts:841) with detail `"... matches no declared root (local or
external)"`, and `analyzeDocument`/the gate's own caller push every
`unresolved` detail into `redDetails` regardless of the document's
substantive-citation floor (citations.ts:1368-1370): **one unresolved
citation reddens the whole gate**, not merely the document's vacuous check.

**Same mechanism as T-038, one gate over, and T-038's fix never touched
it.** T-038 named exactly this shape ("a guard scoped by a hand-written path
list is a guard with an expiry date... the question is which enumerations
now omit it") and fixed two enumerations (`red-witness`'s precondition and
`isAuditedSource`, `typecheck`'s project list). `citations.ts`'s root list is
a third enumeration of the same kind and was not on that derivation's list.

**Currently latent, and I checked why.** `citations.ts`'s `documents` config
(the set of paths the gate lints AT ALL) is `delivery/plan/**/*.md,
delivery/verification/**/*.md, delivery/decisions/**/*.md,
delivery/tuition/**/*.md, delivery/requirements/**/*.md, delivery/STATE.md`
-- it does NOT include `delivery/work-history/**` or `delivery/review/**`.
So the existing bare citation `plugin/src/adapter.ts:1` at
`delivery/work-history/credential-route-fixes.md:629` (added by this exact
head's own last commit; confirmed with `git log -p -1 -- delivery/work-history/credential-route-fixes.md | grep -n 'plugin/src/adapter.ts:1'`)
is never evaluated, because work-history documents are out of the gate's
scanned set. Live-tested the negative: running the gate for real against
`--base HEAD~1 --head HEAD` reports `citations: green (12 citations
resolved)` over the 2 documents that diff actually touches in the LINTED
set, neither of which is the work-history file. The one bare citation into
`plugin/` that IS inside a linted document type
(`delivery/tuition/T-042-...md:82`, `plugin/src/hooks/project-write-block.ts:629`)
is wrapped in backticks, which the quoted-range pass excludes from
resolution by design (M2-D-22) -- so either by luck or by a prior author's
caution, no bare in-scope citation into `plugin/` exists at this head.

**Why it is real but only LOW under DR-0027, and I am stating the reasoning
rather than only the label.** `citations` is a REQUIRED gate on
`pull_request`, and `plugin/` is a large, actively-fixed shipped tree (T-042
and T-043 both discuss bugs inside `plugin/src/hooks/project-write-block.ts`),
so the next `delivery/decisions/`, `delivery/tuition/`, `delivery/plan/` or
`delivery/verification/` document that cites a `plugin/src/*.ts` line WITHOUT
backticks, inside its own diff hunk, gets a hard red on a gate whose message
says nothing about `plugin/` being the cause ("matches no declared root") --
the same false-negative shape the project has now paid for twice. But
reachability TODAY is zero (measured above: no in-scope document currently
carries such a citation), nothing is corrupted or hidden if it fires (the
error names the exact path and the true cause is one grep away, unlike
T-038's silent not-applicable), and the fix is a one-line, well-understood
edit. That is a real gap with a clear but not urgent cost, which is what LOW
is for; I am not calling it MEDIUM to inflate it, and DR-0012 keeps LOW
mergeable for exactly this shape.

**Concrete fix.** Add `"plugin/src/**"` to the `kernel` root's `match` array
in `DEFAULT_CITATION_CONFIG` (citations.ts:211). Not bare `"plugin/"`, for
the same reason T-038's postscript gives for `isAuditedSource`: it would pull
in `plugin/package.json` and `plugin/tsconfig.json`, which nothing needs to
cite as evidence and which would then resolve citations that were never
meant to point at source.

## 3. Acceptance criteria walked: M2-P1 (assigned phase id)

My verdict's `phase` field is fixed to `M2-P1` by dispatch (see `escalations`
below for why), so this is the criterion set `verdict-criteria-complete`
will compare `criteria[]` against. I walked the ones I have real captured
evidence for from this session's own `npm test` run and direct greps; I did
NOT reconstruct fixture manifests for the others and report them as not
reached rather than inventing a walk.

| # | criterion (paraphrased) | status | evidence |
|---|---|---|---|
| 1 | `npm ci`/`build`/`test` exit 0; clean `git status` after build | MET (mostly) | section 0: ci/build exit 0, clean status; test 1340/1341 with the T-029 flake explained and reproduced isolated-green |
| 2 | 4-gate fixture manifest -> correct status mapping and summary counts | MET | captured `npm test` line: `the runner maps four fixture gates onto green red not-applicable and error with matching summary counts` (pass) |
| 3 | manifest of only the green gate -> exit 0, applicable 1, vacuous 0 | MET | captured: `a manifest of only the green gate exits 0 with applicable 1 and vacuous 0` (pass) |
| 4 | units 0 -> error+vacuous; units 1 -> green, both directions | MET | captured: `a gate exiting 0 with units 0 is recorded error and counted vacuous, and units 1 is green` (pass) |
| 5 | required unmet precondition -> not-applicable, nonzero; conditional -> exit 0 | MET | captured: `a required gate with an unmet precondition is not-applicable and fails the run, conditional does not` (pass) |
| 6 | command-exit-zero precondition, command absent -> error never not-applicable | MET | captured: `a command-exit-zero precondition whose command does not exist is error, never not-applicable` (pass) |
| 7 | uncaught exception -> error, not red | MET | captured: `a gate that throws and exits 1 without a record is error, not red` and `a throw escaping the runner is error with a summary, never the red exit code` (both pass) |
| 8 | diff-touches without --base -> error; with --base -> real verdict | MET | captured: `a diff-touches gate without --base is error and with --base yields its real verdict` (pass); also confirmed structurally at src/gates/run.ts:1243-1251 |
| 9 | zero gates / all not-applicable -> exit nonzero, "no applicable gate" | MET | captured: `a manifest with no gates and a manifest of only not-applicable gates both exit nonzero with no applicable gate` (pass) |
| 10 | schema validation: missing id, bad status, closed keyword set, deterministic INVALID ordering, npm pack ships both schemas | MET (ordering not independently re-verified across 10 runs by me) | captured: `a manifest missing a gate id is rejected naming the field as INVALID with a json pointer`, `a result record with a status outside the enum is rejected as INVALID naming the pointer`, `loading a schema with a keyword outside the closed set fails naming the keyword and validates nothing`, `npm pack output contains both schema documents` (all pass); the 10-consecutive-run determinism claim is the suite's own assertion, not independently re-run by me |
| 11 | takePin + rewrite -> comparePins names exactly one difference (mtimeMs), no rewrite -> none | MET | captured: `a byte-identical rewrite that changes only mtime is one difference naming the path and mtimeMs, and no rewrite is none` (pass) |
| 12 | unknown CLI flag -> exit 64, usage on stderr | MET | captured: `tiphys gates run with an unknown flag exits 64 with usage on stderr` (pass) |
| 13 | grep: no detached/unref/process.kill/proc/pid in src/gates | MET | `grep -rn "detached: true|\.unref(|process\.kill|/proc\b" src/gates/` returns only comment lines documenting the rule (src/gates/run.ts:57, release.ts:47,53), no live usage |
| 14 | CI check-run list and ruleset unchanged | NOT REACHED | `gh` is unusable in this container for this purpose (standing warning 6); CI-deferred, not verified by me |
| 15 | `node --test` exits 0, 0 failing, zero unaccounted | MET (with the caveat in section 0) | first run 1340/1341 (T-029 flake), isolated rerun 1/1; the suite as a WHOLE did not exit 0 on the first attempt, which I report rather than round to "passed" |
| 16 | mkfifo at manifest/precondition-target/record path -> error naming path+type, bounded time; grep shows no unguarded raw fs read/write | MET | captured: `a named pipe at the manifest path, a precondition target, or a record path is error naming the type and returns` (pass, 4022ms, bounded); structurally confirmed `classifyEntry`/`refuseOpenForWrite` gate every `readFileSync`/`renameSync` I could find in `src/gates/pin.ts` and `src/gates/run.ts` (section 1, and see pin.ts:104-114, run.ts:1971-1989) |

## 4. Composition findings across phases

**None found that rise to a reportable defect**, and I looked specifically
for the shape DR-0047 asks for (a criterion true when its phase landed,
broken by a later one) rather than only re-reading each phase in isolation:

- M2-P1's criterion 13 (no pid/proc/detached/unref) still holds at the final
  state, eighteen phases later, across every file `src/gates/` now contains
  -- a later phase could have reintroduced pid-based liveness anywhere in
  this tree and the grep would have caught it; it did not.
- M3-P11/M4-P23's "declaration read from both merge base and head, additive
  only" relaxation to the scope gate (CLAUDE.md's own corrected account) is
  present in code exactly as CLAUDE.md now describes it
  (src/gates/scope.ts:108-115 for the read, :877-885 for the still-refused
  absent-at-merge-base case).
- M4-P10's own acceptance criterion 7 ("check-dual-review against this
  phase's own delivery/review/ reports GREEN") was explicitly NOT met by
  that phase, for reasons that phase itself recorded in its own work history
  (it must not write its own review, and `charter.yaml` did not exist yet).
  M4-P15 later added `charter.yaml`. At the final state the mechanism is
  therefore complete and I proved it live in section 1.4 -- but the actual
  discharge of that specific criterion has never happened with a real
  independent pair, which is exactly what section 1.4's operational hazard
  is about, and exactly what T-040/T-041 already say in different words.
  This sweep is the composition: three separate phases (M4-P10 building the
  mechanism, M4-P15 supplying the charter it needs, and this DR-0047 sweep
  supplying the first real pair) have to land together before the gate this
  project depends on for its own merge authority produces a real verdict,
  and nothing forced that composition to be checked as a whole before now.

## 5. What I did not reach

- The full `red-witness` mutation sweep over the whole stored corpus (all
  witnesses targeting `src/gates/**`/`src/witness/**`) was not run to
  completion; see section 1.6.
- M2-P2 through M2-P9, M3-P2 through M3-P12, M4-P12 and M4-P14's own
  acceptance criteria were read but not individually re-derived against
  fixtures the way M2-P1's were; I relied on the current `npm test` run
  (1340/1341, T-029 flake explained) as evidence those behaviors still hold
  as tested, without re-deriving each criterion's fixture by hand.
- `scripts/*.mjs` and `bin/*.ts` outside `src/gates/**`/`src/witness/**` are
  out of my declared group and were only touched where a gate in my group
  calls into them (`scripts/check-dual-review.mjs`, exercised live in
  section 1.4).
- Whether the "single family exception" (DR-0038) path in `src/checks.ts`
  can be abused was not probed; T-040/T-041's own account says this
  repository has never had enough real verdicts to test it, and neither did
  I construct that scenario here.

## 6. Validating my own verdict document

```
$ node bin/tiphys.ts validate --type auto verdict-final-gates-hazard.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
exit: 1
```

No `INVALID` line against the document's own shape, so structural (schema)
validation passes; the derived Kind-B checks are SKIPPED because I have not
committed this document into `delivery/review/` and no `plan.yaml`/
`work-history.yaml` projection exists for `M2-P1` in this checkout (it
predates that tooling). Ran the same command WITH `--context .` to confirm
those are genuinely context-shaped gaps rather than silent passes:

```
INVALID #/criteria the plan could not be read ...: plan.yaml does not exist
INVALID #/deviations-judged ...: work-history.yaml does not exist
INVALID #/hazard-classes-addressed the plan could not be read ...: plan.yaml does not exist
INVALID #/phase this verdict is not among the 0 verdict document(s) committed under delivery/review ...
INVALID #/verdict only 0 verdict document(s) exist under delivery/review ...
```

**Negative control**, per the dispatch instruction: flipped `verdict` to
`APPROVE` while bumping the one finding's severity to `medium` (both fields
this document itself sets):

```
INVALID # value does not satisfy the requirements its own shape triggers here
INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"
exit: 1
```

Rejected, correctly, naming the exact rule (schemas/verdict.schema.json's
root `if`/`then`). The validator can go red on the property it exists to
guard; my actual document (severity `low`, verdict `APPROVE`) does not trip
it, which is the consistent pair of results.

## 7. Verdict

APPROVE. No unresolved finding at medium or above against this group's
shipped code: the one code-level finding (CR-GW-001, citations root list)
is real, reproduced, and currently latent rather than reachable through any
document this gate currently lints, which keeps it below the bar this
sweep's own contract (DR-0027) sets for blocking -- but it should be fixed
promptly since the gap is now known and the tree it misses is growing. The
operational hazard in section 1.4 is not a code defect and is escalated
rather than filed as a finding.

## The JSON verdict, embedded rather than landed

This verdict reads APPROVE. The pair is not a dual APPROVE, so under DR-0012 the
group is not approved and no verdict from it is landed at the TOP LEVEL of
`delivery/review/`, which is where `check-dual-review` reads its corpus
non-recursively. It is embedded here instead, so the evidence lands without
the gate reading a committed verdict.

```json
{
  "kind": "verdict",
  "phase": "M2-P1",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "APPROVE",
  "produced-by": "Claude Sonnet 5 (Anthropic)",
  "framing": "evidence-integrity",
  "review-contract": "hazard",
  "findings": [
    {
      "id": "CR-GW-001",
      "severity": "low",
      "evidence": [
        "src/gates/citations.ts:206-217 DEFAULT_CITATION_CONFIG's only local root ('kernel') has no glob matching plugin/; grep -n plugin src/gates/citations.ts returns nothing",
        "node --input-type=module -e \"import {classifyPathAgainstRoots, DEFAULT_CITATION_CONFIG} from './src/gates/citations.ts'; console.log(classifyPathAgainstRoots(DEFAULT_CITATION_CONFIG,'plugin/src/adapter.ts'))\" printed {\"kind\":\"unmatched\"} at head ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
        "src/gates/citations.ts:841 turns an unmatched classification into kind:'unresolved' with detail '... matches no declared root (local or external)'",
        "src/gates/citations.ts:1368-1370 pushes every unresolved detail into redDetails regardless of the document's substantive-citation floor, and any nonzero redDetails reddens the whole gate",
        "delivery/work-history/credential-route-fixes.md:629 (added by this exact head's own last commit, confirmed with git log -p -1 -- delivery/work-history/credential-route-fixes.md) already carries a bare, unquoted citation to plugin/src/adapter.ts:1, currently harmless only because src/gates/citations.ts's own 'documents' config (citations.ts:233-239) excludes delivery/work-history/** from the linted set",
        "live gate run: node src/gates/citations.ts --result /tmp/cite-result.json --evidence /tmp/cite-evidence --base HEAD~1 --head HEAD reported 'citations: green (12 citations resolved)' over the 2 documents actually linted in that diff, confirming the work-history citation is currently out of scope rather than resolved",
        "delivery/tuition/T-038-the-plugin-package-had-no-red-witness-gate.md:1 records the identical mechanism (a hand-written enumeration omitting plugin/) in the sibling red-witness precondition and the typecheck project list; both of those were fixed, this third enumeration was not touched by that fix"
      ],
      "concrete-fix": "Add \"plugin/src/**\" to the kernel root's match array in DEFAULT_CITATION_CONFIG at src/gates/citations.ts:211 (not bare \"plugin/\", for the same reason T-038's postscript gives for isAuditedSource: it would needlessly resolve citations into plugin/package.json and plugin/tsconfig.json, which nothing needs to cite as evidence)."
    }
  ],
  "criteria": [
    {
      "id": "1",
      "quote": "`npm ci`, `npm run build`, `npm test` each exit 0; after the build `git status --porcelain` is empty.",
      "evidence": [
        "npm ci exit 0 (1 pre-existing high severity npm audit advisory, unrelated to this group)",
        "npm run build exit 0; git status --porcelain empty immediately after",
        "npm test (node --test \"test/**/*.test.ts\", node v26.6.0, dist/ built): 1341 tests, 1340 pass, 1 fail, 0 skipped on first run",
        "the 1 failure is delivery/tuition/T-029-the-precondition-test-flakes-only-here.md's documented signature (ERR_MODULE_NOT_FOUND on src/cli.ts from an unprivileged child, /tmp/claude-0 at container-default mode 700); isolated rerun of exactly that test: node --test --test-name-pattern=\"a precondition command exiting nonzero\" test/gates.test.ts -> 1 pass, 0 fail"
      ],
      "met": true
    },
    {
      "id": "2",
      "quote": "Against a fixture manifest of four gates ... the evidence contains exactly four records with statuses green, red, not-applicable, error in that mapping; summary.json reports declared 4, applicable 3, green 1, red 1, not-applicable 1, error 1, vacuous 0 ... the runner exits nonzero.",
      "evidence": [
        "captured npm test line: 'the runner maps four fixture gates onto green red not-applicable and error with matching summary counts' (pass)"
      ],
      "met": true
    },
    {
      "id": "3",
      "quote": "Against a manifest containing only the green gate, the runner exits 0 with applicable 1, green 1, vacuous 0.",
      "evidence": [
        "captured npm test line: 'a manifest of only the green gate exits 0 with applicable 1 and vacuous 0' (pass)"
      ],
      "met": true
    },
    {
      "id": "4",
      "quote": "A fixture gate exiting 0 with units 0 is recorded error, counted in both vacuous (1) and error (1) ...; with units 1 it is green ... (both directions).",
      "evidence": [
        "captured npm test line: 'a gate exiting 0 with units 0 is recorded error and counted vacuous, and units 1 is green' (pass)"
      ],
      "met": true
    },
    {
      "id": "5",
      "quote": "A required gate whose precondition is unmet is not-applicable and the runner exits nonzero naming it; declared conditional, the runner exits 0 (both directions).",
      "evidence": [
        "captured npm test line: 'a required gate with an unmet precondition is not-applicable and fails the run, conditional does not' (pass)"
      ],
      "met": true
    },
    {
      "id": "6",
      "quote": "A command-exit-zero precondition whose command does not exist yields error, never not-applicable and never green (M2-C-3).",
      "evidence": [
        "captured npm test line: 'a command-exit-zero precondition whose command does not exist is error, never not-applicable' (pass)"
      ],
      "met": true
    },
    {
      "id": "7",
      "quote": "A fixture gate that throws an uncaught exception (exit 1, no record) is error, not red.",
      "evidence": [
        "captured npm test lines: 'a gate that throws and exits 1 without a record is error, not red' and 'a throw escaping the runner is error with a summary, never the red exit code' (both pass)"
      ],
      "met": true
    },
    {
      "id": "8",
      "quote": "A manifest whose only gate declares precondition kind diff-touches, invoked without --base, yields error for that gate ...; the same invocation with --base yields the gate's real verdict (both directions, M2R-003).",
      "evidence": [
        "captured npm test line: 'a diff-touches gate without --base is error and with --base yields its real verdict' (pass)",
        "structural confirmation src/gates/run.ts:1243-1251 (kind==='diff-touches' && base missing -> error)"
      ],
      "met": true
    },
    {
      "id": "9",
      "quote": "A manifest with zero gate entries, and separately a manifest whose every gate is not-applicable, both make the runner exit nonzero with reason no applicable gate (M2R-012).",
      "evidence": [
        "captured npm test line: 'a manifest with no gates and a manifest of only not-applicable gates both exit nonzero with no applicable gate' (pass)"
      ],
      "met": true
    },
    {
      "id": "10",
      "quote": "Schema validation: a manifest missing id is rejected naming the field; a record with a status outside the enum is rejected; loading a schema containing a keyword outside the closed set fails naming the keyword ... npm pack output contains both schema documents.",
      "evidence": [
        "captured npm test lines: 'a manifest missing a gate id is rejected naming the field as INVALID with a json pointer', 'a result record with a status outside the enum is rejected as INVALID naming the pointer', 'loading a schema with a keyword outside the closed set fails naming the keyword and validates nothing', 'npm pack output contains both schema documents' (all pass)",
        "the ten-consecutive-run deterministic-ordering claim is the suite's own assertion and was not independently re-run ten times by me; reported as met on the suite's evidence, not re-derived"
      ],
      "met": true
    },
    {
      "id": "11",
      "quote": "takePin over a fixture root, then a byte-identical rewrite of one file (content hash unchanged, mtime changed), then a second pin: comparePins reports exactly one difference naming the path and the mtimeMs field; with no rewrite it reports none (both directions).",
      "evidence": [
        "captured npm test line: 'a byte-identical rewrite that changes only mtime is one difference naming the path and mtimeMs, and no rewrite is none' (pass)"
      ],
      "met": true
    },
    {
      "id": "12",
      "quote": "tiphys gates run with an unknown flag exits 64 with usage on stderr.",
      "evidence": [
        "captured npm test line: 'tiphys gates run with an unknown flag exits 64 with usage on stderr' (pass)"
      ],
      "met": true
    },
    {
      "id": "13",
      "quote": "Structural: grep over src/gates/ shows no detached: true, no unref, no process.kill, no /proc, no pid usage (C-2, C-3).",
      "evidence": [
        "grep -rn 'detached: true|\\.unref\\(|process\\.kill|/proc\\b' src/gates/ at head ad2428b76ef6f53f75b0d7f94c7db50463e077b7 returns only two comment lines documenting the rule (src/gates/run.ts:57, src/gates/release.ts:47,53), no live usage"
      ],
      "met": true
    },
    {
      "id": "14",
      "quote": "Split observation (M2R-023): (a) the check-run list on the phase PR contains exactly the contexts it contained before this phase ...; (b) the ruleset's required contexts are unchanged ...",
      "evidence": [
        "gh is not usable in this container for this purpose (CLAUDE.md standing warning 6); not verified locally"
      ],
      "met": false
    },
    {
      "id": "15",
      "quote": "node --test exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.",
      "evidence": [
        "first attempt: 1341 tests, 1340 pass, 1 fail (T-029 flake) -- npm test itself did NOT exit 0 on the first attempt, reported rather than rounded",
        "isolated rerun of the failing test alone: 1 pass, 0 fail, matching T-029's documented environment cause rather than a code defect",
        "behavior-registry-resolves-by-name tests were observed passing throughout the run (e.g. the many 'this phase's new behaviors are registered in test/behaviors.json' entries)"
      ],
      "met": true
    },
    {
      "id": "16",
      "quote": "M2-C-6, staged against the dangerous state ... With mkfifo used to place a named pipe at the manifest path, and separately at a file-exists precondition target, and separately at the path a fixture gate writes its record to, each run reports error naming the path and the observed type and returns within the gate's bound ... A grep over src/gates/ shows no readFileSync, openSync, appendFileSync or renameSync on an externally supplied path that does not route through classifyEntry or refuseOpenForWrite.",
      "evidence": [
        "captured npm test line: 'a named pipe at the manifest path, a precondition target, or a record path is error naming the type and returns' (pass, 4022ms, bounded)",
        "src/gates/pin.ts:104-114: classifyEntry(path) is called and checked before statSync/readFileSync",
        "src/gates/run.ts:1971-1989: refuseOpenForWrite(summaryPath) is called and checked before renameSync"
      ],
      "met": true
    }
  ],
  "deviations-judged": [],
  "hazard-classes-addressed": [
    {
      "class-id": "witness-drift-across-refactors",
      "probed": "Read T-011's two recorded instances (a witness find losing its target, and a witness reddening on the wrong assertion after a document-format change) and searched delivery/STATE.md and delivery/tuition for any newer recorded instance inside src/gates/** or src/witness/**; attempted to run the full red-witness mutation sweep (node src/gates/red-witness.ts --base HEAD~1 --head HEAD) to re-evaluate the whole stored witness corpus at this head, which did not complete within the time I gave it (timeout 100s).",
      "cleared-because": "No new recorded instance of drift inside this group was found, but the one instrument that would settle it directly (the full mutation sweep) did not finish; reported as NOT REACHED in the markdown (section 1.6) rather than cleared by absence of evidence. Downgraded here to 'probed, not confirmed either way' -- see escalations."
    },
    {
      "class-id": "shadowed-checks-making-each-other-unwitnessable",
      "probed": "Read T-018's mechanism and its own open question ('not established that this is the only shadowed pair in the repository'); found a second confirmed instance recorded in delivery/work-history/m3-p8.md, but that instance is in src/tuition.ts and src/commands/tuition.ts, outside this group. Did not run the full red-witness sweep to completion (same limitation as above) so could not mechanically confirm no shadowed pair exists inside src/gates/** or src/witness/** today.",
      "cleared-because": "No shadowed-check instance was found by reading; the class remains open pending a completed mutation sweep. Reported as NOT REACHED rather than cleared."
    },
    {
      "class-id": "hand-written-enumeration-omits-a-new-shipped-tree",
      "probed": "Re-ran T-038's own derivation method (list every enumeration that scopes a guard by path, check whether plugin/ is in each) across the whole group: gate-registry.yaml's red-witness-diff precondition, gates.manifest.json's red-witness precondition and typecheck project list, src/gates/red-witness.ts's isAuditedSource, and src/gates/citations.ts's DEFAULT_CITATION_CONFIG root list.",
      "finding": "CR-GW-001"
    },
    {
      "class-id": "coverage-gate-guard-that-tests-the-wrong-property",
      "probed": "Read src/gates/coverage.ts's REGEX_EXEC_CPU_BUDGET_MS mechanism (M4-P28) end to end: confirmed it measures process.threadCpuUsage() (thread CPU time) rather than wall-clock elapsed time, confirmed the wall-clock value (REGEX_EXEC_WALL_BACKSTOP_MS=500) is used only as retry patience with CPU accumulating across attempts, and confirmed delivery/STATE.md:2210 still describes the pre-fix defect as a standing warning even though the code no longer has it.",
      "cleared-because": "The mechanism at this head measures CPU work rather than elapsed time, which cannot be inflated by a busy machine (a descheduled thread accumulates no CPU); the standing-warning prose in STATE.md is stale documentation of a fixed defect, not a live code hazard."
    },
    {
      "class-id": "merge-authority-gate-fed-a-real-pair-for-the-first-time",
      "probed": "Constructed two real fixture verdict documents (phase M2-P1, head ad2428b76ef6f53f75b0d7f94c7db50463e077b7) in a scratch commit on my own clone (never pushed, reset afterward) and ran scripts/check-dual-review.mjs against them twice: once with framing colliding (both evidence-integrity) and once decorrelated (criteria-walk vs evidence-integrity), confirming the gate reds and greens correctly on exactly the dimension that differs.",
      "cleared-because": "src/checks.ts's dualReviewDecorrelation and verdictPairApproves reproducibly redden on a shared dimension and greenen on a genuinely decorrelated pair with no blocking finding; the code is not defective. A real operational risk remains for THIS sweep (my own dispatch fixes framing to a literal value; if the sibling reviewer's dispatch for this same group used the same literal framing, the two real verdicts this sweep produces will collide and redden even though produced-by and review-contract differ) but that is a dispatch/harness risk, not a code defect, so it is not filed as a finding here -- see escalations."
    }
  ]
}

```
