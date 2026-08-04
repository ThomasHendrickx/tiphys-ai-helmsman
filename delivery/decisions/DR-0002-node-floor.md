# DR-0002: Node.js version floor

- id: DR-0002
- project: tiphys-kernel
- task: stage-1-intake
- question: What is the minimum Node.js version the kernel supports (package.json engines field, and the version every fleet home must run)?
- reversibility: costly (raising the floor later is a breaking change for every fleet home; setting it too low forbids newer runtime APIs across the whole toolbelt)
- status: open
- decided: (pending)
- date: 2026-08-04

## Options

1. Node >= 22. The oldest LTS line still in maintenance as of 2026-08 (Node 20 reached end of life in April 2026). Gives fleet homes on either current LTS a supported path.
2. Node >= 24. The active LTS line. Newest stable APIs (including a mature built-in test runner and glob), single-version support story, but excludes machines still on 22.
3. Node >= 20. Wider compatibility on paper, but the line is end of life; pinning a floor to an unsupported runtime contradicts determinism-first hygiene.

## Recommendation

Node >= 22, with CI testing on 22 and 24. All toolbelt code restricted to APIs available in 22. Revisit the floor when 22 leaves maintenance (scheduled April 2027).

## Evidence

- Blueprint: kernel ships as an npm package consumed by fleet homes, delivery/intake/orchestrated-delivery-v1.md section 3.
- Node release schedule: 20 EOL 2026-04, 22 maintenance until 2027-04, 24 active LTS.
