# Clean-room hazard review, M3-P8 (reviewer B)

Subject: branch `claude/m3-p8-tuition-flow`, PR #125, head 26ee653.
Contract: HAZARD review. Not an acceptance-criteria walk (reviewer A holds that).
Question: what does this ship that could hurt a kernel user, or silently fail to
protect them?

Toolchain: node v26.6.0 unless stated. Started 2026-08-13.

Status: COMPLETE. Findings HRB-1 to HRB-9 below.

## Findings

See the nine numbered sections below.

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
clear it, and the byte arm is not what fires: `cmp` reports the committed and
regenerated files IDENTICAL, and the "it has been hand-edited" message did not
appear in any run I captured, so nothing redirects the reader. The stuck state
is a drift check
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
each drop is reported.

### HRB-6 (MEDIUM, demonstrated) the retention vacuous pass is wider than round 2 recorded: `{}`, `[]` and non-string values all reach PASS, and each defeats the `full` promotion

Round 2 left `retention: {}` open by name. Measured, it is not one shape but a
family, and the boundary is sharp enough to matter: the promoted condition
`retention-undeclared` is defeated by two characters.

Lab fleet from `tiphys init`, one charter under `charter/`, `tiphys doctor` and
`tiphys doctor --for full`:

| charter `retention` | doctor row |
|---|---|
| key absent | `FAIL ... declares no retention paths (required for profile full)` |
| `retention: {}` | `PASS 0 declared retention path(s) present and tracked` |
| `retention: []` | `PASS 0 declared retention path(s) present and tracked` |
| `retention: {work-history: 12, evidence: null, tuition: []}` | `PASS 0 declared retention path(s) present and tracked` |

The condition behind the WARN is `typeof retention !== "object" || retention ===
null`, which decides PRESENCE OF AN OBJECT, not "declares something". The check's
own header says the two states "never print the same word"; the second row above
prints PASS, the same word as a charter with three present, tracked paths.

The third row is the one round 2 did not name: `Object.values(...).filter(v =>
typeof v === "string" && v !== "")` DISCARDS every non-string value with no
diagnostic, so a charter that declares three retention paths with the wrong
types reports the same green as one that declares none.

Reachability, and the honest limit. `schemas/charter.schema.json` requires
`work-history`, `evidence` and `tuition` as non-empty strings under
`additionalProperties: false`, so every row above except the first is
SCHEMA-INVALID. The load-bearing fact is that `checkRetention` does not validate
the charter it reads, settled by command rather than by reading:

    $ grep -nE "validateInstance|loadTypeSchema|charter\.schema" src/commands/doctor.ts
    exit=1        # no hits

