# Arbitration: M2-P2 red-witness harness, round-two fix delta (merge)

- date: 2026-08-06
- head: `217d518` (branch claude/m2-p2-red-witness-harness), current with main `8439c88`
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **CLEAN, MERGE** on green CI (joins the serial merge train).

## The verdicts on the round-two fix (head 217d518)

| | criteria delta (Sonnet) | hazard delta (Opus) |
|---|---|---|
| verdict | APPROVE | APPROVE |
| CR-1500 (was MEDIUM, merge-blocking) | closed; 5/6 new tests RED against pre-fix `7714805` for the right reason, GREEN with the fix, sha256-verified swap | closed at the mechanism; every namespace spelling flips `textAsserting`, single-deleting-member reddens end-to-end |
| CR-1501 (was LOW) | closed; `EXTENSIONLESS_ROOT_DOCS` recognised, out-of-set names stay behaviour as residue | closed; 18-name closed derived Set, over-reach checked |

Both contracts ran on different model families per T-007 and DR-0012, both
independently re-attacked the round-one-fix escape (namespace-qualified reads
`fs.readFileSync` / `fs.promises.readFile` / aliased `fsp.readFile`, deep
chains, whitespace between `.` and callee, inline forms) against the EXPORTED
`deriveTextAssertions` on the floor toolchain, and both confirmed the >=2-member
class rule is now enforced so a single deleting text-asserting member reddens.
The "one witness is not a class" bar is met: the class reddens under three
structurally different members (one-hop sync, two-hop `fs.promises` async,
aliased namespace). Over-reach checked clean: derived-value, parsed, and
runtime-var-path witnesses all stay behaviour; the fail-conservative rule stays
tied to the read RESULT being directly asserted.

## Gates and scope

Floor node v26.6.0 / npm 11.18.0: `npm ci` exit 0 (no EBADENGINE), `npm run
build` exit 0, clean `git status` after build, `test/witness.test.ts` 40/40,
full `npm test` 260 pass / 0 fail / 0 skip. Scope is the red-witness harness's
own module files plus the standing extras (`test/behaviors.json`,
`gates.manifest.json`, phase work history); both registries purely additive
(zero removals), `red-witness` a pure gate addition, all six new behavior keys
resolve 1:1. ASCII clean, no commit trailer (CR-1263 does not recur).

## The one non-blocking LOW, and why it does not gate

Hazard LOW-1: a call-expression-prefixed callee (`require("fs").readFileSync`,
`getFs().readFileSync`) returns `textAsserting=false` (fail-open) and is not
listed in the work history's item-3 "what the derivation does not cover." It is
the same fail-open category as the already-named residues and is practically
unreachable in the ESM target corpus (`require` is undefined by default in ESM;
the harness scans kernel test files, which are ESM). It does not gate under
DR-0012 (no unresolved high or medium). Recorded here as an accepted residue-
documentation gap; a one-sentence residue note in `delivery/work-history/m2-p2.md`
would close item-3 completeness and is folded into the M2-P9 / paperwork tidy,
not a fresh implementer round (disproportionate under DR-0016).

## Note: the liveness real-clock flake is not P2's

The criteria delta observed `test/liveness.test.ts:633` fail once in the full
suite (903s vs an asserted 902s real-clock boundary) and pass in isolation. It
is outside P2's diff and is the known liveness/watcher real-clock flake class
already carried forward (STATE.md). Treat a merge-train CI red on that test as a
benign rerun signal, not a P2 defect.

## Merge conditions (DR-0012)

Dual APPROVE on the code (no unresolved high or medium); scope audit clean;
branch current with `main`; CI green on the exact head `217d518` (pending,
merge on green in the serial train).
