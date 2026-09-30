# M6-P5 arbitration, round 0 (head 2dff22d)

Review A was dispatched through `tiphys review dispatch` itself (tier
strongest, observed claude-opus-5, 96 turns, $10.57). The reviewer could not
write or execute (no permission flags in the executor argv), so the record has
`sha256: null` and does not count. Its verdict, written to its scratchpad, is
FIX-ROUND-NEEDED: 2 high, 3 medium, 4 low. Copy:
/home/user/.orch/verdicts/m6-p5-hazard-a-round0-2dff22d.json.

Review B is held until after the fix, so both reviews judge one head and both
go through the fixed dispatch.

Fixed in round 1: A-01 (argv grants write and execute; live smoke), A-02
(scrubbed child env), A-03 (review-families read at the merge base; the
landing of the declaration is decided from a measurement), A-04 (unclaimed
verdict for the head refuses), A-05 (vocabulary id compared), lows: nonzero
executor exit not counted, dispatch copies the verdict and removes its
worktree, role-model-config rationale.

No change: A-06 unsigned records (committed in the reviewed PR); working tree
vs blob hash under content filters (none in use); lab/ (outside scope).

## Fix rounds 2 and 3 (orchestrator rulings)

Round 2 (b06e9fe): DR-0065 realized. Kernel grant `REVIEWER_GRANT` in
src/review.ts, mapped by the Claude Code executor to acceptEdits, file rules
anchored to `./**`, explicit denies of WebFetch, WebSearch and `git push`.
Live smoke (haiku, $0.066): verdict sha256 non-null, observed model recorded,
`permission_denials: []`. Accepted; no second smoke.

Round 3 (338b16b): the dispatch runs `npm ci` in the review worktree before
launch, and maps the grant before creating anything. Blocker found by the
implementer: in this container the scrubbed environment lacks
`NODE_EXTRA_CA_CERTS`, which the kernel refuses by design
(src/gates/credentials.ts DANGEROUS_ENV_VOCABULARY), so npm fails TLS at the
proxy.

Ruling (orchestrator, DR-0016: one option is clearly better): the install
step uses `--prefer-offline --cache <the kernel's own npm cache>`. It does
not touch the security vocabulary; tarballs in the cache are checked against
the lockfile's integrity hashes; a head that adds a dependency not yet cached
falls back to the network and, here, refuses before launch with one line.
Rejected: carrying `NODE_EXTRA_CA_CERTS` into the install (weakens a guard to
fix a convenience), and passing the proxy CA as `--cafile` (the same thing by
another route).

Round 4 (284d374): the install uses `--prefer-offline --cache <kernel npm
cache>`. Measured here with the stub executor: dispatch exit 0 in 3.3 s
(round 3 refused after 71 s). `npm test` 1182 pass 0 fail 0 skipped
(node v26.6.0, dist built). Accepted. Next: merge `main` after P3, P4 and P6
land, one full gate pass, then two kernel-dispatched hazard reviews.

## Kernel-launched reviews at 284d374 (2026-09-30, 18:07 to 18:38)

Both launched through `tiphys review dispatch` with the DR-0065 grant; both
records carry a verdict sha256, so p5-live is met by real use.

- B, cheaper tier: requested and observed claude-haiku-4-5-20251001, family
  anthropic, APPROVE, no findings, $0.67, 5.5 minutes. Record
  review-m6-p5-20260930t181244z-d311a8.json.
- A, strongest tier: requested and observed claude-opus-5, FIX-ROUND-NEEDED,
  $20.79, 31 minutes. Record review-m6-p5-20260930t180728z-3544d1.json.
  CR-M6P5A-10 medium (no-base not-applicable arm ignores a refusing count; a
  regression from aa20be3), lows A-11 (case-insensitive verdict extension),
  A-12 (judgeFamilies ok over an empty set), A-13 (the brief does not state
  the grant; a PATH prefix is refused, so the ambient node decides), A-14
  (two registry tests fail on TLS inside the scrubbed review env).

