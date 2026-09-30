# M6-P6 arbitration (tier `single`)

## Round 0 (head f86e9ae)

One hazard review on the cheaper tier: APPROVE, no finding at high or medium.

The orchestrator took two items from the implementer's own open questions
into the one allowed fix round, because each made the phase miss its intent:

1. The default toolchain location (`$HOME/.toolchains`) sits under a private
   `/root` in a cloud session, so an unprivileged-uid test could not run the
   interpreter. Fixed: the SessionStart hook sets
   `TIPHYS_TOOLCHAINS_DIR=/opt/tiphys-toolchains`; hook test red when the
   variable is dropped or left at the default; CLAUDE.md warning 15.
2. `.claude/orchestrator-next.mjs` looked for `kernel-plan-m6.md` and exited
   7. Fixed: it finds the milestone's plan file by its phase headings; M2 to
   M5 output unchanged.

## Fix round 1 (head 63e5d8c)

Implementer report: named tests 10/10, `npm test` 1238 pass 0 fail 0 skipped
(node v26.6.0, dist built, `npm test`), authored bytes exit 0, CLAUDE.md
24983 bytes.

No change, recorded: orchestrator-next reports M6 phases "not started"
because it looks for `claude/m6-pN-*` branches and this milestone lands every
phase from `claude/upbeat-gates-w3cm5m` (DR-0057). Orchestrator harness, not
shipped; left as is.

A delta review on the cheaper tier runs at the head that merges `main` after
M6-P4, before the pull request.

## Final-head check (code head 3007547)

- reviews: delivery/review/m6-p6-hazard.json (round 0: m6-p6-hazard-round0.json)

`main` with M6-P4 merged in at 3007547 (parents 63e5d8c and b4e93ce); only
test/behaviors.json conflicted, resolved as the union minus the row M6-P4
removed on purpose. The delta check APPROVES at 3007547 with no finding:
both fix-round tests pass, the merge kept both sides, CLAUDE.md 24983,
gate-registry.yaml 5729, assurance-modes.yaml 4403 bytes. Its `npm test` run
was cut off by its own tool timeout (900 tests, 882 pass, 0 fail, 18
cancelled), so the full suite at this head is proven by the pull request's
`suite` gate, not by the review.
