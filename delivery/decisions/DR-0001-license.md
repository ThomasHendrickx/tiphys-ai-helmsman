# DR-0001: Repository license

- id: DR-0001
- project: tiphys-kernel
- task: stage-1-intake
- question: Which license does the public tiphys-ai-helmsman repository (and the @tiphys npm packages built from it) ship under?
- reversibility: costly (relicensing published npm versions is practically impossible; the license travels with every installed copy)
- status: open
- decided: (pending)
- date: 2026-08-04

## Options

1. MIT. Shortest, maximally permissive, the npm ecosystem default. No explicit patent grant.
2. Apache-2.0. Permissive with an explicit patent grant and contributor terms. Slightly heavier (NOTICE handling).
3. No license (all rights reserved). Keeps the repo public but legally closed; blocks any outside reuse and most CI badge or registry tooling assumptions.

## Recommendation

MIT. The kernel is developer tooling intended to be depended on via npm; MIT minimizes friction and matches ecosystem norms. Apache-2.0 is the right alternative if patent protection matters to the owner.

## Evidence

- Blueprint requires npm distribution: delivery/intake/orchestrated-delivery-v1.md section 3.
- Publishing to a registry without a license field triggers warnings and blocks some downstream use.
