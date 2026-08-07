# Arbitration: M2-P3 suite wrapper, round two

- date: 2026-08-06
- head: `35a9c17` (branch claude/m2-p3-suite-wrapper)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** One medium from the hazard delta; criteria
  delta APPROVE. Second fix round, still with an implementer (DR-0016 sends
  round three, not round two, to a fresh implementer plus third contract).

## The verdicts

| | criteria delta (Sonnet, CR-1425) | hazard delta (Opus, CR-1410) |
|---|---|---|
| verdict | APPROVE | FIX-ROUND-NEEDED |

The criteria delta confirms CR-1306's named instance closed, both record
fixes landed, gates.yml dropped, scope clean. The hazard delta found the fix
closed only one SPELLING of the mechanism it claims to close.

## The mechanism (CR-1410-1, medium)

Round one's phantom filter discriminates by `point.name === relative(cwd,
point.file)`. Node names the file-wrapper phantom by the file's path AS
INVOKED, so under an ABSOLUTE-path invocation the name is the absolute path,
`relative(cwd, file)` does not equal it, the filter misses it, and (measured)
discovery parity also passes because the walk produces absolute paths too, so
a zero-test file reports GREEN again. That is the exact CR-1306 defect and the
phase's own declared silent-shrink hazard, reachable through a different
spelling of the invocation.

Latent for THIS repo (its `scripts.test` uses a relative glob, so criterion 1
is unaffected at 238), but the gate reads the target repo's verbatim test
script and the kernel exists to run on other repos, so the spelling is not
controllable. And the round-one work history's own stated mechanism ("the
phantom's name is exactly the file's path as invoked") is strictly broader
than the relative-only check it shipped, while its non-coverage section does
not disclose the absolute-path slip-past. Fix-round-contract item 3 (state
what the derivation did not cover) is therefore unmet.

**Fix at the mechanism, spelling-invariant:** discriminate the phantom by a
property invariant to how the path is spelled, e.g. `resolve(cwd, point.name)
=== point.file` (`resolve` is already imported), which catches both the
relative and absolute name spellings. Red witnesses must stage BOTH spellings
as dangerous states (a zero-test file invoked by a relative path AND by an
absolute path), each green-suppressed pre-fix and caught post-fix, and the
work history must disclose any remaining spelling the property does not cover
(e.g. a symlinked path) with a reason.

## Fix-round contract, binding

Name the mechanism (discriminate by a spelling-invariant identity of the
file, not one path spelling), not the absolute-path instance. Publish the
derivation: enumerate the spellings node can produce for the phantom name and
show the chosen property is invariant across them, with the command output;
state what it does not cover. Two structurally different red-witness members
(relative-invoked and absolute-invoked zero-test files). Confirm criterion 1
stays 238 and the over-removal false-RED residual is unchanged. Claim grep
last. Both toolchains. Update onto current main first. Suggested tier: Sonnet
(small, well-specified change).
