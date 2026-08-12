# Mechanism index

What this project has already learned about specific mechanisms, and where the
evidence is. Seeded 2026-08-05 from the M1 record, per tuition T-005's
"available now" measure, and intended to be SUPERSEDED by the generated index
M3-P8 produces as a projection of the tuition feed. This is the interim, not
the deliverable.

**CONVERTED, AND THIS FILE IS NO LONGER THE ONE TO READ.** M3-P6 converted all
twelve rows below into `tuition/mechanism-index.yaml`, which is the schema-
validated form M3-P8's generated projection writes into and the path
`roles/implementer.md` mandates. Read that. This file stays only until M3-P8
deletes it, and it stays for one mechanical reason: a registered test derives
the twelve mechanism names from the table below and fails naming any the seed
index has lost, so the interim file is the independent source that makes
"nothing was silently dropped" checkable rather than asserted. **Add new rows to
the index, never here**; a row added below would be a thirteenth name the seed
does not carry, which reddens that test, and that is the check working.

**Read the row before you use the mechanism.** Every rule here was paid for
with a defect, a fix round, or an investigation. A rule with no citation is not
a rule; if you add a row, cite the artifact that established it.

| Mechanism | Rule established | Paid for by |
|---|---|---|
| Claim file (mutual exclusion by O_EXCL) | A claim that cannot be taken must fail LOUDLY and name the stuck file. A silent timeout is indistinguishable from an absence of contention. There are now THREE claim-file users (the lock, the watcher seen-state, and M2-P1's evidence-directory run claim); the next one reads `src/lock.ts` first, and the M2-P1 instance is the worked example of doing that and stating the one difference (no expiry, because an evidence directory must not have a lease that lapses). | `delivery/verification/u2-race-flake-investigation.md` D-3; the silent reimplementation two phases later became M1's most severe defect, `delivery/tuition/T-005` |
| Lease compare-and-swap | Liveness is lease freshness, never pid, process probing or signals (constraint C-2). Expiry does not block a release, but it DOES block a renew and it DOES block teardown's holdership check, which fails closed. | `src/lock.ts`; `checkHoldership` in `src/task.ts`; CR-680 in `delivery/review/clean-room-m1-p6-round3-hazard.md` |
| Append-only log | Never read current state from the tail of a log (constraint C-1). Currency comes from `meta.json` and turn-end files only. | plan v1 section 3, C-1 (FM-052) |
| Reading a path whose type is not established | lstat the link, stat what it resolves to, open ONLY a regular file. A block is not an exception, so try/catch does not touch it. Closed for the guard, watcher and doctor; still OPEN in `src/lock.ts`, `src/pool.ts` and `src/brief.ts`. | CR-520 and the four M1-P5 rounds; `delivery/verification/cr-520-orchestrator-reproduction.md` |
| Atomic file replacement | Stage under a name no other pass can collide with. A fixed `${path}.stage` lets two concurrent passes share one temporary; the loser dies on ENOENT after advancing its seen state, dropping a signal in a protocol whose rule is duplicate-rather-than-drop. | M1-P5 round 4, verified pre-existing against a pristine build |
| Worktree removal and force branch delete | Resolve, evaluate, then apply. No policy decision may be taken after a destructive action has begun, and destructive authority is never inherited from a component that does not exist yet. | `delivery/review/verification-m1-p3-fix-round.md` V-1, V-3 |
| Classifying another program's errors | Derive the signature from REAL captured output under forced conditions, never from hand-written examples chosen to match the implementation. 312 captured contention failures, every one of the dropped shape. | V-2, same file; CLAUDE.md environment warning 10 |
| Parsing another program's reporter output | PIN the format as a controlled input rather than widening the parse. A format-agnostic regex is a union of formats known on the day, and the default already differs between the two toolchains this project runs. | M1-P6 floor defect; `NODE_OPTIONS=--test-reporter=tap` scoped to the child |
| Deciding what another program will do by pattern-matching the text of a file it consumes | A regex over a file and the consuming program's evaluation of that file are DIFFERENT FUNCTIONS, so every finding is another input where they differ, and rounds close instances forever. Three tiers instead, each labelled by what enforces it: execute the extractable part against stubs; PIN the accepted shapes and fail closed on anything else, never widen the pattern; and where a denylist is unavoidable, DERIVE it by walking the consuming program's closed documented vocabulary once, publishing the walk. Name what remains unguarded rather than chasing it. | Four M1-P6 rounds: CR-640, CR-661, CR-681, CR-720 to CR-725. The derived walk found two members no reviewer had named (`working-directory`, a custom `shell` template); the widen-the-regex approach had produced a guard that both missed real defangs and rejected `needs: [test, lint]`, an edit that STRENGTHENS the guarded property |
| Asserting a CI step is wired | Assert BEHAVIOUR, not text. A text assertion catches deletion and misses defanging. Extract the step and execute it against stubs. A witness for a class must redden under at least two structurally different members. | CR-640, CR-661, CR-681; `delivery/verification/cr-661-orchestrator-reproduction.md` |
| Verifying access to a remote | `git push --dry-run` authenticates against receive-pack and updates no ref. `clone` and `ls-remote` are READ operations and witness nothing about write access. | `delivery/tuition/T-006`, the orchestrator's own instance |
| A guard's own failure path | A guard whose correctness depends on a crash is not a guard. Make the success path total, so removing the explicit failure is visible. | M1-P6 fix round 2, the D3 defang the implementer caught in its own fix |