Ruled: fix round 5, fresh implementer, A-10 to A-13. A-14 no change: the
failure is the scrubbed environment having no CA for this container's proxy,
not the branch; the reviewer's own proposal (skip on an unreachable registry)
trades a red for a skip in the one place a reviewer measures, and CI reaches
the registry. No reviewer re-check of the fixes (owner rule); after the last
merge of `main`, two short kernel-launched final-head checks.

Revised the same evening, after the owner objected to a fifth fix round:
round 5 is A-10 only. A-11, A-12 and A-13 are recorded, no change.

## Fix round 5 (head b074be8)

CR-M6P5A-10 fixed: mechanism "a not-applicable arm decided before the
refusals were read"; the no-base arm reads `unclaimedRefusalFaults` first and
is red on any refusal. Named test test/merge-preconditions.test.ts:2842
(m6-p5-unclaimed-refusal-red-without-base), red at 284d374 (actual
not-applicable, expected red), green after. Witness spec, three members, each
red by hand. Derivation found three not-applicable arms; one fixed, two
justified. Work-history over-claim corrected. Suite: node v26.6.0, dist
built, `npm test` 1183 tests, 1183 pass, 0 fail, 0 skipped.
No reviewer re-check (owner rule). P5 code is final at b074be8.

## Final-head checks (code head 810a88e)

- reviews: delivery/review/m6-p5-hazard-c.json, delivery/review/m6-p5-hazard-f.json

`main` (with M6-P3, M6-P8, M6-P4 and M6-P6) merged in at 810a88e; ten files
conflicted, each resolved so both sides stay (work history, "Merge of
main"); suite 1239 pass, 0 fail, 0 skipped (node v26.6.0, dist built).
Two kernel-launched final-head checks on the strongest tier, both APPROVE
with no finding: C ($4.45) and F ($7.43). Each ran the A-10 test green,
mutated the fix and saw it red, checked the merge as an exact three-way
union, and ran the suite (two known TLS failures inside the scrubbed review
environment, CR-M6P5A-14).

Two cheaper-tier checks at the same head (D and E, claude-haiku-4-5,
$0.29 and $0.36) cleared their checks from the work history's claims
without mutating anything; both were discarded and are not committed.
Their records stay outside the repository.

## CI landing (code head bfd941b)

- reviews: delivery/review/m6-p5-hazard-i.json, delivery/review/m6-p5-hazard-j.json

Pull request #233's `pull_request` run went red on two gates:
`merge-preconditions` (the workflow passed the branch name as `--phase`, so
the gate counted none of the `m6-p5` records) and `red-witness` (a stored
spec, `witness/mechanism-index-claim-file-rule.json`, failed rule (d) after
M6-P6 rewrapped the tuition text it mutates). Fixes: the step takes the
phase from the title's leading `Mn-Pn:` when the branch names none, with a
named test; the spec is removed (DR-0061). Work history "CI landing".

Two kernel-launched strongest-tier delta checks at `acc09b0`, both APPROVE:

- G ($10.10, verdict sha256 `db0c71af...`): low CR-M6P5G-01, the
  test runs the step with `bash -e` and not the runner's `--noprofile --norc
  -e -o pipefail`. No change: the derivation has one pipeline, and the
  injection, branch-first and fallback arms were each measured by hand.
- H ($7.28, verdict sha256 `248d3615...`): low CR-M6P5H-01, the removal
  commit's one-line reason is imprecise (the find texts still resolve; the
  likelier fault is that the T-005 member is not a dangerous state). No
  change: the removal stands either way, and a removal's reason is one line
  (DR-0061).

`acc09b0` and its parent were then recreated as signed commits `bfd941b`
and `1b7f661` (same trees, same messages; the unsigned ones were never
pushed). G and H name `acc09b0`, which is not in this history, so their
verdicts and records are not committed. Their records stay at
`/home/user/.orch/review-out/m6-p5/review-m6-p5-20260930t223755z-83144a.json`
and `...t223815z-297d56.json`, outside the repository.

Two kernel-launched strongest-tier identity checks at `bfd941b` (I and J)
proved the trees equal, the messages equal and trailer-free, and ran the
named test (1 test, 1 pass). Both APPROVE with no finding: I ($0.85) and J
($1.11). The landing head differs from `bfd941b` only under delivery/.
