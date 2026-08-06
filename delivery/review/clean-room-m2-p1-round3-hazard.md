# Clean-room review, HAZARD-CONTRACT lens: M2-P1 fix round 2

PR #11, branch `claude/m2-p1-gate-contract-and-runner`.
Head reviewed: `411a320`. Previous reviewed head: `3c7970b`.
Reviewer lens: hazard contract. Concurrent: criteria lens.
Findings numbered from CR-900.

Status: COMPLETE. Verdict: FIX-ROUND-NEEDED (1 medium, 3 low).

## Delta under review

    git diff --name-only 3c7970b..411a320
    delivery/work-history/m2-p1.md
    src/commands/gates.ts
    src/gates/run.ts
    test/behaviors.json
    test/gates.test.ts

    git diff --stat 3c7970b..411a320
     delivery/work-history/m2-p1.md | 392 +++++
     src/commands/gates.ts          |   9 +
     src/gates/run.ts               | 284 +++--
     test/behaviors.json            |   5 +-
     test/gates.test.ts             | 348 +++-
     5 files changed, 995 insertions(+), 43 deletions(-)

Five commits: 0b20295, ab60efc, 73be601, 9d0ad8b, 411a320.

## Gates (floor toolchain, node v26.6.0 first on PATH)

    node --version -> v26.6.0 ; npm --version -> 11.x
    npm ci        exit 0 (no EBADENGINE)
    npm run build exit 0
    npm test      exit 0, tests 196, pass 196, fail 0, skipped 0, todo 0

Default toolchain run: see below.

---

## CR-900 (MEDIUM): the claim rule covers only `writeFileSync`; the runner still DELETES and still DISPATCHES into a directory it does not hold

### The mechanism, restated

The round names CR-860's mechanism correctly:

> cleanup that is valid only while the claim is held, performed from a frame
> that does not know whether the claim is held

and then closes it for exactly one kind of operation: writing file CONTENT via
`guardedWrite`/`writeFileSync`. The evidence directory is mutated by four kinds
of operation, not one:

| kind | site | claim-checked? |
|---|---|---|
| content write | 5 sites, all via `writeInsideClaim` | YES |
| **delete** | `src/gates/run.ts:587` `rmSync(recordPath, { force: true })` | **NO** |
| rename (publish) | `src/gates/run.ts:1012` `renameSync(stage, summary.json)` | indirectly (staging write is checked, so the rename is unreachable under a lost claim) |
| mkdir | `src/gates/run.ts:240` / `:1248` `ensureDirectory` | NO (creates only) |

and by a fifth thing the runner controls: **it hands a path inside the
directory to a subprocess it chooses to spawn**, with no re-check.

