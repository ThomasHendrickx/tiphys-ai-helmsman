# DR-0056: M5-P5 after the third review contract

- id: DR-0056
- status: DECIDED, option A
- decided-by: owner, 2026-09-23
- raised-by: orchestrator, 2026-09-23
- relates-to: DR-0012, DR-0016, DR-0054

## The situation

M5-P5 (the context diet, PR #215) went through three rounds.

1. Round 0, head 681efcd: a high finding. The guards that stop a binding rule
   from being lost tested that text existed, not that it was still binding.
2. Fix round 1, head ecab915: the same high came back through other routes.
   Under DR-0012 (delivery/decisions/DR-0012-delegated-merge-authority.md:34)
   and DR-0016, a fresh implementer and a third review contract followed.
3. Fresh round, head d353faf: the approach changed from a denylist to an
   allowlist over the document's structure. The Sonnet criteria verification
   APPROVES. The Fable hazard review (a family new to this phase) finds no
   high and 2 mediums:
   - CR-001: inline markup such as strikethrough around a rule leaves it
     read as binding.
   - CR-002: a blockquote or HTML marker indented four spaces inside a
     numbered list item is read as list text.

DR-0016 says a phase whose third round also fails goes to the owner.

## Options

A. One more short round by the same fresh implementer, for the two mediums
   and the cheap lows. Then both reviewers re-verify.
B. Merge now and record the two mediums as known residue. This is outside
   DR-0012, which forbids an unresolved medium, so it needs the owner.
C. Stop the phase and narrow what it claims.

## Recommendation

A. The recurring high did not recur, so the change of approach worked. The
two mediums are parser edge cases, and the reviewer judged each fixable in a
few lines. Strikethrough is a routine editor move, so it is worth closing.

## Owner answer, 2026-09-23

"Option a but dont overcomplicate the implementation." One short round for
the two mediums, kept simple: a tripwire over strikethrough markup and any
indented container marker, not a fuller parser. The remaining lows are
recorded as residue unless a fix is one line.
