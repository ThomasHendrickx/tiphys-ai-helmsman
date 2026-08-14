# M3-P11 fix round 1: delta verification

Delta verifier, adversarial pass. Branch under verification:
`claude/m3-p11-precondition-crash-verdict`, reviewed head `a73313d`, fix round
`a73313d..6274414`, with `origin/main` merged in at `2947240`. This document
lives on `claude/verify-m3-p11-fr1`, cut from `main` at `6fa9633` per T-019, in
its own worktree; the phase branch itself was never modified.

Status while in progress: WRITE IN PROGRESS. Sections are appended as work is
done; the verdict at the bottom is the last thing written.

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
