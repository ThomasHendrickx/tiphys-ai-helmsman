# M3-P11 fix round 1: delta verification

Delta verifier, adversarial pass. Branch under verification:
`claude/m3-p11-precondition-crash-verdict`, reviewed head `a73313d`, fix round
`a73313d..6274414`, with `origin/main` merged in at `2947240`. This document
lives on `claude/verify-m3-p11-fr1`, cut from `main` at `6fa9633` per T-019, in
its own worktree; the phase branch itself was never modified.

Status while in progress: WRITE IN PROGRESS. Sections are appended as work is
done; the verdict at the bottom is the last thing written.

## What this document does NOT cover

(filled in as the investigation proceeds; not deferred to the end)

- No attempt was made to re-run the two prior clean-room reviews
  (`delivery/review/clean-room-m3-p11-criteria.md`,
  `delivery/review/clean-room-m3-p11-hazard.md`). This is a delta pass over
  the fix round only, as scoped.
- No attempt was made to read CI. `gh` 401s against REST in this environment
  and any check depending on it fails silently; this document relies only on
  local execution.
- The full M3-P11 phase spec and plan are not re-litigated; only the fix
  round's own claims (mechanism 1 halves A/B, mechanism 2 C-1/C-2/M-1, and the
  witness claims) are attacked.
- (more added below as coverage is decided)

## Setup

Worktree at an absolute scratch path, not inside the primary repository:

```
git worktree add <scratch>/wt/verify origin/main --detach   # this document's home
git worktree add <scratch>/wt/phase claude/m3-p11-precondition-crash-verdict --detach  # code under test
```

`node_modules` copied from the primary repository into the phase worktree
(no network available); `npm run build` there exits 0.

Toolchain: node v26.6.0 (confirmed via `node --version`), fetched per the
CLAUDE.md standing warning, on `$PATH` ahead of the system node.