`rmSync` at 587 is literally the mechanism sentence: it is CLEANUP ("clearing a
stale record"), it is valid only while the claim is held, and it is performed
from a frame that does not know whether the claim is held.

### The construction (this defeats the totality claim)

Two-gate manifest. Gate `g-a` steals the claim mid-run (deletes it and plants a
foreign claim `aaaa...`), then, as the new holder would, writes
`ev/g-b/result.json` and `ev/g-b/foreign-note.txt`. Gate `g-b` is ordinary.
Fixture: `../HZF-lab/mk.mjs`, run dir `../HZF-lab/c2`.

    $ node bin/tiphys.ts gates run --manifest .../manifest.json --evidence .../ev
    gates: run 399c517bb2cf24f381410f06
    gates: declared 2 applicable 2 verdict 0 green 0 red 0 not-applicable 0 error 2 vacuous 0
    gates: refusing to write .../ev/summary.json.399c517bb2cf24f381410f06.stage: this run
      (399c517bb2cf24f381410f06) does not hold the claim on .../ev
      (held by aaaaaaaaaaaaaaaaaaaaaaaa)
    EXIT=21

Good: exit 21, no summary, foreign claim left intact. That half of the fix
holds. But:

    --- ev/g-b/result.json AFTER (planted content was
        "FOREIGN RUN aaaaaaaaaaaaaaaaaaaaaaaa OWNS THIS")
    {
      "gate": "g-b",
      "status": "green",
      ...

The foreign holder's record was destroyed and replaced with content produced by
run `399c517b...`, which at that moment held no claim.

### The control (isolates the runner's own delete)

Same fixture, `g-b` replaced with `process.exit(0)` so the GATE writes nothing
(dir `../HZF-lab/c2b`):

    EXIT=21
    --- ev/g-b listing AFTER (g-b wrote nothing):
    foreign-note.txt
    --- result.json present?
    GONE
    --- claim still foreign?
    {"runId":"aaaaaaaaaaaaaaaaaaaaaaaa","manifest":"other-run"}

`foreign-note.txt` survives, so nothing blanket-cleared the directory.
`result.json` is gone with no gate having written or removed it: the deletion is
the RUNNER's `rmSync` at `run.ts:587`, executed while holding no claim. This
also shows the runner still SPAWNS `g-b` into the unowned directory, which it
could have declined to do.

### Why the derivation did not see it

The published derivation is:

    grep -n 'releaseEvidenceDirectory\|writeInsideClaim\|guardedWrite\|claimEvidenceDirectory\|claimHolder' src/gates/run.ts

Every alternative in that pattern is the name of a function introduced or
touched by this round. A grep for the call sites of the new guard cannot, by
construction, find a mutation that does not go through the new guard, so its
empty result is indistinguishable from an absence of defects. This is the exact
failure mode CLAUDE.md's fix-round contract item 3 names and says has bitten
this project three times.

A mutation-shaped derivation finds them at once, and this project already ran
one in the SAME work history (the CR-803 section, lines 510-513, listing
`run.ts:160 mkdirSync` and `run.ts:462 rmSync`):

    $ grep -rnE 'writeFileSync|renameSync|unlinkSync|mkdirSync|rmSync|cpSync' src/gates/run.ts
    src/gates/run.ts:240:    mkdirSync(path, { recursive: true }),
    src/gates/run.ts:287:  const written = runStep(`writing ${path}`, () => writeFileSync(path, body));
    src/gates/run.ts:587:    rmSync(recordPath, { force: true }),
    src/gates/run.ts:954:    writeFileSync(claimPath, body, { flag: "wx" });
    src/gates/run.ts:1012:    renameSync(stagePath, summaryPath),
    src/gates/run.ts:1064:    unlinkSync(join(evidenceDir, RUN_CLAIM_FILE));

The round's four-item "did NOT cover" list mentions the gates' own writes,
`guardedWrite`'s direct reachability, the unwitnessed two-runner collision, and
`src/lock.ts`. None of them is this. Item 1 ("this runner cannot guard another
process's write") does not cover it either: the harm here is the runner's OWN
`rmSync`, and the subprocess write is one the runner CHOSE to dispatch after
losing the claim, which it can control.

### Severity

MEDIUM, and the reason is completeness plus an overstated invariant, not
likelihood. The work history states "**Every write into the evidence directory
verifies the claim**" and "**Five** writes into the directory, all through
`writeInsideClaim`", presented as closing the mechanism rather than its
instances. A construction defeats it in one run. Seven M2 phases will build on
this runner and on that sentence; a later phase reading it will believe a
stolen claim cannot cost it evidence, and the control above shows it can.

The minimal fix is small and matches what the round already did elsewhere: call
`claimHolder` once at the top of `runOneGate` and return an error result if it
is not this run, which covers the `rmSync`, the `mkdirSync` and the spawn in one
place; or state the exclusion explicitly in the not-covered list and accept it.
Either is acceptable to me. What is not acceptable is the sentence as written.

---

## CR-901 (LOW): G7's "UNWITNESSABLE" is an impossibility claim, and two constructions defeat it

The round records:

> With the integer and presence screens in place, `counts.green === 0` and
> `!(counts.green > 0)` agree on every value that can reach them, so no input
> distinguishes the two forms. ... It is recorded as UNWITNESSABLE rather than
> as witnessed.

"No input distinguishes the two forms" is the T-006 shape, and it is false. The
two screens do not screen the same set of properties: the bad-count screen uses
`Object.entries` (own ENUMERABLE properties), the presence screen uses
`Object.prototype.hasOwnProperty` (own properties, enumerable or not). A count
that is own-but-not-enumerable passes both screens unexamined.

Probe `../HZF-lab/g7.mts`, against `src/gates/run.ts` at `411a320`:

    B: Object.entries sees green?  false
    B: hasOwnProperty green?       true
    B: counts.green =              NaN
    B: shipped form  !(green>0) =  true
    B: old form    green === 0  =  false
    B: decideAggregate -> {"exitCode":21,"reason":"internal inconsistency: the run
       reached the success path with zero green gates (...)"}
    A: decideAggregate -> {"exitCode":21, ...}          (enumerable getter variant)
    CTL: {"exitCode":0,"reason":"every applicable gate is green"}

Construction B is a plain data property: `Object.defineProperty(counts, "green",
{ value: NaN, enumerable: false })`. Construction A is an enumerable getter
returning 1 to the screen and NaN to the assertion. Both reach EXIT_GREEN.

With the G7 defang applied (`!(counts.green > 0)` back to `counts.green === 0`):

    B: decideAggregate -> {"exitCode":0,"reason":"every applicable gate is green"}
    A: decideAggregate -> {"exitCode":0,"reason":"every applicable gate is green"}
    CTL:                  {"exitCode":0,"reason":"every applicable gate is green"}

A silent false green with `green` equal to NaN. The registered test
`gate-aggregate-total-over-bad-counts` stays GREEN under that defang, so it does
not guard this.

LOW, and the direction matters: the SHIPPED form is the safe one and it catches
both constructions. The code is right; the sentence about it is wrong. The round
kept `!(x > 0)` on the "belt and braces" argument and then told itself the
argument was unfalsifiable; it was not, and the constructions vindicate the
choice rather than undermining it. The fix is to restate the G7 row as WITNESSED
with one of these two inputs, which costs about three lines in the existing test,
or to restate the sentence as a scope limit ("I did not find an input that
distinguishes them" is true; "no input distinguishes them" is not).

## CR-902 (LOW, orchestrator's action, not the implementer's): the CR-861 carry-forward is only in this phase's work history

Judgement on the residual itself first: **it is genuinely unfixable at this
layer and the round is right.** A sibling marker in `evidenceDir` is a write
into a directory the refused run does not own, which is the exact thing the fix
forbids and would additionally be a file the real holder never authorised;
outside `evidenceDir` the runner owns no location to write to; and touching
`summary.json` is worse than doing nothing. The refusal already carries both
ids and the holder's id, which is everything this layer can supply. No finding
on the analysis.

The finding is on the placement. The round writes:

> That is now written where M2-P9 will read it.

    $ grep -rln 'without knowing which run\|which run it asked for' --include='*.md' \
        --include='*.json' --include='*.ts' .
    ./delivery/work-history/m2-p1.md

One hit, and it is this phase's own work history. `delivery/plan/kernel-plan-m2.md`,
`MECHANISMS.md` and `delivery/tuition/` are untouched by this branch (correctly:
they are outside the phase's files-to-touch, and CR-863/866 were handed to the
orchestrator on the paperwork branch). So the sentence is an overstatement of
the same kind as CR-901: the note is written where a reader of M2-P1 will read
it, not where M2-P9 or the seven concurrent phases will. Nobody opens another
phase's work history.

LOW because the ACTION sits with the orchestrator, not with a fix round: one
line in the M2 plan's M2-P9 section, or a tuition entry, on the paperwork
branch. The implementer's correct move is to say so rather than to claim the
carry-forward already happened.

## CR-903 (LOW, trivial): `RunOutcome.refused` is written and never read

    $ grep -rn '\.refused\|refused:' src/ test/
    src/gates/run.ts:1158:    return { runId, ..., refused: true };
    (no other hit in src/ or test/ that reads this field)

One producer, zero consumers. Either a consumer is intended in M2-P9, in which
case say so at the declaration, or the field is speculative surface on the
phase's public interface and should go. Trivial.

## Verified clean (constructions run, no finding)

**G2b is real and it is the round's best result.** Verified, not taken on trust.
Defang D-A reinstates the round-1 ordering (release before the aborted-summary
write) in the inner catch, rebuilt, `--test-name-pattern` before the path:

    [FAIL] a run releases only the claim it holds, and writes nothing after releasing
      Error: ENOENT: no such file or directory, open '/tmp/tiphys-gates-d52eK1/ev-crash/summary.json'
      [i] pass 0  fail 1

(Node's reporter glyphs transliterated to ASCII: [ok]=pass, [FAIL]=fail, [i]=info.)

Then defang D-B = D-A plus the write-side check removed, which is the round-1
state, driven through the compiled entry with the schema deleted to force the
crash path:

    EXIT=21
    END STATE under D-B (round-1 ordering, no write-side check):
      summary.json PRESENT
      claim GONE

Identical to the SAFE end state. So the ordering really is invisible to an
end-state assertion, and `writeInsideClaim` really is what makes it produce a
different outcome. The insight is load-bearing and correctly reported.

**Claim file unreadable mid-run is LOUD, not silent.** A gate corrupts the claim
to `{ this is not json` mid-run:

    gates: run 79db87cd72417f3b597e7a1d
    gates: refusing to write .../ev/summary.json.79db87cd72417f3b597e7a1d.stage: this run
      (79db87cd72417f3b597e7a1d) does not hold the claim on .../ev (held by nobody)
    EXIT=21

Fails closed with an actionable message. The corrupt claim is left stranded
(release returns false), so the directory needs one `rm` before reuse; that is
the conservative direction (an unparseable claim may be a live holder's torn
write) and the next run's refusal names the file and says to delete it. No
finding.

**`guardedWrite` as a surviving primitive: acceptable, and not the residual that
matters.** Re-derived independently:

    $ grep -rn 'guardedWrite' src/
    src/gates/run.ts:278:  return guardedWrite(path, body);
    src/gates/run.ts:282:function guardedWrite(path: string, body: string): string | undefined {

Exactly one caller, `writeInsideClaim` itself, and the function is file-private.
The round's not-covered item 2 states this correctly. It is an acceptable stated
residual. CR-900 is the residual that matters, and the round's derivation was
pointed at the wrong primitive to find it.

**G3's label is honest.** "With correct ordering and no external interference,
the write-side check is unobservable by construction" names its own scope, and
the check is witnessed under member (c) where the interference is external. I
attempted a non-external construction (a runner-internal path that writes while
not holding its own claim) and did not find one: every write site now sits
inside the claimed region. Scope of that negative: I searched only
`src/gates/run.ts` and only the `runGates` call tree; I did not enumerate
callers of `runGates` outside `src/commands/gates.ts`.

## Regression and gates

    node v26.6.0 (floor, first on PATH)
      npm ci        exit 0, no EBADENGINE
      npm run build exit 0, clean git status after build
      npm test      exit 0 -- tests 196, pass 196, fail 0, skipped 0, todo 0

    node v22.22.2 (default toolchain, via bash -lc)
      npm test      exit 0 -- tests 196, pass 194, fail 0, skipped 2, todo 0
      the 2 skips are the floor-gated doctor tests, expected per CLAUDE.md

    spot-checks (--test-name-pattern before the path):
      [ok] decideAggregate is total over counts that are not non-negative integers
      [ok] a named pipe at the manifest path, a precondition target, or a record path
        is error naming the type and returns      (M2-C-6 mkfifo)
      [ok] a run releases only the claim it holds ... (control arm, pristine tree)

    registry: 202 entries, 0 whose description resolves to no test title
    behaviors.json delta: +3, append-only, no rewrites

## Scope audit

    $ git diff --name-only 3c7970b..411a320
    delivery/work-history/m2-p1.md
    src/commands/gates.ts
    src/gates/run.ts
    test/behaviors.json
    test/gates.test.ts

Five files, all inside the 16-file envelope. No plan, no MECHANISMS.md, no
`bin/`, no `src/task.ts`, no `src/lock.ts`, no `gates.manifest.json`. PASS.

## Conventions

ASCII pure (`grep -cP '[^\x00-\x7F]'` returns 0 on all five changed files), no
em dashes, npm only, no tool or model names in the five commit subjects.

## The pasted claim-grep block

Verified against the object rather than re-run:

    $ git show 9d0ad8b:delivery/work-history/m2-p1.md | grep -nEi 'cannot be|impossible|...' > actual
    ACTUAL line count: 33      PASTED line count: 33
    $ diff <(cut -c1-125 actual) pasted
    BYTE-IDENTICAL (after the declared 125-col truncation)

The block declares 33 lines and 125-column truncation and both hold. This is the
first claim-grep transcript in this phase that reproduces exactly. CR-865 and
CR-880-1 are discharged.

## Verdict

**FIX-ROUND-NEEDED**, on CR-900 alone.

I want to be precise about the cost, because DR-0016 sends a third round to a
fresh implementer. CR-900 is not "the design is wrong". The claim lifecycle, the
single release, the holder-verified release, the foreign-claim-left-in-place
rule, the emission of `gates: run <id>` on every outcome and the refusal naming
both ids are all correct and I could not break any of them. What is wrong is one
sentence and about four lines of code: the work history states a total property
("every write into the evidence directory verifies the claim") that a
two-gate construction defeats in one run, because the derivation that certified
it could only see the sites that go through the new guard. Either a
`claimHolder` check at the top of `runOneGate`, or an honest entry in the
not-covered list, discharges it.

CR-901, CR-902 and CR-903 are genuinely low and none of them blocks.

## Log

Isolation: worked exclusively in this directory, detached at `411a320`.
`src/gates/run.ts` was mutated for defangs D-A, D-B and G7 and restored from
`../HZF-lab/run.ts.PRISTINE` by copy, never by `git checkout --`; final
`md5sum src/gates/run.ts` is `139c66ec9921227f8d5c9625a7e96dd2`, matching the
pristine copy, and `git status --porcelain` shows only this untracked
`REVIEW-OUT.md`. Two full-suite runs used, the cap. The main repo and
`m2p1-f-criteria` were not touched.
