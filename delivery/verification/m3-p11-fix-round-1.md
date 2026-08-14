# M3-P11 fix round 1: delta verification

Delta verifier, adversarial pass. Branch under verification:
`claude/m3-p11-precondition-crash-verdict`, reviewed head `a73313d`, fix round
`a73313d..6274414`, with `origin/main` merged in at `2947240`. This document
lives on `claude/verify-m3-p11-fr1`, cut from `main` at `6fa9633` per T-019, in
its own worktree; the phase branch itself was never modified (checked at the
end of this pass: `git log --oneline -1` in the phase worktree still reports
`6274414`, and `git status --short` reports no tracked-file changes, only
the gitignored `node_modules` copy and `dist/` build output as untracked-and-
ignored).

Status: COMPLETE. Written incrementally and committed as work progressed;
the verdict section at the bottom was the last thing written.

## What this document does NOT cover

- No attempt was made to re-run the two prior clean-room reviews
  (`delivery/review/clean-room-m3-p11-criteria.md`,
  `delivery/review/clean-room-m3-p11-hazard.md`). This is a delta pass over
  the fix round only, as scoped.
- No attempt was made to read CI. `gh` 401s against REST in this environment
  and any check depending on it fails silently; this document relies only on
  local execution, quoted with toolchain, build state and invocation.
- The full M3-P11 phase spec and plan are not re-litigated; only the fix
  round's own claims (mechanism 1 halves A/B, mechanism 2 C-1/C-2/M-1, and the
  witness claims) are attacked.
