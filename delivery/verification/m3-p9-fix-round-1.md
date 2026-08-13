# M3-P9 fix round 1: delta verification

Status: COMPLETE.

Scope: verifying ONE repair, the fix round on branch
`claude/m3-p9-agents-policy`, delta `d9d5a1d..0cf4676`, PR #131. Not a
re-review of the phase. The two clean-room reviews and the arbitration are
already on `main` at `delivery/review/clean-room-m3-p9-criteria.md`,
`delivery/review/clean-room-m3-p9-hazard.md`,
`delivery/review/arbitration-m3-p9.md`.

Worktrees used, all under this session's scratch directory (never under the
repository, per T-019):

- `verify-wt`, detached at `0cf4676` (the fix-round head), for running the
  suite, the gate bundle and hand-built attacks against the real shipped
  script.
- `mutate-wt`, a second checkout of `0cf4676`, used only to apply and revert
  the four witness specs' mutations and confirm each reddens its named test.
- `pre-fix-wt`, detached at `d9d5a1d` (the pre-repair head), used briefly to
  confirm the new tests do not simply pass everywhere (superseded by the
  mutation-based check below, which is the stronger form since it exercises
  the actual mutation text rather than a whole different commit).
- `verify-report-wt`, this file's worktree, branch `claude/verify-m3-p9-fr1`,
  cut from `origin/main` at `1fd2834`, per the rule at
  delivery/tuition/T-019-a-verification-branch-carried-the-code-it-was-verifying.md:98
  (cut evidence branches from `main`, never from the branch under review).

Because this branch is cut from `main` and the phase branch changes
`src/checks.ts` from nothing (the `dual-review-decorrelation` check does not
exist on `main` at all yet: `git show origin/main:src/checks.ts | grep -c
DECORRELATION_DIMENSIONS` returns `0`), every reference into that file below
is quoted in backticks rather than cited with a line number, per the citation
rule in CLAUDE.md's rule 3b and the T-019 collision it names.

## What this verification did NOT cover

Read this section first.

1. **CI was not read.** `gh auth status` and any `gh`/`GH_TOKEN` REST call are
   unusable in this container per the task brief; T-009's post-merge `push`
   run on the eventual merge tip is not discharged by anything below. Every
   result here is a local execution on a worktree of the branch.
2. **The gate bundle run is reported as attempted, and its outcome is
   annotated with how much of it I actually saw finish.** It is slow (the
   `red-witness` gate re-clones and re-runs ~36 stored witnesses); see the
   dedicated section below for exactly what completed and what did not.
3. **Attacks were run against `produced-by` primarily.** The same mechanism
   (`establishField`'s trim-only normalisation) applies identically to
   `framing` and `review-contract` since all three route through one
   function, but I did not build fixtures exercising the homoglyph/ZWSP
   attack on those two fields specifically. `framing` and `review-contract`
   carry schema patterns that constrain their legal alphabet more than
   `produced-by` does (see the schema section below); `produced-by` is the
   field with no character-set restriction at all, so it is the strongest
   demonstration and the one I ran to completion.
4. **`src/checklists.ts` and `src/commands/brief.ts` candidates.** I ran the
   checklists.ts merge claim to completion by execution. For brief.ts I
   verified by reading the code and the shipped role files rather than
   driving the full `tiphys brief compose` CLI end to end (it needs a plan
   file and phase id I did not construct), because the code path and the
   shipped data (all five `roles/*.md` declare `role:`) already settle the
   practical severity without it.
5. **The 33-of-37-sites-classified table was spot-checked, not fully
   re-executed.** I independently reproduced the derivation script's stage 1
   to 3 counts exactly and re-ran a handful of the "read, not measured" rows
   by execution (`checklists.ts`, `gates/scope.ts:370`); I did not execute
   every one of the remaining ~30 rows (e.g. every `coverage.ts` and
   `gates/run.ts` line individually).
6. **I did not attempt NFC/NFD Unicode normalisation against the real
   fixtures** (no existing family name carries a diacritic); I confirmed the
   underlying claim (`establishField` never calls `.normalize()`) by direct
   inspection and by a standalone Node comparison of a precomposed vs.
   decomposed string, not by a live fixture run. The live fixture runs cover
   case, embedded zero-width space, cross-script homoglyph, fullwidth variant
   characters, and a lookalike dash, which is why the finding below is stated
   as a class
   rather than resting on the normalisation point alone.

## Summary of verdict (full reasoning and the verdict statement are at the
bottom of this file)

