# Clean-room hazard review, M3-P8 (reviewer B)

Subject: branch `claude/m3-p8-tuition-flow`, PR #125, head 26ee653.
Contract: HAZARD review. Not an acceptance-criteria walk (reviewer A holds that).
Question: what does this ship that could hurt a kernel user, or silently fail to
protect them?

Toolchain: node v26.6.0 unless stated. Started 2026-08-13.

Status: IN PROGRESS. Findings appended as they are confirmed.

## Findings

(none yet)

### HRB-1 (MEDIUM, demonstrated) `mechanism-rule-evidence-resolves` is blind to `path.ext:LINE`, this project's own binding citation form

Shipped artifact: `src/checks.ts`, the derived check `mechanism-rule-evidence-resolves`,
registered for types `tuition` and `mechanism-index` and reached by `tiphys validate`.

The check's token test is, in `src/checks.ts` on the branch:

    token.includes("/") && /\.[A-Za-z0-9]{1,6}$/.test(token) && !token.startsWith("/")

The trailing-punctuation strip removes `` ` ( " ' [ ) ] . , ; : `` but a line
number follows the colon, so nothing is stripped and the extension is no longer
at end-of-string. Probed directly:

    $ node --input-type=module -e '...pathReferencesIn...'
    "delivery/plan/kernel-plan-v1.md:2626" -> []
    "delivery/plan/kernel-plan-v1.md"      -> ["delivery/plan/kernel-plan-v1.md"]
    "src/gates/citations.ts:41-88"         -> []
    "test/tuition.test.ts:120 the registered scan" -> []
    "does/not/exist.md:1"                  -> []

`path.ext:LINE` is not an exotic form here. CLAUDE.md rule 3b makes it THE
citation form ("a bare path is not a citation at all") and `src/gates/citations.ts`
is the gate that enforces it. So an author who writes tuition evidence the way
this repository requires everywhere else gets a check that resolves nothing.

Demonstrated end to end, entry T-900 with every path fabricated, context the
branch worktree:

    $ node bin/tiphys.ts validate --type tuition --context <branch-wt> T-900.yaml
    exit=0                                    # no output at all

    # byte-identical entry with the ":2626" / ":41-88" suffixes removed
    $ node bin/tiphys.ts validate --type tuition --context <branch-wt> T-901.yaml
    INVALID #/mechanisms/0/evidence/0 evidence names totally/fabricated/nonexistent-file.md, which does not exist (check: mechanism-rule-evidence-resolves)
    INVALID #/mechanisms/0/evidence/1 evidence names another/invented/path.ts, which does not exist (check: mechanism-rule-evidence-resolves)
    exit=1

Two things compound it. The check emits no `reports`, so a green prints NOTHING:
there is no "N path reference(s) resolved" line to reveal that the count was
zero. And the header comment's WHAT IT DOES NOT REACH section names only
prose-only evidence; a reader of that paragraph would conclude that a citation
naming a file IS resolved, which for the `:LINE` form is untrue.

Why it is not merely cosmetic: the shipped `tuition/mechanism-index.yaml` is
the READ layer consulted at every dispatch, and this check is the only
instrument that establishes its citations point at real files. A feed authored
in `path:line` form ships with that guarantee absent and green.

Fix shape (one line): strip an optional `:<line>[-<line>][@sha256:...]` suffix
before the extension test, i.e. match the citation grammar `src/gates/citations.ts`
already defines rather than a second, narrower one.

### HRB-2 (MEDIUM, demonstrated) the `retention` check says "tracked" and only ever tests "not ignored"; an untracked retention path passes and is lost on the next clone

Shipped artifact: `src/commands/doctor.ts`, `checkRetention` and `isGitIgnored`,
reached by `tiphys doctor` and `tiphys doctor --for full`.

Mechanism, not instance: the PASS detail is
`N declared retention path(s) present and tracked`, and the only conditions
behind it are `existsSync(...)` and `git check-ignore` exiting 0. Nothing asks
git whether the path is tracked, and nothing distinguishes "git says not
ignored" from "git could not answer". Both of the other readings of that
sentence are undecided by any condition.

**Arm 1, untracked and not ignored.** Lab fleet from `tiphys init`, a real git
repository, charter declaring three retention paths at `keep-evidence`, which
holds a real file that was never committed:

    $ git -C <fleet> ls-files keep-evidence          # (no output)
    $ git -C <fleet> status --short keep-evidence
    ?? keep-evidence/
    $ git -C <fleet> check-ignore -q -- keep-evidence ; echo $?
    1
    $ node bin/tiphys.ts doctor | grep retention
    CHECK retention PASS 3 declared retention path(s) present and tracked
    $ git clone -q <fleet> cloned2 && test -e cloned2/keep-evidence/m1-p1.md \
        && echo survived || echo "DID NOT SURVIVE the clone"
    DID NOT SURVIVE the clone

That is precisely the harm the check's own header names ("evidence that is
ignored is evidence that does not survive the next clone"), reproduced against a
green check.

**Arm 2, git cannot answer.** `isGitIgnored` returns `result.error === undefined
&& result.status === 0`, so every nonzero exit including 128 reads as "not
ignored". Same fleet, same charter, `.git` removed, retention path pointed at
the gitignored `state/`:

    with .git      CHECK retention FAIL ... retention path state, which is git-ignored and will not survive a clone
    without .git   CHECK retention PASS 3 declared retention path(s) present and tracked

A demonstrated FAIL becomes a PASS when the repository is absent. A sibling
check does notice (`CHECK remote WARN fleet home is not a git repository`), and
`remote-missing` is promoted only under `full`, so under `generic`,
`local-only` and `direct-pr` the whole run is exit 0 with retention green.

Severity by reachability: `tiphys doctor` is a shipped user command; the state
is an ordinary one (evidence directories exist long before anyone commits them);
no future editor of the guard is needed. Arm 1 alone justifies MEDIUM.

Smallest honest fix is the message ("present and not ignored"). The fix that
matches R-098's duty is a second condition: `git ls-files -- <path>` returning
at least one line, plus treating a nonzero `check-ignore` status other than 1 as
UNKNOWN rather than as "not ignored".
