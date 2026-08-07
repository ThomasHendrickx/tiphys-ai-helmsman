# Arbitration: M2-P8 credential scoping, round two (merge)

- date: 2026-08-06
- head: `bc09a3d` (branch claude/m2-p8-credential-scoping), current with main `8439c88`
- outcome: **CLEAN, MERGE** on green CI (queued behind P4/P5/P7 to limit CI contention).

Both delta contracts APPROVE. Hazard: the probe is no longer tautological
beyond gh's token names; all 12 dangerous env names (git/ssh/node
credential+exec vocabulary, incl the numbered GIT_CONFIG_KEY_n/VALUE_n family)
redden when admitted to the allowlist, and a behavioral no-scope
`git config --get-all credential.helper` catches an env-injected helper the
scoped probes structurally miss; the shipped allowlist is unchanged and
leak-free against ~26 smuggling channels; the disclosed residue (a
credential-capable name outside the walked vocabulary, only reachable by an
implementer BOTH widening the allowlist AND picking an unwalked name) is a
bounded, disclosed denylist limit with the allowlist as the real defense, not
an overclaim. O1 (directory targets re-emptied on build) closed. Criteria: all
8 criteria hold (units 6->7 is the data-derived assertion holding, not a
regression), M1 exit test reached exit 0 under the scrub, src/spawn.ts
untouched, both record lows closed. Merge conditions per DR-0012: dual APPROVE,
scope clean, branch current with main, CI green on the exact head (pending).
