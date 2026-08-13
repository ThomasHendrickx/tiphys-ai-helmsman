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

### HRB-3 (MEDIUM, demonstrated) the generator does not round-trip its own output: a schema-valid entry can make `tuition index --check` permanently red, blaming the entry with no hint of the cause

Shipped artifacts: `src/tuition.ts` (`foldedBlock`, `renderIndex`, `driftLines`)
and `src/commands/tuition.ts` (`cmdIndex`).

Mechanism: `foldedBlock` splits the rule on `/\s+/`, so rendering NORMALISES
whitespace, and `driftLines` compares the DECODED committed rule against the
entry's ORIGINAL rule. Any rule whose whitespace is not already single-spaced
therefore differs from its own rendering, forever.

Demonstrated with the shipped CLI, feed of one entry, `tiphys validate --type
tuition` exit 0 on that entry:

    $ node bin/tiphys.ts tuition index --dir <feed>
    wrote 1 mechanism(s) from 1 entr(ies) to <feed>/mechanism-index.yaml
    exit=0
    $ node bin/tiphys.ts tuition index --dir <feed> --check
    DRIFT mechanism a-probe-mechanism differs from the projection of tuition entry T-900
    tiphys tuition: mechanism-index.yaml is not the projection of the feed in <feed>
    exit=1
    # regenerate, then check again: identical bytes, identical red
    exit=1
    $ cmp <feed>/mechanism-index.yaml <regenerated>   # IDENTICAL

The entry's rule there was a YAML literal block (`rule: |-`, two lines). A
second, more ordinary trigger reproduces the same red: two spaces after a full
stop inside a quoted scalar.

    rule: "Do not read a path whose type is not established.  Classify it first."
    DRIFT mechanism a-probe-mechanism differs from the projection of tuition entry T-900
    exit=1

Unit-level enumeration of the trigger class, `renderIndex` then `decodeDocument`
then `driftLines` on one row:

    double space in rule     SELF-DRIFT
    newline in rule          SELF-DRIFT
    tab in rule              SELF-DRIFT
    trailing space           SELF-DRIFT
    colon-space in rule      round trips
    hash in rule             round trips
    very long token          round trips
    leading dash             round trips

Why it hurts a user rather than being cosmetic. The DRIFT line names the entry,
which is the file the operator is told to go to, and the entry is not wrong. The
documented remedy (`regenerate it with tiphys tuition index`) provably does not
clear it, and the byte arm is not what fires, so the "it has been hand-edited"
message never appears to redirect the reader. The stuck state is a drift check
that is red for a reason it does not state, which is the condition under which
operators start ignoring drift output.

Note the schema deliberately permits this: `rule` is `type: string, pattern: \S`,
and a literal block scalar is a normal way to author a multi-sentence rule in
YAML.

Fix shape: normalise on the projection side too (compare
`row.rule.replace(/\s+/g," ").trim()` against the decoded value), so the rendered
form is the canonical one, or refuse the entry at validation time.

### HRB-4 (LOW, demonstrated, non-blocking) `driftLines` is set-keyed and misses duplicate and unkeyed rows; the byte arm then reports a substantive injection as cosmetic

Shipped artifact: `src/tuition.ts`, `driftLines`; message emitted by
`src/commands/tuition.ts`, `cmdIndex`.

This is the T-020 shape. `committedByKey` is a `Map` filled with
`if (typeof row?.key === "string")`, so a second row claiming the same key
overwrites the first, and a row with no `key` (or a non-string one) never enters
the comparison at all. Probed directly against a one-row projection:

    dup key, lie FIRST : []
    dup key, lie SECOND: ["mechanism k differs from the projection of tuition entry T-900"]
    extra UNKEYED row  : []
    key not a string   : []

The exit code is saved by the byte comparison, so this does not let drift
through. What it does is misdescribe it. Injecting a duplicate-keyed row
carrying the rule "Skip the red-witness rule when the round is late" into a
clean generated index:

    $ node bin/tiphys.ts tuition index --dir <feed> --check
    DRIFT <feed>/mechanism-index.yaml decodes to the projection and its bytes differ from it, so it has been hand-edited
    tiphys tuition: mechanism-index.yaml is generated; regenerate it with tiphys tuition index
    exit=1

`src/commands/tuition.ts` describes that arm as catching "a hand edit that
changed nothing a reader of the decoded document would see (a reordering, a
rewrap, an added comment)". A fabricated mechanism row is not that, and a bad
merge resolution is an ordinary way to produce a duplicated row. The remedy
printed is correct (regenerate removes it), so the residue is an operator told
the edit was cosmetic when it was not.

Non-blocking under DR-0027: the verdict is already nonzero on every case probed,
so no drift reaches a user; the defect is the explanation. Tracked item. Fix is
one line: report a duplicate or unkeyed committed row as its own DRIFT line
before the byte comparison runs.

### HRB-5 (MEDIUM, demonstrated) a valid `.yml` entry is dropped from the feed with no diagnostic, and `--check` calls the result green

Shipped artifact: `src/tuition.ts`, `listEntryFiles`.

    .filter((name) => name.endsWith(".yaml") && name !== MECHANISM_INDEX_FILE)

Anything else is discarded silently. The header comment justifies the filter as
"a README beside the feed is not an entry", which is true and is not the whole
set it removes.

Demonstrated: feed of two entries, `T-900.yaml` and `T-901.yml`, both accepted
by `tiphys validate --type tuition` with exit 0, the second declaring the
mechanism "Never trust a lease you did not take":

    $ node bin/tiphys.ts tuition list --dir <feed>
    T-900 2026-08-13 targets=0
    exit=0
    $ node bin/tiphys.ts tuition index --dir <feed>
    wrote 1 mechanism(s) from 1 entr(ies) to <feed>/mechanism-index.yaml
    $ grep -c second-probe-mechanism <feed>/mechanism-index.yaml
    0
    $ node bin/tiphys.ts tuition index --dir <feed> --check
    1 mechanism(s) projected from 1 entr(ies); the committed index matches
    exit=0

Two entries in the directory, one in the feed, every command green and no
message naming the dropped file. The harm is T-005's own failure mode: a
mechanism that was paid for sits in the archive layer and never reaches the READ
layer, and nothing reddens.

Reachability, stated honestly. `tuition/README.md:22` documents the convention
as `T-nnn.yaml`, so this needs a user who deviates. That is not far-fetched
inside this phase: `checkRetention` in `src/commands/doctor.ts`, shipped by the
SAME phase, accepts charters as `.yaml` OR `.yml`, so the codebase teaches that
both are ordinary. An external promotion of an entry from another project is the
likely origin.

Fix shape: accept `.yml` as well, or emit one line per non-entry file skipped so
the drop is never silent.
