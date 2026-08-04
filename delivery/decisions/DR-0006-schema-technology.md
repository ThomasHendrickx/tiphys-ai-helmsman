# DR-0006: Schema technology and artifact format

- id: DR-0006
- project: tiphys-kernel
- task: stage-1-plan
- question: What format are the kernel's artifacts (charters, plans, decision records, status lines, reports) authored in, and what schema system validates them? Raised by finding SC-005: every artifact in the system depends on this, charters are "schema-enforced; missing field blocks realization", yet no document names the schema technology.
- reversibility: costly (changing it later means migrating every artifact and every validator in every fleet; the owner authors charters by hand in this format)
- status: decided
- decided: Lintable schema first; markdown only as justified exception (owner, 2026-08-04)
- date: 2026-08-04

## Decision

Owner overrode the markdown-first recommendation with a stricter rule, recorded as the standing artifact policy:

1. Any artifact content that can be expressed as structured data lives in YAML or JSON (owner is indifferent between the two) validated by a lintable schema. Structured-first is the default for every kernel artifact type (charters, plans, decision records, status lines, reports, gate outputs).
2. Markdown (with structured frontmatter for its machine-readable fields) is the exception, permitted only for content that genuinely cannot be structured (long-form prose such as narrative sections of reports or a charter's product-intent page).
3. Every use of markdown over YAML/JSON must state its reason in the artifact type's definition, and the reason must be valid on its own terms. "Easier", "faster", or "more convenient" are never valid reasons.

Validation technology: JSON Schema over the YAML/JSON artifacts (language-neutral, survives DR-0005). The per-artifact split (which types are pure structured data, which carry a justified prose section) is designed at M2/M3 planning under this rule, with the justification recorded per artifact type.

The system runs on paperwork: charters you write per project, plans, decision records (files like this one), status lines, reports. The blueprint requires that paperwork to be machine-validated (a charter with a missing field must block work from starting). This decision picks the file format that paperwork is written in and the technology that validates it. The recommendation: markdown documents with a small structured header block (YAML frontmatter) that scripts validate against JSON Schema files, so you write prose and machines check structure. These decision-record files are already shaped that way. Nothing in M1 depends on this; it falls due when M2 gate formats or the M3 schema work is planned. It can be deferred exactly like DR-0008 if preferred.

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
