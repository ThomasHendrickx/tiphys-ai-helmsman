# Re-review: fix round delta eb13da6..095f6ca on claude/exit-subject-doctor-kernel-artifacts

Started 2026-08-15. Delta check only, per instructions. Not re-reviewing whole branch.

Toolchain: node v26.6.0 confirmed at
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/toolchain/node-v26.6.0-linux-x64/bin/node

## Plan
1. Read the two clean-room reviews (CR-001 hazard, CR-002 criteria) for findings only.
2. Diff eb13da6..095f6ca to see exactly what the round changed.
3. Reproduce hazard CR-001: stage a built install, try the four claimed-fixed shapes, then hunt a fifth shape the new predicate still misses.
4. Reproduce criteria CR-002: read witness-records.json, confirm the two new specs, run them red/green as appropriate.
5. Check the repoint of the other witness spec whose quoted lines were rewritten - did it preserve or defang the dangerous state.

(log continues below as work proceeds)

## Setup
- Fetched origin; branch claude/exit-subject-doctor-kernel-artifacts at 095f6ca,
  merge-base with origin/main is 7b18144 (matches task's stated base).
- Worktree at scratchpad/rr-m3/wt, `npm ci` and `npm run build` both clean,
  `git status --short` empty after build.
- Read both clean-room reviews from origin/claude/m3-exit-test:
  delivery/review/clean-room-m3-exit-subject-hazard.md (CR-001..CR-005) and
  delivery/review/clean-room-m3-exit-subject-criteria.md (CR-001..CR-002).
  Task's "Hazard CR-001" = hazard doc's CR-001 (presence-vs-resolvability,
  four shapes). Task's "Criteria CR-002" = criteria doc's CR-002 (two
  behaviors with no red-witness mutation coverage: removed roles/ DIRECTORY,
  removed AGENTS.md FILE).

## Item 3 first (order changed): did the FIFO witness repoint defang it?

commit 6797944 repointed witness/doctor-kernel-artifacts-fifo.json's two
`find` strings to match the refactored lines (`classifyEntry(join(root,
name))` -> `classifyEntry(path)`, and the inverted `if (entry.kind ===
"regular") continue` -> `if (entry.kind !== "regular") { push; continue }`).

Reproduced the mutation by hand against the ROUND-1 head:

    cd scratchpad/rr-m3/fifo-mutant   # copy of wt with the two find/replace
                                       # pairs from the current fifo spec applied
    node --test-name-pattern "a FIFO at AGENTS.md is refused in bounded time rather than opened" \
      --test test/doctor.test.ts
    -> FAIL in 12.6ms (test wall time), assertion mismatch on result.detail
       (got "...AGENTS.md (present but empty, so it states nothing)",
       wanted /AGENTS\.md \(irregular/). NOT a timeout.

Then reproduced the SAME mutation (pre-refactor form) against BASE eb13da6
to see whether the round weakened something that used to be a real timeout
witness:

    cd scratchpad/rr-m3/base-mutant   # worktree at eb13da6, same two
                                       # find/replace pairs, base's OLD line text
    node --test-name-pattern "a FIFO at AGENTS.md is refused in bounded time rather than opened" \
      --test test/doctor.test.ts
    -> FAIL in 13.8ms, assertion mismatch on result.condition
       (expected "kernel-artifacts-incomplete", got undefined). NOT a timeout
       either.

**Finding: this was never a timing witness in practice, at base OR after the
round.** checkKernelArtifacts never calls readFileSync on AGENTS.md itself
(confirmed by reading src/commands/doctor.ts's REQUIRED_KERNEL_FILES loop at
both revisions); the actual hang risk this file's own comment describes lives
in the two OTHER call sites hazard CR-002 names (doctor.ts:72 and
version.ts:15), not in this one. The witness catches the mutation via an
assertion mismatch in single-digit milliseconds at both revisions, and the
repoint changed which string mismatches (message text vs condition field)
without changing the mechanism. **The repoint preserved parity with base; it
did not defang a real timeout guard, because there was never a reachable
timeout at this call site to defang.** This is a pre-existing looseness in
the witness's own framing ("the timeout is the assertion" per the test's own
comment, which was already untrue at base), not something round 1 introduced
or worsened. Not raising as a new finding since it predates this delta and
the round did not touch the test.

Cleaned up both scratch mutant trees after this check.

## Item 1: reproduce the four claimed-fixed shapes against a real staged install

`npm pack` from the round-1 head (095f6ca), extracted to
scratchpad/rr-m3/staged-install/package (a real tarball install, not a
symlinked dev checkout). Baseline against the untouched staged install:

    node dist/bin/tiphys.js doctor --for full
    CHECK kernel-artifacts PASS ... carries roles/, schemas/, checklists/ and AGENTS.md, exit 0

Then, one fresh copy per shape, mutating only the one artifact named:

| shape | mutation | result |
|---|---|---|
| checklists/ holding one unrelated file | deleted the shipped .yaml, added NOTES.txt | `CHECK kernel-artifacts FAIL ... missing checklists/ (present, but no .yaml member resolves) ...`, exit=1 |
| roles/ holding only an empty subdirectory | deleted all .md, added roles/nested/ (empty dir) | `FAIL ... missing roles/ (present, but no .md member resolves) ...`, exit=1 |
| roles/ whose members are all zero bytes | truncated every roles/*.md to 0 bytes in place | `FAIL ... missing roles/ (present, but no .md member resolves) ...`, exit=1 |
| AGENTS.md at zero bytes | truncated AGENTS.md to 0 bytes | `FAIL ... missing AGENTS.md (present but empty, so it states nothing) ...`, exit=1 |

All four: exit 1 under `--for full`, all four now FAIL rather than the
round-0 PASS/exit-0 the hazard review measured. **The round's claim is
confirmed by execution**, not just by reading the diff.

## Hunting a fifth shape

Read the predicate: for directories, `readdirSync` (no withFileTypes) then
`entries.some(entry => entry.endsWith(suffix) && carriesContent(join(path,
entry)))`; `carriesContent` is `classifyEntry(path).kind === "regular" &&
statSync(path).size > 0`. For the FILE member, `classifyEntry` then
`carriesContent`. Traced what each step does NOT establish:

- `classifyEntry` uses `lstatSync` then `statSync`, so it FOLLOWS symlinks.
  Tried: a symlinked `.md` member pointing at a real nonzero file elsewhere.

Executed candidates against the same staged install, one fresh copy each:

| candidate | staged state | `doctor --for full` kernel-artifacts line |
|---|---|---|
| A: a member NAMED with the suffix that is itself a directory (`roles/trap.md/`, a dir) | roles/ holds only that one dir | FAIL, `roles/ (present, but no .md member resolves)` -- correctly excluded (classifyEntry stats it, `isFile()` false) |
| B: a dangling symlink named with the suffix (`roles/dangling.md -> /no/such/target`) | roles/ holds only that link | FAIL, same message -- correctly excluded (`classifyEntry` returns `dangling`, not `regular`) |
| C: whitespace-only content, real bytes, zero information (`roles/implementer.md` = `"   \n"`, rest truncated) | roles/ holds one 4-byte file | **PASS**, `carries roles/, schemas/, checklists/ and AGENTS.md` |

Candidate C is a real fifth shape that still passes, reproduced by execution
(`grep -i kernel-artifacts` on the captured doctor output, full transcript at
scratchpad/rr-m3/sC.out). **It is not a new, undisclosed gap.** It is
word-for-word the boundary the round's own doc comment on
`REQUIRED_KERNEL_DIRECTORIES` declares and defends: "a `.md` with no
frontmatter... resolve[s]... Both are deliberate: doctor answers 'is this
install fit to run', and a per-document decode is the consuming command's
own failure, reported by it." Executing it confirms the declared boundary is
real and sits exactly where the comment says, not further out. Not raising
as a fresh finding.

Also traced and did not find a false-pass shape for: EACCES on the directory
itself (caught by the outer try/catch), ELOOP on a member (caught, `kind:
"unexaminable"`, excluded), a FIFO/socket/device named with the suffix
(caught, `kind: "irregular"`, excluded), and a directory-itself-is-a-symlink
layout (readdir follows it and reads the real members, which is the correct
answer since the consumer would resolve the same way). Did not attempt a
permission-denied-but-nonzero-size file (stat succeeds, read would fail):
this container runs as root (`id` = uid 0), so a chmod-000 file is still
readable here and the shape cannot be forced in this environment; stated as
a limit, not a clearance.

Cleaned up scratch install copies (s1-s4, sA-sC) after this section.

## Item 2: criteria CR-002, ran the real red-witness gate and read witness-records.json

    cd scratchpad/rr-m3/wt   # HEAD = 095f6ca, detached
    node src/gates/red-witness.ts --result scratchpad/rr-m3/rw-result.json \
      --evidence scratchpad/rr-m3/evidence-rw --base origin/main --head HEAD
    -> "red-witness: green (9 witness(es) evaluated (8 own, 1 stored
       re-evaluated in 12352ms); every witness red against every declared
       dangerous state and green at head)"

Read scratchpad/rr-m3/evidence-rw/witness-records.json directly (not the
summary line). It carries `evaluations[]`, 9 total, all `status: "green"`,
`uncoveredSources: []`. The new spec `witness/doctor-kernel-artifacts.json`
(`witness: "doctor-kernel-artifacts"`, `behavior:
"doctor-kernel-artifacts-missing-directory"`) is the one that answers
criteria CR-002. Its two `members[]` (the two mutation dangerousStates) each
carry 3 `runs[]` (repeats:2 dangerous + 1 at-head):

    member 0, run 1: exitCode 1, red:true,
      failedNamedTests: ["a staged install missing roles/ carries
        kernel-artifacts-incomplete, which full promotes to FAIL",
        "a staged install missing AGENTS.md is caught, which is the FILE
        member of the class"]
    member 0, run 2: identical (repeat)
    member 0, run 3 (at head, no mutation): exitCode 0, red:false,
      passedNamedTests: [the same two names]
    member 1: same shape, same two names, red/red/green

These are exactly the pair the criteria review named as having no red-witness
mutation coverage ("a staged install missing roles/ is a FAIL naming roles/"
and "a staged install missing AGENTS.md is caught, which is the FILE member
of the class"), modulo the CR-003 rename of the first (round 1 renamed the
test itself under the hazard review's low finding; the new spec names the
CURRENT title, `test/doctor.test.ts:696`, and that title is what the harness
resolves against, not the old one). Confirmed both members actually redden
(not merely registered): `red: true` with the named tests inside
`failedNamedTests`, twice each, and flip to `passedNamedTests` with `red:
false` at head. Collected every distinct test name appearing anywhere in
`failedNamedTests`/`passedNamedTests` across all 9 evaluations (10 names) and
confirmed both target names are in that set, plus confirmed the OLD name
("a staged install missing roles/ is a FAIL naming roles/") appears NOWHERE,
which is expected since it was renamed, not duplicated.

**Criteria CR-002 is closed, confirmed by execution, not by reading the
diff.**

## Cross-check against the round's own work history

delivery/work-history/exit-subject-doctor-kernel-artifacts.md:500-509
independently discloses the SAME thing item 3 above found by execution:
"defanging the FILE branch's own `classifyEntry` no longer reaches an open.
The witness still reddens, on the DETAIL rather than on a hang." This is a
transparent disclosure, not a concealed defect -- my independent execution
confirms the disclosure is accurate and that base had the identical
looseness (see item 3 above), so nothing was defanged by the round, only
inherited and stated honestly.

The work history also publishes the CR-002 (hazard) derivation the fix-round
contract requires: `grep -rn "existsSync" src/` (20 call sites, full output
quoted at lines 517-534), narrows to three that open after presence-test,
fixes the one inside files-to-touch (doctor.ts:72), and states the other two
(version.ts:15, brief.ts:53) are pre-existing and tracked, not fixed here --
matching the hazard review's own verdict that CR-002 "should not on its own
hold this change" and only owed a derivation, not a fix. A second widened
grep (`readFileSync|openSync|createReadStream`) is run to cover the gap the
first grep's own stated limits named (existsSync-only misses a bare open with
no presence test), finding one more real gap (`src/pool.ts:171`) and stating
it as tracked. This satisfies the fix-round contract's three-part shape
(mechanism, derivation, what it did not cover).

## Local suite and build, full sentence

Toolchain node v26.6.0 (confirmed via `node --version` in the shell that ran
every command above). Build state: `dist/` built via `npm run build`
(exit 0, `git status --short` empty after). Invocation: `node --test
"test/**/*.test.ts"` from the worktree root.

    tests 849
    pass 849
    fail 0
    cancelled 0
    skipped 0
    duration_ms 264770 (about 4m25s)

Matches the work history's own quoted 849/849/0/0 sentence. `test/doctor.test.ts`
alone: 32/32 pass, including both new CR-001 tests and the unaffected
existing ones.

## What this re-review did NOT cover

- Did not re-walk the eleven plan criteria or re-run the full clean-room
  contract; per task scope, took the two committed reviews' findings as given
  and checked only that this delta closes them.
- Did not attempt a permission-denied-but-nonzero-size file as a fifth-shape
  candidate: this container runs as root (uid 0), so chmod-based restriction
  cannot be forced here. Stated as a limit, not a clearance.
- Did not re-run the manifest-level gate bundle (`gates run --mode full`)
  beyond `--only red-witness`; the round's own two new commits
  (a903e76, 095f6ca) are about correcting which bundle-comparator arm the
  local gate record compares against, and I did not independently re-derive
  that comparator logic, only confirmed the suite and the red-witness gate
  directly.
- Did not run the `citations`, `scope`, or `clause-map` gates against this
  delta; out of scope for a hazard/criteria delta check per the task.
- Ran the claim grep from CLAUDE.md's fix-round contract against the work
  history as a spot check (found only substantiated hits, no bare
  over-claims); did not run the wrap-insensitive `tr` variant.

## Verdict

**APPROVE.**

1. Hazard CR-001 (the blocking finding): closed. All four shapes the review
   forced (checklists/ with one unrelated file, roles/ with only a
   subdirectory, roles/ whose members are all zero bytes, AGENTS.md at zero
   bytes) now FAIL under `--for full`, exit 1, reproduced against a real
   `npm pack` staged install of the built package, not the dev checkout.
   Hunted for a fifth false-pass shape by execution (directory-as-member,
   dangling symlink, whitespace-only content) and traced the remainder by
   reading (EACCES, ELOOP, FIFO/socket/device members, symlinked directory).
   Found one shape that still PASSes (whitespace-only `.md` content, real
   bytes, zero information) -- it is not a new or hidden gap, it is exactly
   the boundary the round's own doc comment on `REQUIRED_KERNEL_DIRECTORIES`
   declares and defends by name ("a `.md` with no frontmatter... resolve[s]
   ... Both are deliberate"). Not a fresh finding.

2. Criteria CR-002: closed. Read witness-records.json directly from a real
   `red-witness` gate run (not the summary line): both new specs'
   `failedNamedTests` name exactly the two behaviors the criteria review
   said had no mutation coverage (the removed-DIRECTORY and removed-FILE
   cases, by their current, CR-003-renamed test titles), each reddening
   twice under mutation and passing green at head.

3. Did the round break anything: no. The FIFO witness repoint
   (commit 6797944) was checked directly by re-applying its exact mutation
   by hand at both the round-1 head and at base: at BOTH revisions the
   witness reddens via an assertion mismatch in single-digit milliseconds,
   never via the timeout the test comment calls "the assertion." This
   characteristic predates the round (reproduced identically against base
   eb13da6); the repoint kept parity with base rather than weakening
   anything, and the round's own work history discloses the same fact in
   its own words. Full suite: 849/849 pass, 0 fail, 0 skipped, exit 0.
   `test/doctor.test.ts`: 32/32. Build clean.

Severity/reachability per DR-0027: both fixed items reach shipped
`src/commands/doctor.ts` on the ordinary CLI path; both are now closed by
execution evidence, not by reading the diff. Nothing found in this delta
rises to a new medium or higher.