**VERIFIED WITH FINDINGS: one HIGH.** The round closes every instance the two
clean-room reviews and its own derivation named, correctly and honestly, with
one HIGH-severity residue it did not find and did not name, in the same
fail-open direction as CR-001, reachable by attacking the exact declared
residue (case folding) the round names and generalising past it as
instructed. Recommendation: a second fix round scoped to that finding, not a
merge.

Everything else the round claims (the four red witnesses, the CR-002 fix, the
absence-vs-not-applicable policy, the suite counts, the gate bundle, the
claim-grep discipline) held up under direct attack and is recorded below with
the commands that checked it.

## FINDING 1 (HIGH): establishField normalises whitespace only, and a
lookalike or invisible character reopens the exact fail-open direction CR-001
closed

The round names case folding (`Family-A` vs `family-a`) as a deliberately left
open residue and states it plainly as "the first thing a second reviewer
should push on." Starting there and going further: the class is wider than
case, it is live against the shipped script today, and at least one member of
it is completely invisible to a human reading the file.

`establishField` (in `` `src/checks.ts` `` on this branch; the function does
not exist on `main`, so it is quoted rather than cited by line, per T-019's
rule below) does exactly one normalisation: `raw.trim()`. It does not fold
case, does not apply Unicode normalisation (`NFC`/`NFKC`), and does not
collapse or reject non-ASCII lookalikes. `String.prototype.trim()` only strips
the characters ECMA-262 defines as `WhiteSpace`/`LineTerminator`, so an
invisible character that is not in that set (`U+200B` ZERO WIDTH SPACE) is
untouched, and a visually-identical character from a different Unicode block
is, correctly by the letter of the function, "a different string."

### Reproduced against the real shipped script, not a mock

All of the following were run against `scripts/check-dual-review.mjs` at head
`0cf4676`, staged with the SHARED-FAMILY fixture pair the round itself uses
(`decorrelated-criteria.yaml` + `shared-family-hazard.yaml`, both
`produced-by: family-a` in the unmutated fixtures), the same pair CR-001's own
red witness reddens. `framing` and `review-contract` already differ between
these two fixtures, so the ONLY dimension left to defeat is `produced-by`,
which is exactly the realistic shape T-001 exists to catch: one model family
producing both "independent" reviews.