and `tiphys doctor` is exactly the command a user runs to learn whether the
fleet is sound. Charters are owner-authored by design (the
check's own header says so), so a hand-written charter that does not match its
schema is the ordinary case, not the exotic one, and doctor green-lights its
retention.

Fix shape: derive the verdict from the count, not from the type. `checked === 0`
should take the `retention-undeclared` branch whatever the shape of `retention`
was, and a non-string value should be its own FAIL rather than a silent drop.

### HRB-7 (LOW, demonstrated, non-blocking) `tuition-target-exists` resolves outside the tree and accepts a dangling symlink

Shipped artifact: `src/checks.ts`, `tuitionTargetExists`. Its condition is
`classifyEntry(join(contextDirectory, target)).kind === "absent"`, and its
header says the target is resolved "against the tree" / "against the
repository".

    $ node --input-type=module -e '...classifyEntry...'
    dangling       {"kind":"dangling"}
    T-902.yaml     {"kind":"regular"}
    missing        {"kind":"absent"}

So a `status: applied` consequence whose target is a dangling symlink is green:
in the probe entry only index 0 was reported, index 1 (`target: dangling`) was
not.

And `join` normalises `..`, so with enough leading `../` the target leaves the
context entirely:

    target: ../../../../../../../../etc/passwd    status: applied
    $ node bin/tiphys.ts validate --type tuition --context <ctx> T-902.yaml
    exit=0

Nothing in this feed does that today, and the entry would have to be authored
that way. It is worth a tracked item rather than a block because the feed is
CROSS-PROJECT by construction: an entry promoted out of a project whose layout
differs is exactly where a `../` target comes from, and there it silently
asserts nothing.

Fix shape: reject a target that resolves outside `contextDirectory`, and treat
`dangling` as absent.

#### HRB-2, addendum: what the work history already disclosed, and what it did not

Checked rather than assumed. `delivery/work-history/m3-p8.md` DOES disclose arm
2 in its residues, in these words: "`git check-ignore` exit 1 and exit 128 are
conflated by the retention check ... a declared retention path in a directory
that is no repository at all is reported as tracked ... no test in this round
forces that arm." That arm is therefore an ACKNOWLEDGED residue and I do not
count it against the round.

Arm 1 is not disclosed anywhere. Measured over the work history:

| term | occurrences |
|---|---|
| `untracked` | 0 |
| `ls-files --` | 0 |
| `pathReferencesIn` | 0 |
| `listEntryFiles` | 0 |
| `foldedBlock` | 0 |
| `normali` | 0 |
| `whitespace` | 0 |
| `round-trip` / `roundtrip` | 0 |
| `endsWith` | 0 |

So HRB-1, HRB-3, HRB-4, HRB-5, HRB-7 and arm 1 of HRB-2 are new, and the
non-string arm of HRB-6 is new. HRB-6's `{}` arm is round 2's named open item.

### HRB-8 (MEDIUM, demonstrated) the shipped tuition feed cites 16 paths and the npm package contains none of them; the shipped index fails this phase's own check against a pristine install

Shipped artifacts: `tuition/` (17 files in the tarball, including
`tuition/mechanism-index.yaml`) and `src/checks.ts`,
`mechanismRuleEvidenceResolves`, which is registered for `mechanism-index`
precisely so, in its own words, the shipped index is not "left unchecked".

`package.json` ships `["dist", ..., "roles", "schemas", "templates", "tuition"]`.
`delivery/`, `src/` and `scripts/` do not ship. Classifying every resolvable path
token in the shipped index against the `npm pack --dry-run` file list:

    resolvable path tokens: 16 | under delivery/ (never shipped): 13
                              | present in the tarball: 0 | other non-shipping: 3

The three non-`delivery/` ones are `scripts/render-agent-rules-gates.mjs`,
`src/lock.ts` and `src/task.ts`.

Packed, extracted, and validated as a consumer would have it:

    $ npm pack --pack-destination <dir> && tar -xzf <dir>/*.tgz -C <dir>
    $ node bin/tiphys.ts validate --type mechanism-index \
        --context <dir>/package <dir>/package/tuition/mechanism-index.yaml
    INVALID #/mechanisms/10/evidence/1 evidence names delivery/verification/cr-520-orchestrator-reproduction.md, which does not exist (check: mechanism-rule-evidence-resolves)
    ... 16 INVALID lines in total

Two distinct harms. The narrow one: the shipped index is invalid under the
check this phase registered for it, in the only tree a package consumer has.
The broad one is the reason the field exists at all. The index header says
"READ THE ROW BEFORE YOU USE THE MECHANISM ... a rule with no citation is not a
rule", and for every consumer of the package every citation but one is
unfollowable. `roles/implementer.md` mandates reading this file, so this is the
normal path, not a corner.

The one that does resolve is the `machine-readable-form` of the
`destructive-git-operation` row (`gates.manifest.json` / `destructiveCommands`),
which ships and resolves correctly. That is the shape that works.

Why CI is green on it: the kernel repository has `delivery/`, so the check
passes there. This is T-009's shape one scope out, a green scoped to the tree
that produced it.

Not prescribing the fix, since more than one is defensible (ship an evidence
subset, rewrite citations to durable public URLs, or scope the check's context
to the repository it was authored in and say so). Naming it is the finding.

### HRB-9 (LOW, demonstrated, non-blocking) every option is accepted by every subcommand and silently ignored by the ones that do not use it; `tuition add --dir` writes somewhere the operator did not name

Shipped artifact: `src/commands/tuition.ts`, `parseArgs`, which fills one shared
`Options` record for all three subcommands and never checks that the option
belongs to the subcommand.

`add` uses `--into`; `list` and `index` use `--dir`. Confusing the two is a
one-character-class mistake and it is not refused. Reproduced (and then undone):

    $ node bin/tiphys.ts tuition add --file <entry> --dir <intended-dir>
    added T-900 to <cwd>/tuition/T-900.yaml
    exit=0
    $ ls <intended-dir>
    mechanism-index.yaml          # the entry is not there

I ran that against the branch worktree and it wrote an untracked
`tuition/T-900.yaml` into it; removed, `git status --short` now empty.

The same shape covers `--out` and `--check` on `add` and `list`, and
`--kernel-relevant` on `add` and `index`: accepted, ignored, exit 0.

Non-blocking: the success line does name the real target, so an attentive
operator sees it, and nothing is overwritten (the write is `wx`). The residue is
an entry filed into whatever directory the process happened to be standing in,
which for the tuition feed is the artifact the id rules exist to protect.

Fix shape: reject an option the chosen subcommand does not read, the way
`parseArgs` already rejects an unknown one.

### Observations, not findings

- **`tuition index` and `tuition index --check` DO distinguish "nothing to
  project" from "projected and clean"**: both print the entry and mechanism
  counts (`wrote 0 mechanism(s) from 0 entr(ies)`, `0 mechanism(s) projected from
  0 entr(ies); the committed index matches`). The brief's question is answered
  in the affirmative for `index`. `tuition list` prints nothing on an empty feed
  and nothing on a feed with no kernel-relevant entries, both exit 0; both mean
  "nothing to promote", so I do not count it.
- **The shipped index IS checked by the suite**, so the drift guard is not
  unwired even though no gate names it: `test/mechanism-index.test.ts:393` runs
  `runCli(["tuition","index","--check"])` at the repository root and asserts exit
  0, and the `suite` gate runs the suite. Confirmed separately that `tuition`
  appears nowhere in `gate-registry.yaml`, `gates.manifest.json`,
  `.github/workflows/` or `scripts/` except as a scope path and a clause-map row.
- **No pinned count over the append-only feed.** `test/mechanism-index.test.ts`
  uses `names.length >= 12`, a floor, and `test/tuition.test.ts:9` states the
  rule in its own header. The promotion scan is not vacuous either: 12 of the 20
  files in `delivery/tuition/` match its `kernel-relevant:\s*yes` probe, so it
  examines rows rather than passing on an empty set. Its condition is a literal
  string form, so an entry written `kernel-relevant: true` would be skipped;
  that is a delivery-side test, not a shipped artifact, so it is a note.
- **`tuition add` derives the filename from the validated id**, which is
  `^T-[0-9]{3}$`, so no path element from the entry reaches the write. A
  filename whose stem disagrees with the id inside is accepted on read, but the
  suite's duplicate-id scan reads ids from content, so a real collision reddens.

## What this review did NOT cover

Named so the next reader knows where an empty result here means "not looked at"
rather than "clean".

1. **The acceptance criteria.** By contract. Reviewer A walks them. Nothing in
   this document should be read as a criteria verdict, including where a finding
   happens to touch a criterion.
2. **The sixteen witness specs as a class.** I read two
   (`witness/tuition-mechanism-evidence-required.json`,
   `witness/doctor-retention-check.json`) and used the second's provenance note
   to separate disclosed residues from new findings. I did NOT run the
   red-witness gate, did not check that each spec's two members are structurally
   different, and did not verify that any mutation reddens the tests it names.
   "One witness is not a class" is therefore UNTESTED by me.
3. **The full test suite was RUN but not analysed.** Complete sentence, per
   standing warning 12: invocation `npm test`, toolchain node v26.6.0, build
   state `dist/` present, head 26ee653, working tree clean. Result: 710 tests,
   710 pass, 0 fail, 0 skipped, 0 todo, duration 191332ms, exit 0. Two glyphs
   were stripped from the captured summary lines to keep this file ASCII, counted
   over the exact block read (suite.tap lines 760-772): U+2139 (8) and U+2714
   (1), both removed rather than substituted; no digit or word in the counts was
   altered, and nothing else in any captured output in this document was
   changed. I did NOT read which tests those 710 are, did not
   re-run for flake (`test/watcher.test.ts` flakes at about 1 in 62 and did not
   flake here), and ran no gate bundle. CI on the head remains the authority.
4. **The gate bundle.** I ran no `tiphys gates run`. Every green I cite is a
   single command I ran myself, never a bundle verdict.
5. **`test/liveness.test.ts`, `test/doctor.test.ts` and
   `test/implementer-brief.test.ts` changes**, and the interim-index removal
   (`test/fixtures/mechanisms-interim.md`, the `MECHANISMS.md` redirect). I read
   the work history's residue about fifteen remaining references and did not
   verify it.
6. **`delivery/requirements/clause-map.json`** and the work history's own
   citations, gates and claim greps.
7. **Concurrency.** No probe of two `tuition add` or `tuition index` runs
   racing on one feed. `add` uses `wx`, `index` uses a plain `writeFileSync`
   with no temp-and-rename, so a torn index under concurrent writers is a
   question I raise and did not test.
8. **Non-ASCII and control-byte content inside a tuition entry**, and how
   `yamlScalar` and `foldedBlock` render it. My round-trip fuzz covered
   whitespace and YAML indicator characters only.
9. **Everything about M3-P8 that is not in the diff of the branch against
   `origin/main`**, taken from
   `git diff --name-only origin/main...claude/m3-p8-tuition-flow` (54 files).

## Verdict

**Not an approval.** Eight findings, of which four are MEDIUM and reach a
shipped artifact or a real user path under DR-0027:

| id | severity | what it threatens |
|---|---|---|
| HRB-1 | MEDIUM | `mechanism-rule-evidence-resolves` resolves nothing for citations in `path.ext:LINE` form, this project's own binding citation grammar |
| HRB-2 | MEDIUM | `retention` says "tracked" and tests only "not ignored"; demonstrated untracked path lost on a real clone |
| HRB-3 | MEDIUM | a schema-valid entry makes `tuition index --check` permanently red on the file `tuition index` just wrote |
| HRB-5 | MEDIUM | a valid `.yml` entry is dropped from the feed silently, every command green |
| HRB-6 | MEDIUM | the retention vacuous pass is a family (`{}`, `[]`, non-string values), each defeating the `full` promotion |
| HRB-8 | MEDIUM | the shipped index cites 16 paths, 0 of which the npm package contains; it fails this phase's own check against a pristine install |
| HRB-4 | LOW | drift comparison blind to duplicate and unkeyed rows; a substantive injection is reported as cosmetic |
| HRB-7 | LOW | `tuition-target-exists` resolves outside the tree and accepts a dangling symlink |
| HRB-9 | LOW | options accepted by subcommands that ignore them; `tuition add --dir` files an entry into the wrong tree |

The LOWs are tracked items, not blockers: each exits nonzero or is visible in
output, and none lets a wrong verdict through.

Two of the MEDIUMs are the same mechanism at two scopes and should be fixed as
one: **a message word that no condition decides** (HRB-2's "tracked", HRB-4's
"decodes to the projection", HRB-6's PASS). HRB-1 and HRB-5 are also one
mechanism: **membership decided by a string-shape test that a valid input can
fail silently** (the extension suffix in `pathReferencesIn`, the extension
suffix in `listEntryFiles`).

HRB-8 is the one I would raise first if only one can be taken, because it is
about the artifact the package actually delivers to a user rather than about a
guard.

## Note on the citations in this document

Three tokens here are written as resolving citations rather than quoted:
tuition/README.md:22, test/mechanism-index.test.ts:393 and test/tuition.test.ts:9.
All three name files that `git diff --name-only origin/main...claude/m3-p8-tuition-flow`
lists as CHANGED by the branch, so they resolve against the BRANCH and not
against this report's own base. That is stated rather than hidden because
CLAUDE.md rule 3b's collision with T-019 makes the distinction load-bearing.

The `citations` gate does not lint this file: its precondition is
`citations-diff-touches-documents` and it reported
`not-applicable ... no changed path under delivery/plan/, delivery/verification/,
delivery/decisions/, delivery/tuition/, delivery/requirements/, delivery/STATE.md`
for a diff whose only entry is this review. Measured, evidence run
26f8f3d06eb6c6dc8c34b8ce, `declared 1 applicable 0 not-applicable 1 error 0`.

Every other path-like token in this document sits inside a probe block or names
a lab fixture I created; none is offered as a citation.

Status: COMPLETE.
