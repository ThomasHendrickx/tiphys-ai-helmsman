# DR-0052: release verification waits for the registry, and v0.2.0 is tagged by hand

- id: DR-0052
- status: DECIDED
- decided-by: orchestrator, under DR-0016
- date: 2026-09-23
- supersedes: nothing
- relates-to: DR-0024, DR-0032, DR-0051, T-045

## The situation

The 0.2.0 publish succeeded and its post-publish registry verification failed,
because it ran before npm served the version. The full account is
delivery/tuition/T-045-the-registry-check-ran-before-the-registry-served.md:1.
As a result `@tiphys/kernel@0.2.0` is on npm with `latest` pointing at it and
provenance attached, and it has no `v0.2.0` tag and no GitHub release.

## The decisions

1. **Fix the verification now, outside the M5 plan.** It is a defect in
   shipped release tooling that makes every future release fail the same way,
   and the fix is contained to scripts/release-verify.sh:1 and its tests. The
   options are not comparable: leaving it means the next release repeats this
   by hand. So there is nothing to ask the owner (DR-0016).
2. **Do not re-run the failed release run.** A re-run repeats `npm publish`,
   which npm refuses for a version that exists. That makes the run red for a
   second, unrelated reason and still skips the tag.
3. **Tag v0.2.0 by hand, as the workflow's own recovery text says.** The tag
   must be ANNOTATED and at commit
   `cb5de0d29061ab5c50a6023658f18eee931e74a7`, which is the commit the run
   published and the `gitHead` npm records for 0.2.0. The GitHub release body
   copies the shape the workflow writes. This container cannot push tags or
   create releases, so this is owner action A-15.

## Evidence

- Publish succeeded, run 35839356656, job 107110446841: `+ @tiphys/kernel@0.2.0`
  and a provenance statement in the transparency log.
- Registry at 09:03Z: versions `0.0.0, 0.1.0, 0.2.0`, `latest` is `0.2.0`,
  `time["0.2.0"]` is `2026-09-23T09:01:47.626Z`, `gitHead` is `cb5de0d`, and
  attestations are present.
- Local `bash scripts/release-verify.sh @tiphys/kernel 0.2.0 --records <file>`
  on node v26.6.0 from an empty directory: exit 0, "verified".