- Attack surface not exercised: environment-variable-named operands and
  shell-produced operands (the round's own residue 4, unchanged; not
  re-attempted here either). `=`-joined long options, quoted substrings and
  multi-byte paths in argv were not fuzzed (round's residue 7); this pass
  added a small number of additional concrete shapes (see below) rather than
  a systematic fuzz.
- The 25-mutation-member witness re-derivation (below) covers only
  `kind: "mutation"` members targeting the three files this round changed
  (`src/gates/run.ts`, `src/commands/gates.ts`, `src/gates/scope.ts`), which
  is the same scope the round itself claimed; `patch` and `baseline-ref`
  members, and specs over files outside that set, were not re-checked here.
- The `credential-scrub`/`credential-token` signal-crash finding below (item
  6) was verified against `probeCredentialSources` directly (an exported
  function), not against the packed CLI end to end through
  `tiphys gates run`; the two are not expected to differ (the CLI is a thin
  wrapper that calls the same verdict-from-probes path), but that composition
  was not independently re-run.
- `pool.ts`'s several `result.status === 0` sites were read but not
  individually attacked with a live signal-kill; they were judged lower risk
  by inspection (fallback-chain semantics: a crash there just falls through
  to try the next resolution method, rather than being read as a specific
  positive claim the way `credentials.ts`'s per-source classification is).
  That judgment is stated, not proven by execution, and is flagged as such in
  the finding below.
- No attempt was made to verify the round's claims about macOS portability,
  the FIFO/mkfifo tests, or the privilege-drop-to-uid-65534 mechanics beyond
  what was needed to run the two witnesses re-derived below; those were
  trusted from the round's own document rather than independently redone.

## Setup

Worktree at an absolute scratch path, not inside the primary repository:

```
git worktree add <scratch>/wt/verify origin/main --detach   # this document's home
git worktree add <scratch>/wt/phase claude/m3-p11-precondition-crash-verdict --detach  # code under test
```

`node_modules` copied from the primary repository into the phase worktree
(no network available); `npm run build` there exits 0.

Toolchain: node v26.6.0 (confirmed via `node --version`), fetched per the
CLAUDE.md standing warning, on `$PATH` ahead of the system node.

Non-root non-issue for one direction, checked directly: `id -u` in the
sandbox this session runs in printed `0` (root). The round's own document
records that unreadability does not exist as root and that its tests drop to
uid 65534; every attack below that depends on the OS actually refusing an
`access(R_OK)`/open (the no-slash residue, the false-error cases) was run as
an ordinary spawned child with no elevated capability requirement, since none
of them rely on a `chmod 000` file, only on absence, deletion, or content
shape. Where a test in the round's own suite specifically exercises the
`chmod 000` member, it already drops privilege internally (confirmed by
reading `test/gates.test.ts`'s `runCliUnprivileged` helper) and that
machinery was exercised via `npm test` (below), not reinvented here.

## Diff read

The fix round's own diff (`a73313d..6274414`) was read in full:
`src/gates/run.ts` (probeOpenable, commandPathCandidates, attributionGaps,
the half-B call site in `evaluatePrecondition`), `src/gates/scope.ts`
(`describeAddition`, the `foreignDeclarations` computation and the new red
branch), and `src/commands/gates.ts` (`printableDetail`, the relay loop).
Line numbers below are quoted rather than cited with `:LINE` wherever the
file is in the branch's changed set (`git diff --name-only
origin/main...claude/m3-p11-precondition-crash-verdict`), per CLAUDE.md's
T-019 resolution: quoting into a file the reviewed branch changes, since that
file's line numbers do not resolve to the same content on `main`.

## Finding 1 (HIGH, but ALREADY DECLARED by the round): the no-slash residue reproduces the phase's own target defect

The round's own comment at (quoted, branch-only) `src/gates/run.ts`, in
`commandPathCandidates`'s docstring, states outright: "an operand with no `/`
in it (`node script.mjs` from the command's own cwd) is invisible to this
scan for the same reason `.` and `src` must be". This was reproduced through
the real packed CLI, not just read.

Command run (fix-round head, `node -e` build, `npm run build` already
exited 0 in this worktree so no skip-nine-tests gap applies to this
manual CLI run either):

```
$ node bin/tiphys.ts gates run --manifest manifest.json --evidence evidence
```

where `manifest.json` declares one gate with `precondition.command: ["node",
"does-not-exist-noslash.mjs"]` and the invoking cwd genuinely has no such
file. Captured verdict:

```
gates: g-probe: not-applicable: precondition needs-noslash-script evaluated
and unmet: node does-not-exist-noslash.mjs exited 1
```

`result.json`'s `status` field: `"not-applicable"`. This is the exact defect
class M3-P11 exists to close (DR-0029's anti-vacuity machinery): a command
that could not run at all (Node's own "Cannot find module" exit 1, identical
in shape to "row two" of the phase's own crash-vs-skip table) is reported
indistinguishable from a legitimate, evaluated skip.

Severity assessment: this is marked HIGH as a live defect in the mechanism,
but it is TRACKED, not a new discovery. `delivery/work-history/m3-p11.md`
(quoted, branch-only; the relevant section is titled "WHAT THE DERIVATIONS
DID NOT COVER") names this residue explicitly as item 2, calls it "the
residue that matters most", and states plainly "I did not find a way to
separate those two by shape, and I am stating that as 'I did not find a way',
not as 'it cannot be done'" (satisfying the claim-grep discipline). This
verification reproduces that residue with a concrete execution rather than
discovering something new, and confirms the implementer's own severity
assessment ("matters most") is accurate rather than understated.

What breaks for a real user: any future gate author who writes a
`command-exit-zero` precondition as `["node", "check.mjs"]` (a script sitting
in the invocation's own cwd, named without a leading `./` or a directory
prefix) gets a silent `not-applicable` instead of a loud `error` the moment
that script is absent, misconfigured, or shipped incorrectly (the same
"eleven gates naming unshipped paths" class the round's item 6 already flags
as M4/DR-0029 territory, but for the OPERAND rather than the launcher).

## Finding 2 (MEDIUM/HIGH, NEW and more concrete than the round's own note): the post-spawn scan turns realistic, self-contained legitimate skips into false `error`, and one false `error` fails the WHOLE bundle regardless of applicability

The round's own comment on `commandPathCandidates` (quoted, branch-only)
already names, in the abstract, that "an element that is inline code
CONTAINING a slash will be treated as a path and produce a loud false
`error` on the nonzero arm" and calls this an "accepted, declared cost". This
verification confirms it is real, and shows it is easier to trigger, on a
more ordinary precondition shape, than the abstract note suggests.

### 2a. A self-contained `node -e` existence check, with no filesystem
     interaction beyond the check's own subject, is misreported

Constructed precondition (a completely ordinary "run this gate only if some
marker/config file is present or absent" pattern):

```
command: ["node", "-e",
  "process.exit(require(\"fs\").existsSync(\"/nonexistent-optional-marker-9f3a\")?0:1)"]
```

This is inline code, no whitespace (so it is skipped by the PRE-spawn rule's
option-value guard exactly like `credential-token`'s own precondition is),
self-contained (queries nothing but its own literal argument), and it
legitimately decides "unmet" via a clean `exit(1)`: nothing crashed, nothing
was missing that the command itself needed to run. Captured verdict at the
fix-round head, real CLI:

```
gates: g-probe: error: precondition optional-marker command node -e
process.exit(require("fs").existsSync("/nonexistent-optional-marker-9f3a")?0:1)
exited 1, and that exit CANNOT BE ATTRIBUTED to an evaluated precondition: 1
path-shaped argv element(s) cannot be opened by this process:
process.exit(require("fs").existsSync("/nonexistent-optional-marker-9f3a")?0:1)
does not exist (resolved to <cwd>/process.exit(...))
```

`attributionGaps` treats the ENTIRE `-e` code string as a candidate path
because it contains `/`, resolves it against `cwd` (nonsense: it is not a
path at all, it is source code), finds nothing there (of course: it is not a
path), and reports the legitimate, working, self-evaluating precondition as
`error`. This is not a contrived shape; checking for an optional file's
absence/presence inline is exactly the pattern `credential-token` itself
uses one level simpler (env var rather than filesystem). Any inline
precondition that mentions an absolute path literal, a URL, a date
(`2026/08/14`), a regex (`/^\d+$/`), or plain division (`10/2`) and
legitimately exits nonzero is exposed the same way; a second, narrower
reproduction (pure arithmetic, `process.exit(10/2===5?1:0)`) was also run and
produces the identical misclassification.

### 2b. A script that legitimately decides "unmet" and deletes ITSELF as its
     last, ordinary act (a one-shot/bootstrap pattern) is also misreported

```
command: ["node", "<scratch>/one-shot-check.mjs"]
```

where the script's body is `unlinkSync(import.meta.url-as-path);
process.exit(met?0:1)` with `met = false`. Captured verdict, fix-round head:

```
gates: g-probe: error: precondition one-shot command node
<scratch>/one-shot-check.mjs exited 1, and that exit CANNOT BE ATTRIBUTED to
an evaluated precondition: 1 path-shaped argv element(s) cannot be opened by
this process: <scratch>/one-shot-check.mjs does not exist ...
```

The scan runs AFTER the spawn completes and re-probes the filesystem at that
later moment, so any legitimate cleanup a precondition script performs on its
OWN argv path (deleting a lockfile with the same name as itself, a
self-cleaning temp script, a bootstrap script that removes itself once run)
converts a correct "unmet" into a false "error". This is order-of-operations,
not a race: it reproduces deterministically every time, no timing window
needed. A variant staging a SEPARATE marker/lockfile deletion (not the
script's own path) rather than a self-delete does NOT trigger this, because
`attributionGaps` only scans `command`'s own argv elements, not files the
command happens to touch, confirmed by testing both shapes.

### Why this matters beyond "the round already knew"

`decideAggregate` (quoted, branch-only; `src/gates/run.ts`) checks
`counts.error > 0` FIRST, before red, before required-not-applicable: **one**
false-error verdict on **any** gate, `required` or merely `conditional`,
forces the entire bundle to `EXIT_GATE_ERROR` (21) and a `gates: N gate(s)
reported error: ...` line. So this is not "one gate quietly reports its own
wrong status"; it is "one ordinary, working, self-contained inline
precondition that happens to legitimately decide unmet via a path-shaped
literal takes the whole run down as an error", which is a stronger effect
than the round's phrase "the false positive is a loud `error` an operator can
read and fix" suggests: there is nothing to fix except rewriting a
perfectly correct precondition to avoid looking path-shaped, which the
round's own comment acknowledges ("If such an element is not a path, give
the command a form in which it is not path-shaped") but which is a real
authoring tax the abstract residue note undersells.

Verdict on this finding: CONFIRMED, real, reproduced twice with two
structurally different triggers (2a: inline code; 2b: self-deleting script).
Rated MEDIUM/HIGH rather than a plain TRACKED, because unlike Finding 1 the
round's own documentation states the RESIDUE exists but does not demonstrate
how ordinary the trigger is or that it takes down the WHOLE bundle
regardless of applicability; that composition with `decideAggregate` was not
walked in the round's own document.

## Finding 3 (informational, CONFIRMS the round's claim): `credential-token` arm is verified unaffected

Read `gates.manifest.json` (unchanged by this branch, resolves on `main`)
directly. The `credential-token` gate's declaration spans
gates.manifest.json:43-59 on `main` (id `credential-token`), and its
precondition command is `["node", "-e", "process.exit(process.env.
TIPHYS_IMPLEMENTER_TOKEN === undefined ? 1 : 0)"]`.

Confirmed on `main`: gates.manifest.json:57 holds exactly that command
string. No `/` anywhere in it, so it is invisible to `commandPathCandidates`
on the nonzero arm exactly as the round claims. Ran the REAL declaration
(not a fixture copy) through the packed CLI at the fix-round head, in the
phase worktree, with `TIPHYS_IMPLEMENTER_TOKEN` unset:

```
$ node bin/tiphys.ts gates run --manifest gates.manifest.json --only \
    credential-token --evidence evidence
gates: credential-token: not-applicable: precondition
implementer-token-present-owner-action-a-3 evaluated and unmet: node -e
process.exit(process.env.TIPHYS_IMPLEMENTER_TOKEN === undefined ? 1 : 0)
exited 1
```

`result.json` status: `"not-applicable"`, not `"error"`. Confirmed: the
round's claim that this arm is unaffected is TRUE, verified against the real
manifest entry rather than a paraphrase of it.

Judging the deliberate behaviour change (task item 3's second half): whether
"any realistic inline precondition is now wrongly refused" -- Finding 2a
above answers this directly and concretely: yes. `credential-token` survives
only because it happens to carry no slash; any inline precondition that
DOES (which is common for anything touching a path, URL, date or division)
is exposed. This is the same fact as Finding 2, restated from the "is the
one shipped declaration safe" angle rather than the "can a false error be
constructed" angle.

## Finding 4: C-2's bluntness -- no counter-example found, and the merge case that would most plausibly break it is confirmed handled correctly

Attempted to construct a case where a phase branch legitimately needs to
touch another phase's declaration. Two angles:

1. **Direct edit of another phase's declaration file.** No legitimate
   scenario found; every plausible reason to touch it (a typo fix, a
   post-merge correction, a schema migration) is squarely "paperwork", which
   the scope gate's own commentary (quoted, branch-only,
   `src/gates/scope.ts`) already excludes by construction: paperwork
   branches do not match the phase-branch pattern this gate audits, so the
   correct venue already exists and does not need C-2 relaxed.
2. **An ordinary `git merge origin/main` bringing in a NEW phase declaration
   that main gained after the branch's fork point**, which was the
   candidate most likely to produce a FALSE positive (a legitimate merge
   misread as a violation). Read `computeTouchedPaths` (quoted, branch-only,
   `src/gates/scope.ts`): it diffs `git diff --name-status <mergeBase>
   <head>` where `mergeBase` is the ACTUAL git merge-base of `--base` and
   `--head`, not `--base` itself. If a phase branch merges main in, the
   merge-base of a later `--base` (a fresher `origin/main`) and the phase's
   `--head` becomes the point up to which the branch has already absorbed
   main, so any declaration file main gained AFTER that point and BEFORE the
   branch's own tip is already present, byte-identical, at both ends of the
   diff and does not appear as "touched" at all. This is not merely reasoned
   through: the round's own pre-existing test (quoted, branch-only,
   `test/scope-gate.test.ts`, "diffs are computed against the merge base of
   base and head, so a base that has advanced past the fork point does not
   misattribute another phase's changes") exercises exactly this shape (main
   advancing independently after the fork) and asserts `mergeBase ===
   forkPoint`, `mergeBase !== advancedMain`, and a GREEN result with no
   mention of the file main changed. Re-ran it directly:

```
$ node --test --test-name-pattern "diffs are computed against the merge base" \
    test/scope-gate.test.ts
tests 1  pass 1  fail 0
```

So: I did not find a counter-example, matching the orchestrator's own stated
conclusion (round's item 8), and the specific case most likely to produce a
FALSE positive under the blunt rule (an ordinary main-merge) is confirmed,
by a passing pre-existing test plus independent code reading, not to
misfire. This is a "did not find a way", stated as such rather than as
"cannot be done": no exhaustive search was run and none is claimed.

## Finding 5: witnesses re-derived independently, both confirmed

### Red/green, two of the round's five named tests, run against BOTH arms directly

Built a detached worktree at the REVIEWED head (`a73313d`), copied the fix
round's own `test/gates.test.ts` and `test/scope-gate.test.ts` into it (the
"pre-fix source, this round's tests verbatim" shape the round's own document
describes), and ran the two tests that most directly guard the two
mechanisms:

```
$ node --test --test-name-pattern \
  "a precondition command exiting nonzero is error, not a skip" \
  test/gates.test.ts        # at a73313d (reviewed head), round's tests
```
```
tests 1  pass 0  fail 1
AssertionError: unreadable reported not-applicable ... actual
'not-applicable' expected 'error'
```

```
$ node --test --test-name-pattern \
  "a phase branch that changes ANOTHER phase's declaration is red" \
  test/scope-gate.test.ts   # at a73313d (reviewed head), round's tests
```
```
tests 1  pass 0  fail 1
AssertionError: scope: green (3 changed paths audited) ... DECLARATION
AMENDED AT HEAD: ... filesToTouch delivery/plan/phase-declarations/.
```

Both RED at the reviewed head, and both GREEN when the same commands were
re-run in the fix-round worktree (`6274414`) without modification:

```
$ node --test --test-name-pattern \
  "a precondition command exiting nonzero is error, not a skip" \
  test/gates.test.ts        # at 6274414 (fix-round head)
tests 1  pass 1  fail 0
```
```
$ node --test --test-name-pattern \
  "a phase branch that changes ANOTHER phase's declaration is red" \
  test/scope-gate.test.ts   # at 6274414 (fix-round head)
tests 1  pass 1  fail 0
```

This confirms the round's red-witness claim for these two tests directly
against the dangerous state (the reviewed head running the round's own
tests), not merely trusting the transliterated capture in the work history.

### 25-mutation-member claim, re-derived independently rather than trusted

The round's document quotes a derivation command as `$ node -e '...' over
witness/*.json` with the body elided. Wrote an independent script from
scratch (not copied from the round's own harness) implementing the same
rule stated in prose: for every `witness/*.json` spec, count
`dangerousStates` entries with `kind: "mutation"` whose `file` is one of the
three files this round changed, and check each one's `find` string appears
in that file's current content EXACTLY once.

```
$ node rederive-witnesses.mjs <phase-worktree>
gate-command-unrunnable-names-path.json | members on changed files: 2 | mismatches: 0
gate-precondition-crash-vs-skip.json | members on changed files: 2 | mismatches: 0
gate-registry-checklist-not-executed.json | members on changed files: 2 | mismatches: 0
gate-registry-cli-selection.json | members on changed files: 2 | mismatches: 0
gate-registry-mode-excludes.json | members on changed files: 2 | mismatches: 0
gate-registry-zero-units-green.json | members on changed files: 2 | mismatches: 0
gates-command-prints-green-detail.json | members on changed files: 2 | mismatches: 0
gates-command-prints-nongreen-detail.json | members on changed files: 2 | mismatches: 0
macos-portability-scope-entry.json | members on changed files: 1 | mismatches: 0
precondition-nonzero-exit-attributable.json | members on changed files: 2 | mismatches: 0
scope-declaration-both-sides.json | members on changed files: 2 | mismatches: 0
scope-foreign-declaration-refused.json | members on changed files: 2 | mismatches: 0
scope-phase-own-evidence.json | members on changed files: 2 | mismatches: 0
TOTAL members on changed files: 25 | TOTAL mismatches: 0
```

Matches the round's claim exactly: thirteen specs, twenty-five members,
zero stale. Independently derived, not copy-pasted from the round's script
(which was not shown in full), and it agrees.

### C-1 (relay every row) and the CR escape, verified live, both directions

Constructed a green fixture gate whose `detail` contains a raw `\r`
(carriage return) followed by text designed to visually overwrite the start
of the line on a naive terminal. At the fix-round head:

```
$ node bin/tiphys.ts gates run --manifest manifest.json --evidence evidence \
    | cat -A
gates: run <id>$
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 \
  error 0 vacuous 0$
gates: g-cr: green: line-one\x0dOVERWRITE-ATTEMPT$
gates: every applicable gate is green$
```

The green row's detail IS printed (confirming C-1: green rows are no
longer skipped) and the raw `\r` (`cat -A` renders it as `^M`, absent here
because it never reaches the stream) is rendered as the literal escape
`\x0d` rather than a live control character (confirming `printableDetail`).
Re-ran the identical manifest at the REVIEWED head as a negative control:

```
$ node bin/tiphys.ts gates run --manifest manifest.json --evidence evidence2
gates: run <id>
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 \
  error 0 vacuous 0
gates: every applicable gate is green
```

No `gates: g-cr: ...` line at all: the green detail (and with it, both the
scope-amendment note and the raw `\r`) was silently dropped at the reviewed
head, confirming C-1 closes a real gap rather than a cosmetic one.

One residual gap in `printableDetail`, noted for completeness rather than
raised as a finding: the escaping covers C0 controls and DEL (`code < 0x20 ||
code === 0x7f`) and `singleLine` covers `\n`. Neither covers U+2028 (LINE
SEPARATOR) or U+2029 (PARAGRAPH SEPARATOR), which some Unicode-aware log
consumers (not this repository's own reader, which is a plain byte/line
scan) treat as line breaks. The code's own comment claims coverage only for
"newline OR ... carriage return", so this is not a false claim by the
code, just an unclaimed residual; marked TRACKED, not scored, since gate
`detail` is manifest-authored trusted content per the same comment's own
framing, not external input.

## Finding 6 (MEDIUM, NEW, outside the round's declared scope but real): `credentials.ts` reads a signal-killed git/gh subprocess as a benign "clean" verdict in a REQUIRED gate

The round's document lists the `result.status === 0` sibling sites
(`citations.ts`, `scope.ts`, `credentials.ts`, `pool.ts`, `witness/run.ts`,
`doctor.ts`) and states it audited none of them and makes no claim about
any. This section is that audit, done because the task asked for it, not
because the round claimed otherwise.

Read each site:

- `src/gates/citations.ts` (`gitObjectType`) and `src/gates/scope.ts`
  (`isAncestorOf`): both check `result.error !== undefined` FIRST, and both
  additionally check `result.signal` explicitly before falling through,
  returning `error` rather than a guessed verdict for anything outside the
  documented `git` exit-code contract. No misreport found.
- `src/witness/run.ts` (`gitIn`): `ok = result.status === 0`, but this
  helper returns a plain boolean plus the raw `status`/`reason`, never a
  POSITIVE semantic claim about what "not ok" means; a signal-killed git
  call correctly reads as `ok: false` (`null !== 0`). The test-runner
  function one level up (`runNamedTests`) separately checks `.error` and
  `.signal` before touching `.status`, and derives pass/fail per NAMED TEST
  by parsing the TAP stream rather than trusting the aggregate exit code.
  No misreport found.
- `src/commands/doctor.ts` (`checkRemote`, `isGitIgnored`): `checkRemote`
  treats any non-zero `git remote` result (including a signal-kill, which
  this session confirmed produces `status: null, error: undefined`, see
  below) as "no remotes" and reports `WARN "no remote configured"`, which IS
  a positive claim drawn from an indeterminate state. `doctor` is diagnostic
  tooling, not part of the exit-code-driven pass/fail gate machinery that
  blocks merges (no `applicability`, no `EXIT_GATE_ERROR`), so this is noted
  but not scored as a gate-verdict-honesty defect; marked TRACKED.
- `src/pool.ts`: every site read follows a fallback-chain pattern
  (`resolveDefaultBranch` and similar: "try method A via `.status === 0`,
  else try method B") where a crash of one probe just falls through to try
  the next resolution method rather than being read as a specific claim
  about the world. Judged lower risk BY INSPECTION, not independently
  attacked with a live signal-kill; see the coverage section at the top.
- `src/gates/credentials.ts`: THIS site DOES misreport, confirmed by
  execution, and it feeds `credential-scrub`, a **required** gate
  (`gates.manifest.json` line for `credential-scrub`'s `applicability` reads
  `"required"`).

### Reproduction

Built a `git` wrapper on `$PATH` that self-inflicts `SIGSEGV` when invoked
with a `config` subcommand (simulating, for example, an OOM-killed or
otherwise crashed `git` mid-probe), placed ahead of the real `git`, and
called `probeCredentialSources` directly (the exported function `src/gates/
credentials.ts` implements) with a scrubbed environment carrying only `PATH`
and `HOME`.

```
$ node -e 'spawnSync("bash",["-c","kill -SEGV $$"],{encoding:"utf8"})'
{"status":null,"signal":"SIGSEGV"}
```

Control (real `git`, credential.helper genuinely unset):

```
git-global-config    clean   git config --global --get-all credential.helper exited 1 with no output
git-system-config    clean   git config --system --get-all credential.helper exited 1 with no output
git-resolved-config  clean   git config --get-all credential.helper exited 1 with no output
```

Attack (crashy `git` wrapper ahead on `PATH`, same otherwise):

```
git-global-config    clean   git config --global --get-all credential.helper exited null with no output
git-system-config    clean   git config --system --get-all credential.helper exited null with no output
git-resolved-config  clean   git config --get-all credential.helper exited null with no output
```

All three probes fall into the `else` branch of `if (result.error !==
undefined) { ... } else if (result.status === 0 && ...) { ... } else { //
"clean" }` (quoted, `src/gates/credentials.ts`, unchanged by this branch so
these lines are stable relative to `main` but quoted anyway for consistency
with the rest of this document), which makes the POSITIVE claim "no
credential helper configured" (`outcome: "clean"`) for a source that
crashed mid-probe rather than genuinely resolving to nothing. `verdictFromProbes`
(quoted, `src/gates/credentials.ts`) only escalates to `error` when
`outcome === "error"` and to `red` when any probe is `resolvable`; three
crashed-but-"clean" probes among otherwise-clean others still yields overall
GREEN.

What breaks for a user: `credential-scrub`, a REQUIRED gate whose entire
purpose is catching credential leakage, can report GREEN ("no leak sources
found") when three of its seven sources never actually resolved anything
because the `git` subprocess backing them was killed by a signal (an
OOM-kill under memory pressure is the most plausible real trigger; the
SIGSEGV wrapper here is a stand-in for any signal death, not the specific
mechanism). `credential-scrub`'s `applicability: "required"` is confirmed at
gates.manifest.json:40 on `main` (this file is unchanged by the phase
branch, so this citation resolves identically on both sides). This is the
same STRUCTURAL class the whole M3-P11/DR-0029 effort exists to close (a
crash read as a benign, indistinguishable-from-legitimate verdict) in a
sibling location this round explicitly declined to audit. It is narrower
than Findings 1 and 2 (it needs a signal-level crash of `git`/`gh`, not
merely a missing file or a nonzero exit) and it is only PART of
`credential-scrub`'s coverage (other sources, notably the environment-
variable tripwire, are unaffected and would likely still catch many real
leaks), so it is rated MEDIUM rather than HIGH: real, reproduced, in a
required gate, but requiring an unusual triggering condition and not a total
defeat of the gate's purpose.

## Suite verification (782/782/0 claim)

Ran the full suite on the fix-round head (`6274414`) with `dist/` already
built (`npm run build` exited 0 earlier in this pass, `git status --short`
clean of build artifacts as expected since `dist/` is gitignored), toolchain
node v26.6.0, invocation `npm test` (i.e. `node --test "test/**/*.test.ts"`,
package.json's own script, NOT the bare `node --test` from the repository
root that CLAUDE.md's warning 12 notes picks up two extra sandbox tests):

```
$ npm test
...
tests 782
pass 782
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 205366.093878
```

Confirms the round's claimed 782/782/0 exactly, on this toolchain, this
build state, this invocation. Per CLAUDE.md's warning 12, this number is
NOT expected to match a bare `node --test` from the repository root (which
would report 784, picking up the two `sandbox/test/greet.test.js` tests
`npm test`'s glob excludes); that bare invocation was not separately run
here since the round's own claim was specifically the `npm test` figure.

## Verdict

**NOT VERIFIED as a clean fix. VERIFIED as a real, substantial improvement
that leaves two confirmed classes of wrong verdict, one already declared by
the round and one materially new.**

What the round gets right, confirmed by direct execution rather than by
trusting its prose:

- Mechanism 1 half A (the readable-but-unopenable member) is closed, and the
  round's own two named tests were independently reproduced red at the
  reviewed head and green at the fix-round head.
- Mechanism 2 (C-1 relay-every-row, C-2 foreign-declaration refusal, M-1
  directory-prefix disclosure) all verified live: the green-detail line now
  reaches stdout, a raw carriage return in a detail is escaped rather than
  live, and a constructed foreign-declaration touch reproduces the RED
  verdict the round's own test also demonstrates red-to-green.
- `credential-token`, the one real inline `command-exit-zero` declaration in
  this repository, is verified unaffected against its ACTUAL manifest entry.
- The 25-mutation-member witness-coverage claim was independently
  re-derived from a script written from scratch and matches exactly.
- The 782/782/0 suite claim is reproduced exactly, toolchain and build
  state and invocation all named.
- No legitimate counter-example to C-2's bluntness was found, and the
  scenario most likely to produce a false positive there (an ordinary
  main-merge bringing in a new phase's declaration) is confirmed handled
  correctly by a passing pre-existing test.

What remains wrong, in order of what a real user hits:

- **Finding 1 (the no-slash residue)**: the exact defect class the phase
  exists to close (a crashed/absent command read as a legitimate skip)
  still reproduces for any `command-exit-zero` precondition whose
  script-shaped operand carries no `/`. This is ALREADY DECLARED by the
  round's own document as "the residue that matters most" -- this
  verification confirms that self-assessment is accurate, not overstated,
  via a real CLI run rather than trusting the prose.
- **Finding 2 (false errors from ordinary inline preconditions and
  self-cleaning scripts)**: NEW in its concreteness. The round's comment
  names the abstract shape ("inline code containing a slash") as an
  accepted cost; this verification shows a completely ordinary existence-
  check precondition triggers it, and that `decideAggregate` makes ONE such
  false error fail the ENTIRE gate bundle regardless of applicability,
  which the round's document does not walk through.
- **Finding 6 (credentials.ts signal-crash)**: NEW, outside the round's
  declared scope (the round explicitly made no claim about this sibling
  site), real and reproduced, in a REQUIRED gate, though narrower in
  trigger than Findings 1 and 2.

Findings 3, 4 and 5 found nothing further wrong; stated plainly rather than
manufactured. The M-1/C-1 Unicode-line-separator residual noted under
Finding 5 is TRACKED, not scored, since the code's own claim does not extend
to it and gate `detail` is trusted content.

This verification does not recommend a specific disposition (merge, another
fix round, or escalation); that is the orchestrator's call under the
fix-round contract (a hard maximum of two rounds, DR-0027) and DR-0016. It
reports what was found: the round closes the reviewed hazards it targeted,
reproducibly, and leaves the class it exists to close reachable through two
argv shapes (bare filename operands, and path-shaped-but-not-a-path inline
code) plus one adjacent, unaudited site (`credentials.ts`) that shares the
same structural defect.
