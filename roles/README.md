# roles/

The kernel's role briefs. One markdown file per role of blueprint section 6,
each carrying YAML frontmatter validated by `schemas/role-brief.schema.json`,
plus `_shared-dispatch-contract.md`, which is not a brief and is included by
all of them.

Delivered by M3-P5 (investigator, plan writer, adversarial plan reviewer) and
M3-P6 (implementer, clean-room reviewer). The orchestrator's brief is
`AGENTS.md` at the repository root and uses the same frontmatter schema with
`role: orchestrator` (M3-P9).

## Why markdown and not a structured document

Section 1.5 of the M3 plan grants role briefs a JUSTIFIED EXCEPTION to the
lintable-schema-first rule. A brief is instruction prose addressed to a
reasoning agent, and its effect comes from argument, ordering and emphasis,
which have no field decomposition that preserves them: splitting a brief into
fields produces either one giant string field, which is structure that carries
nothing, or a set of fragments no agent reads as an argument. The frontmatter
carries everything that IS enumerable and is schema-validated. The reason is
not that markdown is easier.

## The three mechanical contracts

A brief is prose, and three things about it are checked by machine.

### 1. Frontmatter

The file OPENS with a `---` fence, and a second `---` closes the block. The
enclosed YAML validates against `schemas/role-brief.schema.json`:

```
tiphys validate --type role-brief roles/investigator.md
```

The body is not schema-parsed. A `---` in the middle of a document is a
horizontal rule and is not a frontmatter fence: only the block at the top of
the file is read as frontmatter.

### 2. The include

A line whose entire content is

```
$include: _shared-dispatch-contract.md
```

is replaced by that file's text, resolved against `roles/` (the directory the
including brief is in). Includes are ONE LEVEL DEEP: an include inside an
included file is refused by name, because a nested include would be a second
place the shared text could come from and the point of the shared block is
that there is exactly one.

`_shared-dispatch-contract.md` exists because M3-P5's three briefs and
M3-P6's two carry the same two dispatch-contract clauses. Five independently
editable copies of one rule drift into five different rules; one copy cannot.
A phase that needs the shared text CHANGED escalates rather than editing it,
because the same edit changes every brief that includes it.

### 3. The clause round trip

Every id in the frontmatter's `clauses[]` must occur EXACTLY ONCE as a body
heading anchor of the include-expanded body, and every anchor must be declared
in `clauses[]`. Both directions are checked by
`tiphys validate --type role-brief`, and a violation exits nonzero naming the
clause id.

An anchor is a markdown heading of the form

```
## clause <clause-id>: <title>
```

The word `clause` is the marker and the title is optional. The form is
explicit on purpose: an anchor rule that guessed, such as "a heading whose
text looks like an identifier", would classify ordinary headings like
`## Scope` as anchors and redden every brief that has one.

What the round trip buys is that a clause id cannot be a LABEL WITH NOTHING
BEHIND IT. `scripts/check-clause-map.mjs` asks only whether the id occurs
somewhere in the file, so without this check a brief could satisfy the clause
map by listing ids in its frontmatter and writing no text at all.

What it does NOT buy, stated so nobody reads it as more: it proves PRESENCE
and never content. Whether the text under `## clause R-004` says what R-004
says, or the opposite of it, is judgment, and the M3-P5 plan section records
that no criterion reaches the general case.

## Mandated reading

`mandated-reading[]` is an ORDERED list of paths, resolved against the
INSTALLED KERNEL ROOT (the directory holding `roles/`), not against the
current working directory. `tiphys brief compose` checks every one of them
before it emits anything and exits nonzero naming the first that does not
resolve.

The paths are established with `classifyEntry` and are NEVER OPENED by the
check, so a missing path and a named pipe are two different reported failures
rather than one hang (D-M3-27). That distinction is not pedantry: a mandated
reading entry pointing at a FIFO would otherwise block `brief compose` forever
with no output and no exit code.

Because these paths resolve against the kernel root, a brief may only mandate
reading that the kernel SHIPS. `package.json`'s `files` entry is the list of
what that is.

## Composition

```
tiphys brief compose --role plan-writer \
  --phase templates/plan.example.yaml --phase-id M9-P1 [--out brief.md]
```

The composed brief contains, in order: a frontmatter-driven header carrying
the resolved mandated-reading list, the brief body with includes expanded, the
named phase rendered from the plan instance, and the fleet warnings file when
one is present in the current working directory.

The rendered phase is a COMPLETE projection: every required field of
`schemas/plan.schema.json`'s phase definition is rendered under its own
heading. The renderer's field list is hand-written in `src/roles.ts` and the
test that guards it reads the schema, so adding a required phase field reddens
that test until the renderer is extended, rather than silently shrinking every
brief.

What composition writes is what `tiphys spawn --brief` consumes. `src/brief.ts`
remains the assembly spawn performs at launch and is unchanged.
