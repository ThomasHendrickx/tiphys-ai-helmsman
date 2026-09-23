# Open: the cutover status tree-digest test reddened once in CI

Status: OPEN. The cause is not established.

## What was observed

The `pull_request` gates run 35853273549 (job 107155726142) on PR #211 head
5de114c failed one test of 1409:

```
a fleet with many pushed unmerged branches and no in-flight work drains clean and exits 0
AssertionError [ERR_ASSERTION]: criterion 7: the fleet tree changed across status
+ '67dba2854bc70cf6648f138bfe33c76bcda090a7d397d4c922b1b97048da7bba'
- '47257a9748489b3b9e98e1a09a34554feb8af0b5e764f0f4ab9cf9b9d8720f7b'
    at statusRun (test/cutover.test.ts:1863:10)
```

The test is test/cutover.test.ts:2005 on `main`. The digest helper at
test/cutover.test.ts:1767 hashes every file under the scratch fleet root,
`.git` included.

## What is known

- PR #211 does not touch `src/cutover.ts`, `src/commands/cutover.ts` or
  `test/cutover.test.ts`.
- The same test passed in the `push` run on `main` at 8558dca (gates run
  35847665771, success).
- Isolated on 5de114c with node v26.6.0, the test passed 20 of 20 runs.
- `cutover status` runs one git command against the fleet: `for-each-ref
  --no-merged` in `unmergedBranchCount`. It is read-only, and the status
  path contains no write call.
- Local git 2.43.0 runs `git maintenance run --auto` synchronously after a
  commit (captured with `GIT_TRACE=1`), so a detached maintenance job
  outliving the fixture was not reproduced here. The CI runner's git version
  was not checked.

## What was NOT covered

- Which file under the fleet root changed. The digest is a single hash and
  the CI run keeps no tree listing, so the changed path is unknown.
- Whether the runner's git detaches auto-maintenance, or refreshes the index.
- Whether a concurrent test in the same file touches the same scratch path.

## Next step when it recurs

Make the helper report the changed paths (a per-file digest map compared on
failure) rather than one hash. That turns the next occurrence into a
diagnosis instead of a second copy of this note.
