# DR-0055: Tiphys stamps its content with the kernel version

- id: DR-0055
- status: DECIDED
- decided-by: owner, 2026-09-23
- date: 2026-09-23
- supersedes: nothing; it replaces one rejected alternative in DR-0053
- relates-to: DR-0012, DR-0053, DR-0054

## The decision

The owner, on kernel 0.2.1: content Tiphys generates should be stamped with
a version. The stamp marks history, and it is the way to check which rules
should and should not apply.

DR-0053 rejected "a schema-version field with grandfathering" as heavier.
The owner has chosen it. It is the mechanism DR-0054 needs: "current and
future work" becomes a readable property of a document rather than a guess.

## The design (0.2.1)

1. Documents Tiphys writes, and documents written under a Tiphys brief such
   as verdicts, carry a `tiphys-version` stamp: the kernel version that
   produced or briefed them.
2. Every validation rule added after 0.1.0 records the version it was
   introduced in, in one source. A rule applies to a document only when the
   document's stamp is at or after that version. An unstamped document is
   history from before stamping and is judged by 0.1.0 rules only.
3. Admission is never relaxed by a stamp. A verdict counted toward a merge
   must carry a current stamp, a `head`, and meet every current rule.
   Without this, a writer could write an old stamp to escape new rules. An
   old-stamped document still validates as history; it is excluded from
   admission, by name.

## What it does not do

A stamp is a claim by the writer. It is not proof of which kernel ran. Point
3 is what makes that safe: a false old stamp can only make a document count
as history, never as current evidence.

The merge conditions it protects are DR-0012's, at
delivery/decisions/DR-0012-delegated-merge-authority.md:22.

## Correction to point 3, 2026-09-23 (orchestrator design, not the owner's decision)

Point 3 as first written required a current stamp for admission. That would
exclude reviews written under 0.2.0, which carry `head` and no stamp. The
owner reported that pulse is writing exactly such reviews now. Requiring the
stamp would break in-flight work on upgrade, which DR-0054 forbids.

Corrected: admission does not read the stamp. It applies every current rule
to every verdict, stamped or not. So a false old stamp still cannot help a
verdict count toward a merge, and an unstamped current review still counts.
The stamp decides only which rules `validate` applies to history.
