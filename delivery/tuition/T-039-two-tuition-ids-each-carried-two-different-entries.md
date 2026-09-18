# T-039: two tuition ids each carried two different entries, and the rule that
# forbids it named check commands for a different scheme

**Measured:** 2026-09-18, on `main` at `ac8288f`.

**Found by:** the orchestrator, while verifying an unrelated citation target with
`ls delivery/tuition/ | grep -E 'T-03[12]'`. Not by any gate, not by any review,
and not by the rule that exists to prevent it.

## What was on `main`

Two ids each carried two unrelated documents:

| id | first subject, landed | second subject, landed |
|---|---|---|
| `T-031` | a patch witness is coupled to upstream bytes, 2026-09-16 (#161) | the absent arm of the push watcher returned success, 2026-09-17 (#177) |
| `T-032` | the local clone is a stale source, 2026-09-16 (#161) | the plugin package had no red-witness gate, 2026-09-17 (#187) |

Derivation, re-runnable:

```
git ls-tree -r --name-only origin/main delivery/tuition/ \
  | sed 's|.*/T-\([0-9]*\).*|\1|' | sort -n | uniq -c | awk '$1>1'
```

The orchestrator allocated both second entries. The first of each pair came from
a different session, and the two sessions overlapped by about fourteen hours.

## The mechanism, which is not "the orchestrator forgot"

CLAUDE.md:704 states the rule for every scheme: a retired id is never reused,
in ANY of them. Immediately under it, CLAUDE.md:718 gives the two commands that
settle it, and **both of them are written for the `DR-nnnn` scheme**:

```
git log --all --oneline -- 'delivery/decisions/DR-nnnn*'
git log --all --oneline -S'DR-nnnn'
```

That section exists because `DR-0019` was allocated twice. The fix it shipped
was a command for the scheme that had just been got wrong, and a sentence
generalising the rule to the others. So an allocator working in the `T-nnn`
scheme reads a binding rule, finds no command for their scheme, and falls back
to reading the highest id they can see. **The generalisation was in the prose
and the mechanism was in one scheme**, which is this project's most-recorded
failure shape: a rule that depends on remembering does not survive a busy
session, and the answer is a mechanism (T-005, T-006, T-017).

The second half of the mechanism is that the fallback is not merely
memory-based, it is BLIND IN THE DIRECTION THAT MATTERS. Reading the highest id
in your own working tree cannot see an id another session has allocated and not
yet merged, and cannot see a deleted one at all. Both second entries were
allocated from a clone that was correct at the time it was read.

## What was done

- `T-031-the-absent-arm-of-the-push-watcher-returned-success.md` renumbered to
  `T-037`, and `T-032-the-plugin-package-had-no-red-witness-gate.md` to `T-038`.
  The LATER allocation moves, which is the precedent `DR-0019` set.
- The two surviving documents carry a redirect note naming the renumbered entry,
  so a citation written in the window between the collision and this fix
  resolves to something that tells the reader where to go. No historical work
  history or merged declaration was rewritten to chase the id.
- src/gates/red-witness.ts:159 was the one LIVE reference in `src/` and now
  names `T-038`. Derivation: `grep -rn 'T-031\|T-032' src/ bin/ scripts/`, one
  hit, shown in full.
- `scripts/check-id-collisions.mjs` is the mechanism, and it covers both schemes
  rather than the one that just broke.

## The script, and the two distinctions its first draft got wrong

The first draft reported **16 collisions where there were 2**, and both causes
are recorded in the script's own header because a check that cries wolf is one
nobody runs twice.

1. **It read history for collisions.** An id that carried a different subject on
   a branch and was renumbered BEFORE landing is the rule working, not a breach.
   `T-033` is exactly that case: the stop-condition entry was drafted under it,
   found the id taken, and moved to `T-036` before its pull request. Collisions
   are read from `git ls-files`; only the TAKEN set reads all of history,
   because deletion does not free an id.
2. **It treated the shipped projection as a second entry.** `tuition/T-nnn.yaml`
   at the repository root is the cross-project feed's projection of
   `delivery/tuition/T-nnn-*.md`. The same id in both is required, not a
   collision. Only two distinct subjects inside one AUTHORING directory collide.

## Red witness, two structurally different members

Member A, the real collision, on unmodified `origin/main`:

```
COLLISION T-031 (tuition) carries 2 distinct subjects:
  delivery/tuition/T-031-a-patch-witness-is-coupled-to-upstream-bytes.md
  delivery/tuition/T-031-the-absent-arm-of-the-push-watcher-returned-success.md
COLLISION T-032 (tuition) carries 2 distinct subjects:
  delivery/tuition/T-032-the-local-clone-is-a-stale-source.md
  delivery/tuition/T-032-the-plugin-package-had-no-red-witness-gate.md
tuition: 36 id(s) taken across all history, highest T-036, next free T-037
owner decision records: 45 id(s) taken across all history, highest DR-0046, next free DR-0047
check-id-collisions: 2 collision(s)
EXIT=1
```

Member B, structurally different: a second subject filed under an existing id in
the OTHER scheme, which is a different directory, a different regex and a
different id width, and which has no projection directory at all.

```
COLLISION DR-0012 (owner decision records) carries 2 distinct subjects:
  delivery/decisions/DR-0012-a-different-subject-entirely.md
  delivery/decisions/DR-0012-delegated-merge-authority.md
check-id-collisions: 3 collision(s)
EXIT=1
```

Green arm, after the renumbering in this change:

```
tuition: 38 id(s) taken across all history, highest T-038, next free T-039
owner decision records: 45 id(s) taken across all history, highest DR-0046, next free DR-0047
check-id-collisions: no collisions
EXIT=0
```

**The negative control is in member A's output rather than in a separate run.**
`T-001` through `T-018` exist in BOTH `delivery/tuition/` and `tuition/`, and
none of them is reported. That is the distinction the first draft failed, so the
run that proves the check red also proves it does not fire on the expected pair.

## What this does NOT cover, stated because an empty result is not an absence

- **It is not wired into CI.** It is a script an allocator runs, so it is one
  step better than a reminder and one step short of a gate. Adding a gate means
  a registry row, a manifest row and a rendered agent-rules row, which is a
  phase-sized change and not something to improvise with two phases left in M4.
  Tracked with the orchestrator rather than claimed as done.
- **It checks two schemes, and CLAUDE.md declares eleven.** `SC-nnn`, `R-nnn`,
  `FM-nnn`, `PR-nnn`, `EXT-F-nn`, `CR-nnn`, `V-n`, `U-n`, `C-n`, `D-nn` and
  `A-n` are not covered. The two covered are the two that allocate one FILE per
  id, so a filename check can see them. The rest live inside documents and a
  filename check is structurally blind to them. `A-n` is the one most likely to
  bite next: CLAUDE.md:763 records that it has ALREADY collided three ways, one
  of them a literal string inside a shipped `gates.manifest.json`.
- **It says nothing about whether an id is CORRECT**, only whether it is unique.
  A document filed under a free id that discusses a different subject than its
  slug claims is invisible to it.
