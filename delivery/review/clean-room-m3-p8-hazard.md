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
