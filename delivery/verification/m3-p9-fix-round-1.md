# M3-P9 fix round 1: delta verification

Status: IN PROGRESS, written incrementally. This file's mtime is the
liveness beacon for this session; a death leaves this partial content rather
than nothing.

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

## Summary of verdict (expanded reasoning below)

**NOT VERIFIED AS FULLY CLOSING THE MECHANISM. VERIFIED AS A CORRECT AND
HONEST PARTIAL REPAIR** that closes every instance the two clean-room reviews
and the round's own derivation named, with one HIGH-severity residue the round
did not find and did not name, in the same fail-open direction as CR-001.

Everything else the round claims (the four red witnesses, the CR-002 fix, the
absence-vs-not-applicable policy, the suite counts, the claim-grep discipline)
held up under direct attack and is recorded below with the commands that
checked it.

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