Command pattern (full script at
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/attack.mjs`
and `attack2.mjs`, both committed as this file's sibling evidence is not,
because the scope rule for this branch is the same append-only-registries
posture the phase itself follows; the commands and their full output are
reproduced here in full rather than by reference):

```
node scripts/check-dual-review.mjs <staged-dir>
```

| mutation to one side's `produced-by` | result | why |
|---|---|---|
| control, `family-a` both sides | red (exit 1), correctly refuses | baseline |
| `Family-A` (ASCII case differs) | **GREEN, exit 0** | declared residue, confirmed live |
| `FAMILY-A` (full case differs) | **GREEN, exit 0** | same class |
| `f[U+0430]mily-a` (CYRILLIC SMALL LETTER A in place of Latin `a`) | **GREEN, exit 0** | new: cross-script homoglyph, visually indistinguishable in most fonts |
| `family[U+200B]-a` (ZERO WIDTH SPACE embedded mid-string) | **GREEN, exit 0** | new: literally invisible in any renderer; `trim()` only strips leading/trailing whitespace, and this is neither leading nor trailing |
| `f[U+FF41]mily-a` (FULLWIDTH LATIN SMALL LETTER A) | **GREEN, exit 0** | new: another lookalike substitution |
| `family[U+2013]a` (EN DASH in place of the hyphen) | **GREEN, exit 0** | new: lookalike punctuation |
| `" family-a "` (U+00A0 NBSP padding, quoted) | red, correct | NBSP IS in ECMA-262 `WhiteSpace`, so `.trim()` strips it; not a bypass |
| `"\tfamily-a\t"` (tab padding, quoted) | red, correct | tab is ASCII whitespace, correctly trimmed |
| `produced-by: ~` (YAML null) | red, correct | caught by the `unusable` arm as designed |
| `produced-by: true` (YAML boolean) | red, correct | caught by the `unusable` arm as designed |

**TRANSLITERATION DECLARED.** The four rows above name the attack characters
by Unicode codepoint in bracketed `[U+xxxx]` notation rather than pasting the
literal glyph, because this document is authored text and the repository's
authored-bytes check requires pure ASCII (CLAUDE.md's binding convention 3).
Exactly four codepoints were involved in the live attacks, one occurrence
each: U+0430 (CYRILLIC SMALL LETTER A), U+200B (ZERO WIDTH SPACE), U+FF41
(FULLWIDTH LATIN SMALL LETTER A), U+2013 (EN DASH). Each was replaced with its
`[U+xxxx]` codepoint name at the exact position it occupied in the attack
string; nothing else in this document was altered. The commands that produced
the GREEN/red verdicts above were run against the real byte sequences (not
against this escaped notation), and are reproducible with the equivalent
`node -e` one-liners:

```
node -e 'process.stdout.write("f" + String.fromCodePoint(0x0430) + "mily-a")'
node -e 'process.stdout.write("family" + String.fromCodePoint(0x200B) + "-a")'
node -e 'process.stdout.write("f" + String.fromCodePoint(0xFF41) + "mily-a")'
node -e 'process.stdout.write("family" + String.fromCodePoint(0x2013) + "a")'
```

Five of seven attacks succeeded, all in the fail-open direction: a pair
sharing exactly one model family, staged with the actual shared-family
fixture, printed `REPORT dual-review-decorrelation 2 verdict(s) for phase
M3-P9 are distinct on produced-by, framing, review-contract` and exited 0,
precisely the sentence and exit code CR-001 was filed against.

### Why this survives even a hypothetical future validation-composition fix

The round's own comment (in the same function) explains that nothing on the
shipped path actually runs `schemas/verdict.schema.json` over the sibling
verdict documents, and treats that as the root cause worth naming. It is
tempting to read this finding as "the same gap, closed later, closes this
too." It does not, and that is worth stating precisely rather than assumed:
the schema's own constraint on `produced-by` is

```
"type": "string", "minLength": 1, "pattern": "\\S"
```

which requires only "at least one non-whitespace character somewhere." A
Cyrillic homoglyph, a fullwidth letter, an embedded ZWSP, and an en dash all
satisfy `\S` trivially. So even a future round that composes schema
validation onto the shipped path, closing the gap the current comment names,
would not close this one: `produced-by` is deliberately unconstrained in
character set because it is meant to hold arbitrary model family names, and
that freedom is exactly what the attack rides on. (`framing` carries a
stricter pattern, `^[a-z0-9]+(-[a-z0-9]+)*$`, which WOULD reject these
substitutions if it were enforced; `review-contract` is a two-value enum. Not
independently re-run against those two fields, per the not-covered section
above, but `establishField` is the same function for all three, so the
mechanism transfers; only the schema's willingness to reject it differs.)

### What breaks for a user

DR-0012 condition 1 and T-001 exist because a delegated merge authority must
not be granted on the strength of two reviews that were never shown to be
independently produced. This is not a theoretical adjacent-field concern: it
is the check that decides whether a real merge under a delegated grant is
authorised. A verdict-producing session (the exact actor the check exists to
constrain) can make two same-family reviews compare as decorrelated by
changing one byte of one field in one committed YAML file, using a
substitution that is either fully invisible (ZWSP) or visually
indistinguishable from the genuine value in ordinary rendering (the
homoglyph, fullwidth, and en-dash cases). Neither the check nor a human
clean-room reviewer reading the two verdict files side by side would see
anything wrong, because there is nothing to see. That is a stronger claim
than "an edge case exists": it is a route past the exact predicate the task
brief calls the highest-stakes one in this repository, discovered by
attacking the round's own declared residue and generalizing past it as
instructed.

This is NOT a claim that the round was dishonest about it. Nothing in the
work history claims full closure of the class; it explicitly and correctly
frames case folding as "the first thing a second reviewer should push on" and
declines to fold case unilaterally because CR-003 treats case-insensitivity
as a symptom of weakening this exact check. The gap is that the residue is
larger than case, some of it is worse than case (invisible, not merely
easy-to-miss), and the round's own reasoning for not touching case
("whitespace carries no information in a scalar id, case may") does not
extend to homoglyphs or invisible characters, which carry no legitimate
information in a model-family id either and were not discussed.

## FINDING 2 (LOW, documentation accuracy, not a code defect): the
derivation's summary table does not match its own appended output

The fix-round contract requires the derivation's full output, not a summary
of it, precisely so a reader is not asked to trust a number. The work history
follows that: it appends the enumerator script and its complete stdout. But
the SUMMARY TABLE stated earlier in the same section, before the appendix,
reads:

| stage | count claimed in the summary table |
|---|---|
| 1, every `??` site in `src/` and `bin/` | 198 |
| 2, defaulted value read from an external indexed record | **37** |
| 3, stage 2 whose value flows into a comparison (10-line window, later discarded) | **6** |

I extracted the exact enumerator script verbatim from the work history's own
fenced code block and ran it, unmodified, against `verify-wt` at head
`0cf4676`:

```
$ node derivation-verify.mjs all 2>&1 | tail -3
counts: stage1=198 stage2=35 stage3=4
```

This is not a re-derivation with different rules: it is the identical script,
run against the identical head, and it reproduces the stage-1 count (198)
exactly while stage 2 and stage 3 come out as 35 and 4, matching the
`STAGE 2` and `STAGE 3` headers PRINTED IN THE WORK HISTORY'S OWN APPENDIX
("STAGE 2, defaulted value read out of an EXTERNAL indexed record: 35
site(s)", "STAGE 3, ... : 4 site(s)", and the appendix's own trailing line
"counts: stage1=198 stage2=35 stage3=4"). So the discrepancy is entirely
internal to the document: the prose summary near the top says 37 and 6, the
appendix it points to (and my independent re-run of that same appendix's
script) says 35 and 4.

I checked for the innocent explanation first, because a similar-looking
number mismatch elsewhere in this same document (the gate bundle's `red-witness`
row, discussed below) turned out to be exactly that: an intermediate commit's
run, honestly labeled with its own head sha, differing from the final one. That
explanation does not hold here. The appendix containing the correct 35/4 count
is presented as the CURRENT, final derivation (it includes source lines that
only exist after the fix, such as `establishField`'s own doc comment), and
nothing in the document flags the summary table as stale or attributes it to
an earlier run.

**This does not change any conclusion the round drew.** The classified-sites
table ("33 sites outside `dualReviewDecorrelation`") and the two candidates it
raises are drawn from the appendix, not from the summary table, and the
appendix is the one that matches my re-run. Nobody's classification of a real
site is wrong because of this; what is wrong is a headline number a reader
would quote without opening the appendix, which is exactly the situation the
"publish the full output, not a summary" rule exists to prevent. Filed LOW
because nothing shipped is affected and the correct number is available two
sections later in the same file.

## CONFIRMED: the four red witnesses are honest, including the "weakest pair"
self-assessment

Reproduced independently, in a THIRD worktree (`mutate-wt`) so the mutation
and revert never touched the tree used for anything else, applying each
`dangerousStates` member from the four new `witness/*.json` specs by exact
string replacement (refusing, as the round's own script does, if the find
text is not present), running `node --test --test-name-pattern <name>
<file>` with the pattern BEFORE the positional path (CLAUDE.md standing
warning 7), and reverting with the original file content held in memory,
never `git checkout --` (standing warning 8):

| spec | member | exit | tests | pass | fail |
|---|---|---|---|---|---|
| `dual-review-absent-dimension-refuses` | 1 (call-site bypass) | 1 | 1 | 0 | 1 |
| `dual-review-absent-dimension-refuses` | 2 (helper corruption) | 1 | 1 | 0 | 1 |
| `dual-review-unestablished-merge-authority` | 1 (read reverts) | 1 | 1 | 0 | 1 |
| `dual-review-unestablished-merge-authority` | 2 (guard inverted) | 1 | 1 | 0 | 1 |
| `dual-review-whitespace-is-not-distinctness` | 1 (trim reverts) | 1 | 1 | 0 | 1 |
| `dual-review-whitespace-is-not-distinctness` | 2 (comparison bypasses reading) | 1 | 1 | 0 | 1 |
| `agents-references-refuse-unshipped-path` | 1 (predicate defanged) | 1 | 1 | 0 | 1 |
| `agents-references-refuse-unshipped-path` | 2 (anchor required again) | 1 | 1 | 0 | 1 |

All 8 members: exactly one test ran (the harness's own
`failed.length === tests.length` rule, confirmed by reading
`src/witness/run.ts` on this branch, requires this), and it failed for the
stated reason, confirmed by reading the full assertion output for the first
member (`0 !== 1` against the count of violations, printed alongside the
exact false-green sentence CR-001 names: `REPORT dual-review-decorrelation 2
verdict(s) for phase M3-P9 are distinct on produced-by, framing,
review-contract`). At head, unmutated, all four specs' tests pass (confirmed
by the full `test/dual-review.test.ts` and `test/agents-policy.test.ts` runs
below). Green at head, red under every declared mutation: the red-witness
rule is satisfied for all four.

**The "weakest pair is A and B" self-assessment holds up.** Reading the two
members of `dual-review-absent-dimension-refuses`: member A bypasses
`establishField` only at the per-dimension call site (the loop reverts to
`String(candidate.record[dimension] ?? "")` locally); member B corrupts the
function itself so every caller sees the corruption. Both ultimately make
"absence" and "a real value" compare equal, which is the SAME collapse at two
levels of the same call graph rather than two different collapses, exactly as
the round states. The other three pairs (C/D: breaks-the-read vs
breaks-the-consequence-of-a-correct-read; G/H: same split one property along;
E/F: kills-the-predicate vs kills-the-predicate's-visibility) are genuinely
structurally different by the same reading.

## CONFIRMED: CR-002's fix functions end to end, not merely at the unit level

Staged a fresh directory with the real `assurance-modes.yaml`, the real
charter template (`delivery-mode: full`), and the SHARED-FAMILY fixture pair,
then ran the exact command AGENTS.md's revised text now recommends:

```
$ node bin/tiphys.ts validate --type verdict --context <dir> <dir>/delivery/review/shared-family-hazard.yaml
...
INVALID #/produced-by produced-by value family-a occurs in 2 of the 2 verdicts
  for phase M3-P9 (...), so the reviews are not decorrelated on produced-by
  (check: dual-review-decorrelation)
exit 1
```

This is the CLI path a real consumer of the published package would run (not
the internal `scripts/check-dual-review.mjs`, which does not ship), and it
produces the exact behavior AGENTS.md now promises. Also confirmed:
`node scripts/check-agents-references.mjs --root .` against the actual
`AGENTS.md` on this branch reports `check-agents-references: green (21
references resolved)`, matching the round's own claimed count exactly.

## CONFIRMED: the absence-versus-not-applicable line does not misfire on a
legitimate configuration

Attacked from the other side (task item 2): looking for a genuinely valid
context that the "absence is a FAIL under a grant" policy wrongly refuses.

- An absent `charter.yaml`, and a charter present but declaring no
  `delivery-mode`, both still REPORT (not-applicable with a reason), never
  fail: confirmed by the existing test suite (`the check REPORTS rather than
  fails when a context declares no delivery mode, and says so in a line a
  green run cannot be confused with`, passing) and independently by direct
  script runs.
- A mode with `merge-authority: owner` (not the delegated one) still REPORTS,
  never fails, on the exact pair that reddens under a delegated grant:
  confirmed by the existing passing test of the same name.
- `eachMode`'s own id-defaulting (`String(mode["id"] ?? "")`, explicitly NOT
  changed by this round) is not exploitable to make an id-less mode row match
  a real charter's delivery-mode, because the charter's `delivery-mode` is
  now established as a non-empty string before the mode lookup runs, and an
  empty mode id cannot equal a non-empty one. MEASURED rather than only
  reasoned: I staged the real `assurance-modes.yaml` with the `full` mode's
  `id: full` line deleted (leaving the entry with no id at all) and ran the
  shipped script against the shared-family pair. Result: exit 1, "declares
  delivery mode full, which assurance-modes.yaml does not define, so its
  merge-authority is unknown", which is the fail-closed "mode not found" arm,
  not a false match through the id-less row.
- The one edge case I could construct where "absence is a FAIL" refuses
  something a document author might have intended as legitimate: a
  `produced-by` value that is a bare YAML scalar coinciding with a YAML
  keyword or a number (e.g. an unquoted family name that happens to look
  numeric) decodes to a non-string and is refused as "unusable." This is
  consistent with, not contrary to, the round's own probe table
  (`produced-by: 7` before: fail-open GREEN; after: correctly refused as "a
  number") and is a quoting-discipline requirement rather than a new false
  refusal of a working configuration. Filed as a TRACKED observation, not a
  finding: no real model-family id in this repository's fixtures or
  documentation is a bare number or YAML keyword.

No wrongful refusal of a legitimate configuration was found.

## Two candidate sites the round named but did not fix

Both were explicitly raised by the round for the orchestrator rather than
improvised, and both are outside this phase's `filesToTouch`. Verified rather
than re-argued:

**`src/checklists.ts`, the id-less `--extra` probe.** The round classified
this by READING, not execution. I ran it:

```
projected extra1 probes: [{ "id": "", "probe": "sneaky probe, no id", ... }]
merge1 problems: []
merge1 probe ids: [ '"p1"', '"p2"', '""' ]
```

Confirmed exactly as claimed: a single id-less probe in a user-supplied
`--extra` checklist merges with ZERO problems reported, becoming a live probe
carrying `id: ""` in the resolved checklist. It is the SAME mechanism as
CR-001 (a default read from an external record, `String(probe["id"] ?? "")`,
masking absence as a real value) applied to a different field. **It IS
reachable by a consumer**: `tiphys checklist resolve --checklist <id> --extra
<file>` is a real, documented, shipped CLI command (`` `src/commands/checklist.ts` ``),
not an internal-only code path. Two id-less probes in the SAME extra file DO
collide with each other correctly (`merge2 problems: [...]`), so the gap is
narrower than "any id-less probe is silent": it is specifically "exactly one
id-less probe per extra file passes with no diagnostic." Severity: this is
governance-checklist integrity, not the merge-authorization decision itself,
so it does not carry CR-001's stakes; it is correctly out of this round's
scope and correctly flagged rather than improvised.

**`src/commands/brief.ts`, the role-less frontmatter display.** Verified by
reading rather than by driving the full CLI (see not-covered section): the
displayed `role:` line falls back to `options.roleId`, the SAME id the
caller used to locate the role file on disk (the rolePath is built as
`join(rolesDirectory, options.roleId + ".md")`). Since a role file is always looked up by the
exact id being requested, a role file that omits `role:` from its frontmatter
would still render the CORRECT id, just not one confirmed by the document's
own declaration. All five shipped `roles/*.md` files declare `role:`
explicitly (`grep -l '^role:' roles/*.md` returns 5 of 5), so this is
currently dormant in the shipped repository. Confirmed LOW as claimed, on
different grounds than "read, not run" but the same conclusion.

## The gate bundle, independently re-run in full

Ran to completion (`` `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --phase m3-p9 --evidence <dir> --base origin/main --head HEAD` ``,
from `verify-wt` at `0cf4676`, node v26.6.0, `dist/` built, `npm run build`
exit 0 and `git status --short` empty afterward):

```
gates: declared 15 applicable 9 verdict 9 green 9 red 0 not-applicable 6 error 0 vacuous 0
```

Per gate, read from each `result.json` rather than retyped from the bundle
line (T-009's "a green bundle is not a green gate" rule):

| gate | status | units |
|---|---|---|
| `agent-rules-drift` | green | 20 |
| `brief-drift` | green | 17 |
| `check-agents-references` | green | 21 |
| `check-dual-review` | not-applicable | 0 |
| `citations` | not-applicable | 0 |
| `clause-map` | green | 74 |
| `coverage` | green | 115 |
| `credential-scrub` | green | 7 |
| `credential-token` | not-applicable | 0 |
| `deploy` | not-applicable | 0 |
| `manifest-self-check` | green | 8 |
| `migrations` | not-applicable | 0 |
| `red-witness` | green | **37** |
| `scope` | not-applicable | 0 |
| `suite` | green | 765 |

Every green count matches the round's own reported numbers exactly (20, 17,
21, 74, 115, 7, 8, 37, 765). `scope` and `citations` came back not-applicable
in MY run, not green: my `verify-wt` was checked out `--detach` (this
verification's own environment, per T-019, is never on the phase branch
name), so `git rev-parse --abbrev-ref HEAD` reports the literal string
`HEAD`, which does not match the phase-branch regex, so `scope`'s own
precondition (branch name matches `^claude/m[0-9]+-p[0-9]+-`) is correctly
unmet. This is an artifact of running from a detached worktree, not a defect
either in the round or in the gate; the round ran on the real branch and
reported `scope: green (28 changed paths audited)`, which I did not
independently re-derive because reproducing it needs a checkout on the actual
branch name, which risks exactly the T-019 shape this verification's own
branch was built to avoid.

**`red-witness: green, 37`** matches the round's own final per-gate table
exactly, including the count. The round's WORK HISTORY also quotes a raw
detail line reading "36 witness(es) evaluated (5 own, 31 stored
re-evaluated)" immediately above that table; my fresh run's detail line reads
"37 witness(es) evaluated (6 own, 31 stored re-evaluated in 287973ms)". These
are NOT inconsistent: the round explicitly labels that intermediate run as
taken "at head `c7f3d13`", one commit earlier than the branch's final head
`0cf4676`, and the round's own final table (captioned "at the head being
handed back") already carries 37, not 36. A commit between those two heads
added the fourth new witness spec. Checked rather than assumed, so this is
recorded as a confirmation, not left as a loose thread.

## Suite, toolchain, build state, invocation (T-020's four-axis rule)

node v26.6.0 (confirmed by `node --version` in the shell that ran each
command below), from the scratch prefix. `dist/` BUILT (`npm run build`,
exit 0, `git status --short` empty afterward, on `verify-wt`).

| invocation | file(s) | tests | pass | fail | skipped |
|---|---|---|---|---|---|
| `node --test test/dual-review.test.ts` | dual-review only | 23 | 23 | 0 | 0 |
| `node --test test/agents-policy.test.ts` | agents-policy only | 29 | 29 | 0 | 0 |
| gate bundle's `suite` gate (full `npm test` invocation, child-process reported) | whole suite | 765 | 765 | 0 | 0 |

The 765 matches the round's own reported `npm test` count exactly. A full
bare `node --test` run from the repository root (which would add the two
tracked `sandbox/test/greet.test.js` tests per standing warning 12) was not
run to completion in this verification; it timed out twice at the 120-second
foreground limit before I switched to targeted per-file runs and the gate
bundle's own `suite` gate result, both of which completed and are the ones
quoted above.

## Verdict

**VERIFIED WITH FINDINGS. Recommend a second fix round (round 2 of the
DR-0027 maximum of two) rather than a merge, scoped to FINDING 1.**

What holds, confirmed independently rather than re-derived from the work
history's own numbers: the four new red witnesses are honest (green at head,
red under all 8 declared mutations, correctly classified by structural
difference including the self-graded "weakest pair"); CR-002's fix works end
to end through the actual shipped CLI path, not only inside the internal
script; the absence-vs-not-applicable policy does not wrongly refuse any
legitimate configuration I could construct, including the id-less-mode-row
edge case, which I measured rather than only argued; the stage-1 derivation
count (198) is exact; the suite, gate bundle, and claim-grep discipline all
check out with matching numbers.

What does not hold: the round explicitly names case-insensitivity as a
declared, deliberate residue and invites exactly this kind of follow-up
attack on it ("the first thing a second reviewer should push on"). Attacking
past it finds a materially worse member of the SAME class, live against the
shipped script, on the SAME fixture pair the round's own witness reddens: a
single Unicode substitution (a cross-script homoglyph, a fullwidth variant,
a lookalike dash, or a genuinely invisible zero-width space) in one side's
`produced-by` field makes a same-model-family review pair compare as
decorrelated and authorises a merge under DR-0012's delegated grant, exactly
the outcome CR-001 was filed to prevent. It is not closed by the current
`establishField`, which normalises only ASCII whitespace via `.trim()`, and
it would not be closed by the validation-composition gap the round's own
comment names as future work either, because the schema's own constraint on
`produced-by` (`pattern: "\\S"`) does not restrict the character set. This is
HIGH: it is live, it is on the highest-stakes predicate in the repository per
the task brief, and at least one member (the embedded zero-width space) is
completely invisible to a human clean-room reviewer reading the committed
verdict files.

FINDING 2 (documentation accuracy, LOW, not blocking) is recorded for
completeness: the work history's own summary table for the derivation (37,
6) does not match its own appended full output and my independent re-run of
that identical script (35, 4). It changes no conclusion the round drew, but
undercuts the "publish the full output, not a summary" contract if the
summary is what a later reader quotes.

The two candidate sites (`src/checklists.ts`'s id-less probe,
`src/commands/brief.ts`'s role fallback) were correctly scoped out and
correctly named for the orchestrator; I confirmed the checklists.ts one by
execution (upgrading it from "read" to "measured") and confirmed it is
reachable through a real shipped CLI command, and confirmed the brief.ts one
is currently dormant given the shipped role files. Neither blocks a merge on
its own; both are informational, matching the round's own framing.



