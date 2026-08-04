# DR-0003: CI runner choice

- id: DR-0003
- project: tiphys-kernel
- task: stage-1-intake
- question: Which CI system and runner image do the kernel repository's gates run on?
- reversibility: reversible in principle, but every gate script, the gate registry, and the M1 exit test bind to it, so switching later costs a phase; treated as costly and therefore owner-decided
- status: decided
- decided: GitHub Actions, hosted runners (owner, 2026-08-04)
- date: 2026-08-04

## Decision

Owner chose GitHub Actions on hosted runners ("this is way too small to have anything else"). Runner image ubuntu-latest, Node matrix per DR-0002 (26 only).

## Options

1. GitHub Actions, hosted ubuntu-latest runners. Zero setup, free for public repos, native integration with the branch protection and credential scoping the blueprint requires (section 4, credential scoping row). Matrix over Node versions is trivial.
2. GitHub Actions, self-hosted runner. More control and speed, but adds machine administration and a security surface on a public repo (self-hosted runners on public repos are explicitly discouraged by GitHub).
3. External CI (CircleCI, Buildkite, etc.). No advantage for a GitHub-hosted npm project; adds a second credential domain.

## Recommendation

GitHub Actions on hosted ubuntu-latest, Node matrix per DR-0002. The toolbelt is bash plus Node and needs no exotic hardware.

## Evidence

- Blueprint layer 1 is "bash + CI + git config": delivery/intake/orchestrated-delivery-v1.md section 2.
- Credential scoping via branch protection assumes GitHub-native enforcement: delivery/intake/orchestrated-delivery-v1.md section 4.
