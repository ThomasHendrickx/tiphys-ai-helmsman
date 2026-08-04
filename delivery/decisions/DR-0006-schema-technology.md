# DR-0006: Schema technology and artifact format

- id: DR-0006
- project: tiphys-kernel
- task: stage-1-plan
- question: What format are the kernel's artifacts (charters, plans, decision records, status lines, reports) authored in, and what schema system validates them? Raised by finding SC-005: every artifact in the system depends on this, charters are "schema-enforced; missing field blocks realization", yet no document names the schema technology.
- reversibility: costly (changing it later means migrating every artifact and every validator in every fleet; the owner authors charters by hand in this format)
- status: open
- decided: (pending)
- date: 2026-08-04

## Options

1. Markdown artifacts with YAML frontmatter, frontmatter validated by JSON Schema (schemas/ holds one JSON Schema file per artifact type; a small kernel validator checks frontmatter structure, required prose sections checked by heading presence). Humans read and write prose; scripts validate structure. Matches how the existing decision records are already shaped.
2. Pure JSON or YAML artifacts validated by JSON Schema. Maximally machine-checkable, but the owner and every reviewer then reads and hand-authors raw data files, which fights the "one page max, what winning looks like" prose intent of charters.
3. TypeScript-native validation (zod or similar) as the single source of schema truth. Tight integration with option 2 of DR-0005, but couples the artifact contract to the implementation language and makes schemas unreadable outside the kernel codebase.

## Recommendation

Option 1: markdown with YAML frontmatter validated by JSON Schema, prose sections checked by required-heading presence. JSON Schema is language-neutral (survives any future DR-0005 revision), the schemas/ directory in the blueprint topology maps to it directly, and the artifact stays human-first, which the charter and decision-record use cases require.

Scope note: M1 does not consume this decision (plan decision D-3 keeps M1 state files as plain JSON with no schema library). The decision must be made before M3 schema work is planned in detail, and earlier if M2 gate output formats want to share the validator.

## Evidence

- SC-005 in delivery/verification/spec-coherence-report.md (silence-irreversible, severity medium).
- "Each artifact gets a schema or template file", "schema-enforced; missing field blocks realization", "in a schema a script structurally validates": delivery/intake/orchestrated-delivery-v1.md sections 5, 7, and 1.
- Reversibility boundary: delivery/intake/orchestrated-delivery-v1.md section 7.
