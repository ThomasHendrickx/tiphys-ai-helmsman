# Provenance of the release-verification fixtures

Every fixture in this directory derives from the captured platform evidence
in `delivery/verification/release-verification-interface.md` appendix A
(authenticated read-only connector calls, 2026-08-05). This file states,
per fixture and per field, which bytes are captured and which are marked
placeholders, so that no reader mistakes a placeholder for an observation
(T-003 lesson 4; CLAUDE.md environment warning 10; kernel plan M2, M2-P7
step 2).

THE RULE THE PLACEHOLDERS OBEY: a placeholder stands only for an IDENTITY
HANDLE or free-text label whose value appendix A deliberately truncated or
omitted (deployment ids, hostnames, account identifiers, commit titles).
Every such value carries the literal marker `PLACEHOLDER` (or is a
placeholder sha of repeated hex digits, or a placeholder integer, named
below). NO status value, NO state-machine value and NO field NAME anywhere
in these fixtures is a placeholder: every one of those is verbatim from the
capture. No non-success platform state was ever captured, so none appears
here, and no fixture may ever grow one without a new capture to cite.

## supabase-list-migrations-empty.json

Byte-for-byte the captured response, complete: appendix A.3 records that
`list_migrations` returned `{"migrations":[]}` against two separate
`ACTIVE_HEALTHY` production projects. 17 bytes, no trailing newline. This
is a REAL response a real, healthy project produces from a plausible
applied-inventory source, which is why the applied side and the repository
side of the migrations gate are not symmetric (investigation section 7.3;
plan criterion 8).

## vercel-deployments.json

Derived from appendix A.1 (`list_deployments`, 20 records, plus
`get_deployment` for one). The envelope of the listing response was not
transcribed in appendix A, so this fixture is the ARRAY of deployment
objects itself; tests point the adapter's `listPointer` at the document
root, and nothing asserts on any envelope.

Captured verbatim (field names and values):

- every field NAME: `id`, `name`, `url`, `type`, `state`, `createdAt`,
  `creator`, `project`, `meta`, `alias`, `target`, `regions`, `buildingAt`,
  `ready`, `readyState`, `source`, `aliasError`, `isRollbackCandidate`,
  and the `meta` keys `githubCommitSha`, `githubCommitRef`,
  `githubCommitOrg`, `githubCommitRepo`, `githubRepoId`, `githubPrId`,
  `branchAlias`
- `"state": "READY"` and `"readyState": "READY"`, both present and equal
  (the only deployment state ever observed; all 20 listed deployments were
  READY)
- `"target": "production"` and `"target": null` (the only two observed
  values)
- `"source": "git"`, `"type": "LAMBDAS"`, `"aliasError": null`
- `"buildingAt": 1785881489393` and `"ready": 1785881807886` (the one
  captured timing pair, 318493 ms apart)
- `meta.githubCommitSha` `61b964beb868730e3c195ab032c2822fe62a65cf` with
  `meta.githubCommitRef` `main` (the observed current production
  deployment)
- `meta.githubCommitSha` `929d387be1fc2d1c9464d172b9610947076ccf9e`
  appearing on TWO distinct deployments, one `"target": "production"` and
  one `"target": null` (the captured fact that makes sha-only matching a
  fooling hazard; plan criterion 5)
- `isRollbackCandidate` as a per-deployment boolean, `true` on some records
- `githubPrId` present on the branch deployment and ABSENT on both
  production deployments (captured presence pattern)
- `alias` on the current production deployment is an array of five entries
  (captured count; the hostnames were deliberately omitted from the
  capture)

Placeholders (identity handles the capture truncated or omitted, all
marked): deployment `id` values (appendix A confirms two DISTINCT ids carry
the 929d387 sha but does not transcribe them), `name`, `url`, `creator`,
`project`, `regions` entries, `alias` hostnames, `meta.githubCommitOrg`,
`meta.githubCommitRepo`, `meta.githubRepoId`, `meta.githubPrId`,
`meta.branchAlias`, and the preview deployment's `githubCommitRef`.

Stand-in epoch values, marked here because they carry no `PLACEHOLDER`
string: the `createdAt` values reuse the captured `buildingAt` instant
`1785881489393`, and the second and third deployments reuse the captured
`buildingAt`/`ready` pair, because appendix A transcribed exactly one
timing set. No test asserts on these values.

## github-actions-run-in-progress.json, github-actions-run-success.json, github-actions-run-cancelled.json

Derived from appendix A.2 (`list_workflow_runs` against this repository).
One file per captured run shape, so the observe tests replay each shape
alone.

Captured verbatim:

- `"status":"completed","conclusion":"success"` and
  `"status":"completed","conclusion":"cancelled"`, each observed as an
  adjacent pair on completed runs (the pairs are kept adjacent here)
- the in-progress run carries `"status":"in_progress"` followed
  immediately by `"workflow_id"`, and NO `conclusion` KEY AT ALL: the
  capture searched the whole response for `"conclusion":null` and found
  zero matches, so the field is omitted rather than nulled. The fixture
  preserves both the omission and the key adjacency. This is the shape
  that dissolved revision 1's criterion 3 (observation O-2): an absent
  pointer on a healthy in-flight run is `pending`, not `error`.
- identity field NAMES per run: `head_sha`, `head_branch`, `event`,
  `run_attempt`, `workflow_id`, `check_suite_id`, `display_title`
- `event` values `"pull_request"` and `"push"` (both observed)

Placeholders (marked, or of the placeholder forms named here): `head_sha`
values are repeated-hex-digit shas (`aaa...`, `bbb...`, `ccc...`),
`head_branch` and `display_title` carry the `PLACEHOLDER` marker,
`workflow_id` and `check_suite_id` are the placeholder integers
`100000001` and `2000000xx`, and `run_attempt` is `1` (the capture attests
the field name; the value here is a placeholder for an untranscribed
value). No test asserts on any of these values except that locate-by-sha
tests supply the fixture's own sha as the subject.
