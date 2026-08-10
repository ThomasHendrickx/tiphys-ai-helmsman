# DR-0024: npm publishing authenticates by OIDC, not a long-lived token

- id: DR-0024
- project: tiphys-kernel
- task: M3-P10 release engineering
- question: How does the M3 exit run authenticate to npmjs when it publishes
  `@tiphys/kernel` v0.1.0: a long-lived automation token held as a repository
  secret, or OIDC trusted publishing from the GitHub Actions workflow?
- reversibility: cheap either way before first publish, and the choice is
  revisitable afterwards; what is NOT cheap is a leaked long-lived token
- status: DECIDED BY THE ORCHESTRATOR under DR-0016
- decided: OIDC trusted publishing. No long-lived npm token is created, stored,
  or scrubbed for.
- date: 2026-08-10

## Id allocation, checked rather than assumed

`DR-0024` was verified free across the WHOLE HISTORY, not just the current tree:
`git log --all -S'DR-0024'` and `-S'DR-0025'` both return nothing, and
`DR-0023` is the highest allocated. This check exists because `DR-0019` was once
allocated twice, the second time onto an id that had been created and then
deleted, and deletion does not free an id.

## Why this is a NEW record and not an amendment to DR-0008

DR-0008 is decided and is never reopened. Its subject was the REGISTRY and the
PACKAGE NAMES: public npmjs, `@tiphys/kernel` and
`@tiphys/claude-code-plugin`. It did not decide the authentication MECHANISM,
which was left implicit as "a publish credential" in owner action A-7.

Everything DR-0008 decided still stands. This record decides only how the
publishing step proves it is us.

## Why this was decided rather than escalated (DR-0016)

DR-0016 reserves the owner for cases where two or more options are genuinely
comparable AND the consequence is high impact and costly to reverse. These
options are not comparable, so there is nothing to ask.

The owner raised the OIDC recommendation themselves while reporting that the
`@tiphys` scope is claimed. That is context, not a delegation, and the
recommendation would be the same without it.

## The decision, and the argument for it

**OIDC trusted publishing.** The workflow requests a short-lived, audience-scoped
token from GitHub's OIDC provider at publish time; npm verifies it against a
trusted-publisher configuration naming this repository and this workflow. No
credential is stored anywhere.

Three reasons, in order of weight for THIS project:

1. **It removes the secret rather than protecting it.** This repository already
   runs `credential-scrub` and `credential-token` gates whose entire purpose is
   to keep credentials out of artifacts, and M2-P8 was a phase spent on
   credential scoping. Those gates protect against a leak. OIDC removes the
   thing that can leak. **A mechanism that makes the failure impossible beats a
   guard that detects it**, which is this project's stated thesis everywhere
   else and should apply to its own release path.
2. **Scope.** A long-lived automation token is a bearer credential for the whole
   `@tiphys` scope, valid until revoked, usable from anywhere. A trusted-publisher
   token is minted per run, expires in minutes, and is refused if the workflow or
   repository does not match.
3. **It shrinks owner action A-7.** A-7 becomes a configuration the owner
   performs in the npm UI, producing NOTHING that has to be transported to the
   orchestrator, stored as a secret, or rotated. The current A-7 wording asks the
   owner to "provide the npm publish credential", and there is now no credential
   to provide.

## What this obliges M3-P10 to do

- The publish job declares `permissions: id-token: write`. Without it the OIDC
  token cannot be minted and the publish fails closed, which is the correct
  direction.
- The npm CLI must be a version that supports trusted publishing. M3-P10 pins
  and records the version it used, per the usual evidence rule.
- The release verification contract (M2-P7) gains no new credential surface, so
  its adapters are unaffected.
- **`credential-token` becomes genuinely not-applicable for the npm path** rather
  than green-because-scrubbed. M3-P10 must state which, with the gate's own
  evaluated precondition, and not let a not-applicable pass as an unexamined
  skip.

`gates.manifest.json` on `main` carries the literal string
`implementer-token-present-owner-action-a-3`, which is M2's separate
implementer-token action and is NOT affected by this decision. It is named here
so nobody conflates the two token questions.

## THE OPEN QUESTION THIS RECORD DOES NOT SETTLE

**I do not know whether npm allows a trusted publisher to be configured for a
package that has never been published.** Some registries support a pending
configuration for a first release; others require the package to exist, which
would mean the very first publish cannot use OIDC.

That matters, because if npm requires an existing package then M3-P10 needs
either a one-time bootstrap publish by another means or a different first-release
plan, and discovering that during the exit run would be the worst time.

It is stated as an open question rather than guessed, per the claim-grep rule:
I did not find a way to settle it from inside this container, and I have not
tested it. **M3-P10's first step is to settle it against npm's current
documentation and record the answer here**, before any of the workflow is
written. If the answer is that OIDC cannot cover the first publish, that is a
new decision about the bootstrap only, and it does not disturb this one.

## Owner action A-7, updated

- **Part 1, claim the `@tiphys` scope on npmjs: DONE (owner, 2026-08-10).**
- **Part 2, no longer "provide a credential".** It becomes: configure the
  trusted publisher for `@tiphys/kernel` against this repository and the release
  workflow, once M3-P10 has settled the open question above and can name the
  workflow file. Still owner-reserved, because it needs npm account access the
  orchestrator does not hold.

A-7 keeps its id. The ACT changed shape; it did not become a different action,
and renumbering would break the citations that already name it.
