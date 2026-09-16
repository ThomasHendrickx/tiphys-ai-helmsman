# Clean-room review: M4-P16 (fleet rehydration)

Reviewer lens: CORRECTNESS AND DATA LOSS. Assume the change can destroy work.
Branch: claude/m4-p16-fleet-rehydration, head 1701940, base 3b40118.
Started: in progress.

## 0. Orientation

- origin/main == 3b40118 (rev-list count 0).
- The two-dot/three-dot diff from 3b40118 carries the whole M4 paperwork wave
  (kernel-plan-m4.md, DR-0035..DR-0043, evidence probes, CLAUDE.md +95).
  Those are ANCESTOR commits (a985a96..6961186), not this phase's edits.
  The phase's own commits are 4a0df7b..1701940 (6 commits).
- Shipped surface touched: src/cli.ts, src/commands/init.ts,
  src/commands/resume.ts, src/fleet.ts. That is where attention belongs
  (DR-0027).

## 1. First check: the derivation's not-covered statement (fix-round contract item 3)

Section 6.3's derivation names a MECHANISM ("a message assertion whose pattern
can be satisfied by a message from a different code path"), publishes the exact
grep and its full 14-line output, and then states three exclusions. Section 9
adds six more residue items and section 12.5 adds six gate exclusions. That is
the contract met in form, and it is unusually good in substance: item 2 of the
not-covered list was found by WIDENING the search (assert.equal on a whole
stream), which is the behaviour the contract asks for and rarely gets.

Verified by re-running, not by reading:
- claim grep, body (sections 1-9): line-based 10 occurrences, wrap-insensitive
  10. Reproduced exactly.
- The scoping of the claim grep to sections 1-9 is a judgement the author
  declares. I checked the excluded region for substantive hits: section 12
  (gate evidence) has ZERO hits from either form. So the exclusion hid nothing.
- Passive-form grep (DR brief item 10): three hits, all of them the echoed
  pattern string inside section 10's own commands. No passive over-claim.

**Is anything it admits worse than it sounds?** Two things.

(a) Section 9 item 3 ("no test exercises a symlinked ephemeral entry") is
    LESS serious than it sounds. Measured: the dangling-symlink path reaches
    `{kind:"other"}` through a different branch of `classifyLayoutEntry`
    (statSync ENOENT) than a regular file does, so it is not literally "the
    same branch" as the work history says, but both end at the same refusal
    and neither creates anything. Cosmetic inaccuracy, no exposure.

(b) Section 9 item 4 (the concurrency window) is HONEST and its consequence is
    correctly filed as an open question. It is also not the dangerous one:
    `mkdirSync` EEXIST cannot destroy the directory it fails to create.

**What the not-covered statement does NOT admit is finding 1 below**, and that
is the gap that matters for a data-loss lens.
## 2. Findings

### F1 (MEDIUM, tracked under DR-0027): the "live fleet untouched" witness
covers two of the three ephemeral directories, and the uncovered one is
`projects/`, which holds the clones of user repositories.

`makeLiveFleet` (test/resume.test.ts:209) seeds content into `worktrees/` and
`state/` only. Nothing in any fixture in either test file ever puts a file
inside `projects/`. So a resume that silently destroys `projects/` is GREEN.

Measured, mutant R2, in a clone of the branch at 1701940, node v26.6.0,
`dist/` built, `node --test --test-reporter=tap`:

```
mutant R2: if (!step.rebuild) { if (step.name === "projects")
             { rmSync(root/projects, {recursive:true, force:true});
               mkdirSync(root/projects); } continue; }
test/resume.test.ts   tests 14; pass 14; fail 0; skipped 0; EXIT 0
test/init.test.ts     tests  9; pass  9; fail 0; skipped 0; EXIT 0
```

The destruction is real, not theoretical. Same mutant, a live fleet home:

```
before: fleet/projects/acme-app/UNPUSHED.txt
$ tiphys resume
REBUILT state/
exit 0
after:  fleet/projects        (acme-app and UNPUSHED.txt gone)
```

Against the unmutated source the same run leaves `UNPUSHED.txt` in place, so
the SHIPPED code is correct. The defect is that the guard cannot go red for the
directory with the most valuable content in it. src/fleet.ts:26 calls
`projects/` "clones ... recoverable from their remotes", which is exactly the
optimism that makes an uncommitted branch in one unrecoverable.

