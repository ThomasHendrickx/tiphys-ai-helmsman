# DR-0032: the GitHub release is the owner's mental model of what exists, so it must never point at nothing

- date: 2026-08-14
- status: DECIDED by the owner, same day, in conversation
- supersedes nothing; extends M3 by one phase, M3-P12

## The question, and it was not the one first asked

The owner asked whether the release workflow also creates a GitHub release. It
does not, and the measurement is stronger than a grep: the job declares
`permissions: contents: read` and `id-token: write`, and creating a release or
pushing a tag requires `contents: write`, so the workflow STRUCTURALLY cannot
make one. Nothing in the M3 plan, the v1 plan, or any decision record asks for
one either, so its absence was neither an oversight nor a deliberate refusal.
It was never considered.

The owner's stated need was a link between a git commit and the published npm
version.

## The correction that came first, because half the need was already met

**`npm publish --access public --provenance` already links them, and more
strongly than a release would.** Provenance mints a signed Sigstore attestation
recording the source repository, the exact commit, and the workflow that built
the artifact, and npm renders it on the package page. That is cryptographic and
verifiable rather than conventional.

**What it does NOT do is run the other way.** Provenance answers "which commit
produced this published version". It creates nothing inside the repository, so
from `git log`, the branch view, or any tool enumerating the repository, there
is no way to see which commit is `0.1.0`. A tag is the only artifact that
carries that direction.

So the need is real and the tool is right, for a reason that is NOT the one in
the original question. Recording both halves, because a later reader who
believes provenance is missing will build the wrong thing.

## The owner's decision, in their words and then in its consequence

> "For me the release version in github is something I will need to have the
> correct mental model"

That is a requirement, not a preference, and it determines the phase's hazard
rather than its feature list. **If the GitHub release is the mental model of
what exists, then a release or a tag that exists WITHOUT a corresponding
published version is worse than having none at all**: it is a confident anchor
pointing at nothing, and it corrupts exactly the thing it was added to serve.

The reachability argument under DR-0027 follows from that and is stated here so
the phase does not have to re-derive it. A false release does not make the npm
package wrong. It makes the OWNER wrong, which is a real user path.

## What was decided

1. **M3-P12 is added**, before the `0.1.0` publish rather than after. Retro-
   tagging by hand afterwards is the asserted-rather-than-produced artifact this
   project keeps refusing, and `0.1.0` is the release most worth having the
   machinery handle end to end. The cost is that the M3 exit test slips by one
   phase, and the owner accepted that when approving.
2. **A SEPARATE JOB, not a step in the existing one.** The publish job's own
   comments write out its complete permission set deliberately, and adding
   `contents: write` to the job that mints the OIDC token is the wrong
   direction. Two jobs keep each grant minimal: the publisher keeps
   `contents: read` plus `id-token: write`, and the tagger takes
   `contents: write` and no `id-token`.
3. **The publish itself remains the owner's call**, unchanged by this record.

## What this decision does NOT decide

- **It does not ask for release notes, a changelog, or signing beyond
  provenance.** Those are separate wants and none of them was raised.
- **It does not settle whether the same treatment is owed to
  `@tiphys/claude-code-plugin`.** That package has no release workflow at all,
  so the question does not arise yet.
- **It does not establish that a second job is free of risk.** Widening any
  permission on the release path is the security-relevant change in this phase,
  and it is the thing the adversarial review should attack first.
