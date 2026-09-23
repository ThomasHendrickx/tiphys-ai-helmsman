# T-045: the registry check ran before the registry served the version

## What happened

Release run 35839356656 published `@tiphys/kernel@0.2.0` on 2026-09-23.
`npm publish` succeeded at 08:56:38Z and printed "Your package is being
processed and may take a few minutes to become available." The next step,
the post-publish registry verification, ran one second later. Every one of
its five steps failed (install exit 1, import exit 1, bin-version exit 127,
copy-template exit 1, validate-template exit 127), so the job failed and the
`tag` job was skipped.

Nothing was wrong with the package. The registry's own publish time for
0.2.0 is 09:01:47Z, about five minutes after the publish call returned. Run by
hand at 09:03Z from an empty directory, scripts/release-verify.sh:1 verified
the same version from the registry with exit 0.

The 0.1.0 release did not hit this. Whether npm was faster that day or the
timing was luck is not known.

## The mechanism

**A check that cannot tell "not there yet" from "there and broken" reports
the first as the second.** The post-publish verification has no notion of
availability. It installs at once, so eventual consistency on the registry
side reads as a broken artifact.

The workflow's own design choice limited the damage, and it held as written:
a failed verification skips the tag, so the result was a published version
with a visibly missing tag, never a tag pointing at nothing (DR-0032).

## What changes

1. The registry-mode verification waits, with a bound, until the registry
   serves exactly the requested version. A timeout gets its own message and
   exit code, and a version that is served but broken still fails the steps.
   The decision is DR-0052.
2. The missing `v0.2.0` tag and GitHub release are owner action A-15,
   because this container can push neither tags nor releases: `git push` of a
   `refs/tags/*` ref is refused with HTTP 403 (standing warning 14), and the
   API path for tag objects answers "Write access to this GitHub API path is
   not permitted through this proxy."

## The general lesson

When a step reads a system that is eventually consistent, the step needs a
bounded wait for the thing to appear, and the wait's failure must be
distinguishable from the check's failure. Otherwise the fastest possible run
is the one most likely to be red.