Reachability: this is a test/witness gap. It does not make a shipped artifact
wrong today, so under DR-0027 it is TRACKED, not blocking. It becomes a data
loss the first time anyone edits the rebuild loop.

Recommendation: add `projects/<clone>/UNPUSHED.txt` to `makeLiveFleet` and one
sha256 assertion on it. One line of fixture, one assertion, and R2 reddens.

### F2 (MEDIUM, tracked): both `"class": "destructive"` witness specs rest on
exactly ONE genuinely destructive member. Their other members redden by
CRASHING, not by destroying.

`witness/resume-leaves-a-live-fleet-untouched.json` declares two members.
Measured, each applied to the branch source and run against a live fleet home:

| member | what it does on a live fleet | scratch.txt |
|---|---|---|
| `patch resume-destroy-and-recreate.patch` | rmSync + mkdirSync | DESTROYED |
| mutation `rebuild: false` -> `rebuild: true` | `tiphys: EEXIST: file already exists, mkdir .../state`, exit 1 | **SURVIVES** |

`witness/resume-rebuilds-only-what-is-absent.json` declares three; the
all-or-nothing member behaves the same way:

```
$ tiphys resume        (all-or-nothing member, half-rebuilt live fleet)
REBUILT state/
tiphys: EEXIST: file already exists, mkdir .../worktrees
exit 1
scratch.txt survives? YES
```

So the criterion-4 and criterion-5 tests DO redden under these members, but
they redden on `assert.equal(result.status, 0)`, not on the sha256 comparison
that is the criterion. CLAUDE.md's rule is that a class witness must redden
under two structurally different members OF THAT CLASS; the second and third
members are not members of the destructive class at all. The two specs have one
real destructive member between them, and it is the same patch in both.

Reachability: witness/ is not on DR-0027's shipped list and the shipped code is
correct, so TRACKED. The consequence is that the red-witness gate's future
re-verification of "resume does not destroy a live fleet" is thinner than the
member counts suggest.

Positive side effect of the same measurement: it settles the work history's own
weakest claim (its section 11 row 547, that a thrown error becomes one
diagnostic line and never a stack trace). Confirmed by my run above, and the
author correctly labelled it as unverified by them.

### F3 (LOW): the partition test's docstring claims a guard it does not provide.

test/resume.test.ts:241 says "a future phase that adds a fleet directory reddens
here and has to say which half it is in". Measured: it does not.

```
mutant F1: FLEET_DIRS gains "archive"
test 1 "the layout constants partition ..."  ok      <-- the claim's own test
tests 14; pass 7; fail 7     (tests 2,3,5,7,11,12,13 red)
```

`DURABLE_DIRS` is `FLEET_DIRS` minus the ephemeral set, so any new `FLEET_DIRS`
entry lands in the durable half automatically and the union assertion stays
true. What actually reddens is `makeFleetClone`'s `assertDurablePresent`,
because `init`'s separate hand-written `DURABLE_KEEP_DIRS`
(src/commands/init.ts:47) does not gain the new directory, so git cannot track
it and the clone does not carry it. That is good coverage arriving from an
unexpected place, and the comment points a future editor at the wrong test.

For completeness, the partition test IS a real guard in the other direction:

```
mutant F2: FLEET_IGNORED gains "*.tsbuildinfo"
test 1 "the layout constants partition ..."  NOT OK
tests 14; pass 3; fail 11
```

Reachability: a comment in test/. TRACKED.

### F4 (LOW): `treeDigest` digests the ENTRY SET, so "creates nothing" cannot
see content destruction in a refused directory.

test/resume.test.ts:109 hashes sorted relative path names only. A refusal arm
that truncated or rewrote a file would leave the digest identical. The author
declares this ("a digest of the ENTRY SET"), the refusal arms provably create
and remove nothing today, and deletion does move the digest, so the exposure is
narrow. Recorded, not blocking.

### F5 (LOW): `init`'s new remedy is wrong advice for the most common way to
reach that message.

`fleetMarkers` is `FLEET_DIRS + backlog.md + .git` (src/commands/init.ts:83),
so `tiphys init` in ANY git repository, or in any directory holding an entry
named `state`, `tasks` or `projects`, now prints "already initialized; run
tiphys resume to rebuild the ephemeral directories a clone does not carry".
`resume` then refuses that directory correctly, so nothing is destroyed and the
user is not left worse off, only misdirected one command further. The marker
logic is pre-existing and the phase only changed the text.
