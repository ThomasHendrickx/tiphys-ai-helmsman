# Tiphys kernel: repository rules

This file is the agent-rules single source for this repository until the M3
gate registry replaces it. It records the binding conventions of kernel plan
v1 section 1.4 (delivery/plan/kernel-plan-v1.md) and the repository's gate
list.

## Binding conventions

1. English only.
2. npm only, never pnpm or yarn.
3. No em dashes in any authored text (commas, colons, parentheses instead).
4. Falsifiable acceptance criteria only; "works correctly" is banned; the
   register is "node --test exits 0 and reports N tests, N > 0".
5. Parallelism is OFF until M5: every M1 phase is sequential, one phase =
   one branch = one PR, and the next phase starts only after the previous
   PR is merged.
6. Milestone exit tests are hard gates: no milestone starts before the
   previous exit test has passed with recorded evidence.

## Gates

Every change must pass, in order:

1. npm ci
2. npm run build
3. node --test

Notes: sources are TypeScript run natively via Node type stripping (tests
need no prior build); the build (tsc -b) is the type gate and emits dist/,
which is never committed (plan decisions D-17, D-18).
