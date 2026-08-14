# T-024: the stop condition counted its phases instead of deriving them, so the one script that cannot be reported around was wrong in BOTH directions

- date: 2026-08-14
- author: orchestrator
- subject: `.claude/orchestrator-next.mjs`, the durable stop condition written
  after the orchestrator stopped mid-milestone three times
- status: FIXED, with both directions witnessed. Not closed as a class: no
  sweep has been run over the other numeric constants in this repository, and
  what the derivation did NOT cover is stated below.

## What happened

The script exists because a rule that depends on remembering does not survive a
busy session, and the answer this project keeps arriving at is a mechanism
(CLAUDE.md:957). Its whole value is that it computes the stop condition from git
and files and exits nonzero whenever work remains, so a nonzero exit is a fact
the orchestrator cannot report its way around (CLAUDE.md:977).

It opened with a hard-coded `const PHASE_COUNT = 10` and iterated `1..10`.

M3 acquired an ELEVENTH phase mid-milestone: M3-P11 was added to own the
crash-is-not-a-skip defect. From then on the script printed `10/11` as `9/10`,
and M3-P11 was not merely uncounted, **it was never examined at all**. A phase
outside the range has no branch checked, no work history checked, and no
worktree freshness read.

## Both directions, measured, and the second is the interesting one

The obvious failure is under-counting. The second is not, and it was found by
running the script against a milestone that is FINISHED.

| invocation | old | new |
|---|---|---|
| `--milestone m3` | `9/10`, M3-P11 absent from the listing | `10/11`, M3-P11 listed MERGED |
| `--milestone m2` | `9/10`, phantom `m2-p10 not started`, exit 2 | `9/9`, `NOTHING LEFT`, exit 0 |
| `--milestone m9` | `0/10`, ten phantom phases | exits 4 with a message |

The old column is not remembered, it was re-run. The pre-fix script was
recovered from git and executed against the same clone:

```
git show HEAD:.claude/orchestrator-next.mjs > "$SP/onext-witness/old.mjs"
node "$SP/onext-witness/old.mjs" --milestone m2
```

M2 is delivered and its exit-test evidence is on main. The old script's next
action on it was **DISPATCH M2-P10**, a phase that does not exist. So the same
constant produced an invisible real phase in one milestone and an invented
phantom one in the other, and a false nonzero exit is not harmless here: it is
the shape that sends an orchestrator to dispatch nothing.

That satisfies the one-witness-is-not-a-class rule with two structurally
different members: a ceiling too low, and a ceiling too high.

## The mechanism, named rather than the instance

**A hard-coded count is a claim about every future member of the set.** It is
the same defect binding convention 5 already records for append-only registries
(CLAUDE.md:233), where a test pinning a row count over `test/behaviors.json` is
false the moment the next phase appends. This repository has paid for that
family four consecutive times in one component
(delivery/tuition/T-020-four-rounds-each-reintroduced-the-mechanism-they-closed.md:1).

What makes this instance worth its own entry is WHERE it landed. Every prior
member was a test or a gate, and a wrong test is loud. This one was in the
script whose entire purpose is to be the thing that cannot be argued with, and
its wrongness printed as an ordinary status line.

## The fix, and why the union rather than a better count

The phase set is now derived as the UNION of three sources, because no single
one covers every phase this repository has had:

1. a declaration on `origin/main` (M2-P1 has none; declarations began at M2-P2),
2. a work history on `origin/main` (a dispatched, unmerged phase has none there),
3. a pushed branch `origin/claude/<milestone>-p<N>-*` (a planned but undispatched
   phase has none).

Deriving from declarations ALONE would have reported M2 as eight phases, which
is the same bug with a nicer implementation. The union is what makes the M2 arm
in the table above come out right.

An empty derivation exits 4 with a message rather than reporting `0/0 merged,
nothing left`. That case would have been this script's own false green, and the
one thing it must never do is agree that there is nothing to do.

## What this entry does NOT establish

- **No sweep of other numeric constants has been run.** The derivation was:

  ```
  grep -rnE 'const [A-Z_]*(COUNT|TOTAL|NUM|PHASES?)[A-Z_]* *= *[0-9]+' .claude/ scripts/
  grep -rln 'm3-p' .claude/ scripts/
  ```

  The first returned exactly one line, this constant. The second returned
  `scripts/check-clause-map.mjs`, `scripts/check-dual-review.mjs` and
  `scripts/check-agents-references.mjs`, and all three hits were read and are
  prose in comments, not enumerations. It did NOT cover `src/`, `test/`, or any
  count expressed as a literal in a comparison rather than a named constant, and
  a count written `if (rows.length !== 12)` is invisible to both commands.
- **The empty-derivation guard has a witness; the union does not have a
  negative one.** No case has been constructed where the union over-counts, for
  example a stale remote branch for a phase that was abandoned. Such a branch
  would appear as a real phase and the script would demand it be driven to
  merge. That is a known and unwitnessed direction.
- **It says nothing about whether the script's OTHER judgments are sound**, only
  about which phases it looks at. The staleness threshold, the worktree path
  convention, and the next-action ordering are unexamined here.
