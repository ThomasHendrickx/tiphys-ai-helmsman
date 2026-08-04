# DR-0001: Repository license

- id: DR-0001
- project: tiphys-kernel
- task: stage-1-intake
- question: Which license does the public tiphys-ai-helmsman repository (and the @tiphys npm packages built from it) ship under?
- reversibility: costly (relicensing published npm versions is practically impossible; the license travels with every installed copy)
- status: decided
- decided: Apache-2.0 (owner, 2026-08-04)
- date: 2026-08-04

## Decision

Owner chose Apache-2.0 over the MIT recommendation. Implementation: M1-P1 ships a LICENSE file with the Apache-2.0 text and sets "license": "Apache-2.0" in package.json. A NOTICE file is added when third-party notices first require one.

## Options

1. MIT. Shortest, maximally permissive, the npm ecosystem default. No explicit patent grant.
2. Apache-2.0. Permissive with an explicit patent grant and contributor terms. Slightly heavier (NOTICE handling).
3. No license (all rights reserved). Keeps the repo public but legally closed; blocks any outside reuse and most CI badge or registry tooling assumptions.

## Recommendation

MIT. The kernel is developer tooling intended to be depended on via npm; MIT minimizes friction and matches ecosystem norms. Apache-2.0 is the right alternative if patent protection matters to the owner.

## Evidence

- Blueprint requires npm distribution: delivery/intake/orchestrated-delivery-v1.md section 3.
- Publishing to a registry without a license field triggers warnings and blocks some downstream use.
