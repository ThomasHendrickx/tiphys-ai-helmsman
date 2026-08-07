# Arbitration: M2-P3 suite wrapper, round two delta (merge)

- date: 2026-08-06
- head: `6690200` (branch claude/m2-p3-suite-wrapper), current with main `8439c88`
- outcome: **CLEAN, MERGE** on green CI (queued in the serial merge train).

Both round-two delta contracts APPROVE, 0 high/medium/low of substance.
CR-1410-1 closed at the mechanism: `isFileWrapperPhantom` now compares
`resolve(cwd, point.name) === point.file`, spelling-invariant by construction
(`point.file` absolute, `resolve` reconciles any name spelling). The hazard
delta measured every invocation spelling (relative, absolute, ./-prefixed,
.. segments, bare auto-discovery, symlinked file/dir) and confirmed the
absolute-path spelling that defeated round one is now caught, with no
over-removal regression (a real test named after its own file surfaces as
discovery-parity RED, fail-safe, direction unchanged). Both red witnesses
re-executed independently (RED against round-one code, GREEN with the fix,
sha256-verified restore). Criterion 1 = 240, discovery and registry parity
hold. Scope exactly four files vs round one; gates.yml diff vs main empty.
Merge conditions per DR-0012: dual APPROVE, scope clean, current with main,
CI green on the exact head (pending, in the serial CI queue).
