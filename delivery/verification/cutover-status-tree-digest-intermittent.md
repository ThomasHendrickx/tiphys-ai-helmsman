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

## A second intermittent the same day, in a different test

The `push` run 35862907311 on `main` at 5662d74 (the M5-P2 merge) went red
on its first attempt. The `M2 exit test (push)` step's `suite` gate reported
one failing test: "a corpus-scoped refusal names the source that corpus was
read from, on both arms" (test/single-family-exception.test.ts:1224).

- The same test PASSED earlier in the same job, in the plain suite step, on
  the same tree. Only the gate's own re-run of the suite failed it.
- Isolated on 5662d74 with node v26.6.0, it passed 5 of 5 runs.
- The re-run of the failed job (attempt 2) was green, so `main` at 5662d74
  is green on the push arm.
- The uploaded `gates-summary-push-attempt-1` artifact is 1442 bytes and
  carries no per-test detail, so which of the test's two arms failed is
  unknown.

What was checked and found nothing: no test writes into the real
repository's `assurance-modes.yaml` or `templates/charter.example.yaml`,
which this test copies from the repository root; the suite gate's child
environment differs from the plain step only in `NODE_OPTIONS` (its reporter)
and dropped `NODE_TEST_*` variables, and the test's child is plain `node`.

The two failures share no file. Both tests stage scratch git repositories
under the OS temporary directory and assert on what a command reports about
them. That is a common shape, not an established cause.
