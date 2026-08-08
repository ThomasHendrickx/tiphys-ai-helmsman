/**
 * THE PHASE-DECLARATION PROJECTION (kernel plan M3, M3-P1 step 2; D-M3-18).
 *
 * The M2-P4 scope auditor reads one document per phase from
 * `delivery/plan/phase-declarations/<phase-id-lowercased>.json`, out of the
 * MERGE BASE of the audited branch. Until now that document was a SECOND
 * HAND-AUTHORED SOURCE beside the plan, and two hand-authored sources of the
 * same fact drift. This module makes it a GENERATED VIEW of the plan, so the
 * plan is the one source and the auditor's input is derived from it.
 *
 * WHAT THE PROJECTION EMITS, taken from the DELIVERED
 * `src/gates/schemas/phase-declaration.schema.json` rather than from a
 * description of it. The delivered schema sets `additionalProperties: false`,
 * so an extra property is a REJECTION and not an ignored field, and the
 * emitted key set is exactly these five, camelCase:
 *
 *   id, branch, filesToTouch, declaredExtras, citations
 *
 * TWO VOCABULARIES MEET HERE AND NOWHERE ELSE. The plan spells the same
 * fields `files-to-touch` and `extras`, because the plan is a document
 * authored for people. This projector is the single translation point, and
 * that is D-M3-18's whole value.
 *
 * THE GLOSS IS STRIPPED HERE OR NOWHERE (M2R-016). The auditor matches a
 * declared path as a literal string or as a directory prefix and interprets
 * nothing, so a plan entry written as
 *
 *   `src/cli.ts` (edit only if step 4 requires it)
 *
 * must project to `src/cli.ts`. A projector that passed the glossed form
 * through would emit a declaration under which every real change is
 * undeclared, and the auditor would be right to reject it.
 */

/** The five properties the delivered phase-declaration schema requires. */
export interface PhaseDeclaration {
  id: string;
  branch: string;
  filesToTouch: string[];
  declaredExtras: string[];
  citations: string[];
}

/**
 * Reduce one plan `files-to-touch` entry to the bare path.
 *
 * THIS FUNCTION FEEDS THE GATE THAT EXISTS TO PREVENT SCOPE WIDENING, so an
 * over-eager strip here is worse than no strip at all.
 *
 * MEASURED DEFECT, fix round 1 (B-001, high). The first version truncated at
 * the FIRST `(` and produced:
 *
 *   "src/app/(marketing)/page.tsx"  ->  "src/app/"
 *   "src/(lib)/util.ts"             ->  "src/"
 *
 * `src/gates/scope.ts` treats a trailing slash as a DIRECTORY PREFIX GRANT, so
 * each of those turned one declared file into an entire tree. Parenthesised
 * path segments are ordinary in real projects (Next.js route groups are the
 * obvious case), so this is not a corner.
 *
 * THE RULE NOW, and each clause is load-bearing:
 *
 *   1. A gloss is stripped only when it is TRAILING and the whole of it is
 *      parenthesised: `<path> (anything)` with the closing paren at the end.
 *   2. It is stripped only when WHITESPACE separates it from the path. A path
 *      whose own last segment is parenthesised, `src/app/(marketing)`, has no
 *      such whitespace and is left alone.
 *   3. What precedes the gloss must be ONE non-whitespace token, which is what
 *      a literal path is. That is the "plausible path" test, and it is why an
 *      interior `(` can never trigger a strip: the interior case never matches
 *      the trailing form at all.
 *
 * Anything the rule does not recognise is returned UNCHANGED and rejected
 * loudly by `projectPhase`, because a prose entry that reaches the auditor as
 * a literal string fails visibly, while a silently truncated one grants a
 * tree.
 */
const TRAILING_GLOSS = /^(\S+)\s+\([\s\S]*\)$/;

export function stripGloss(entry: string): string {
  let text = entry.trim();
  const trailing = TRAILING_GLOSS.exec(text);
  if (trailing !== null) {
    text = (trailing[1] as string).trim();
  }
  /* Backticks are markdown, never part of a path. Stripped AFTER the gloss,
     because the plan writes `` `path` (gloss) `` and the backticks close
     before the gloss opens. */
  text = text.replace(/^`+/, "").replace(/`+$/, "").trim();
  /* A trailing comma survives a list written inline. */
  text = text.replace(/,+$/, "").trim();
  return text;
}

/**
 * Is this a literal path the scope auditor can match?
 *
 * The auditor compares strings exactly or as a directory prefix and
 * interprets nothing, so an entry still carrying whitespace after the gloss
 * strip is prose. The projector REFUSES rather than emitting it: an emitted
 * prose entry is a declaration nobody can satisfy, and the failure would
 * surface as an unrelated scope-gate red on some later branch.
 */
export function isLiteralPath(entry: string): boolean {
  return entry !== "" && !/\s/.test(entry);
}

export interface ProjectionResult {
  ok: true;
  declaration: PhaseDeclaration;
  /** `m3-p1.json`, the filename the auditor looks for. */
  filename: string;
}

export interface ProjectionFailure {
  ok: false;
  reason: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Project one phase of a decoded plan into its declaration.
 *
 * The filename is the phase id LOWERCASED, because CI derives `--phase` from
 * the branch with a lowercase regex and the auditor looks the declaration up
 * by that name. An uppercase filename is a declaration the auditor never
 * finds, which reads exactly like a phase with no declaration at all.
 */
export function projectPhase(
  plan: unknown,
  phaseId: string,
): ProjectionResult | ProjectionFailure {
  const document = asRecord(plan);
  if (document === undefined) {
    return { ok: false, reason: "the plan document is not a mapping" };
  }
  const phases = Array.isArray(document["phases"]) ? document["phases"] : [];
  const phase = asRecord(
    phases.find((candidate) => asRecord(candidate)?.["id"] === phaseId),
  );
  if (phase === undefined) {
    return { ok: false, reason: `the plan contains no phase ${phaseId}` };
  }
  const filesToTouch = stringArray(phase["files-to-touch"])
    .map(stripGloss)
    .filter((path) => path !== "");
  const declaredExtras = stringArray(phase["extras"])
    .map(stripGloss)
    .filter((path) => path !== "");
  const prose = [...filesToTouch, ...declaredExtras].filter(
    (path) => !isLiteralPath(path),
  );
  if (prose.length > 0) {
    return {
      ok: false,
      reason:
        `phase ${phaseId} declares an entry that is not a literal path and ` +
        `cannot be projected: ${prose.map((p) => JSON.stringify(p)).join(", ")}`,
    };
  }
  const declaration: PhaseDeclaration = {
    id: String(phase["id"]),
    branch: String(phase["branch"]),
    filesToTouch,
    declaredExtras,
    citations: stringArray(phase["citations"]),
  };
  return {
    ok: true,
    declaration,
    filename: `${phaseId.toLowerCase()}.json`,
  };
}

/** The declaration as the auditor reads it: JSON, one trailing newline. */
export function renderDeclaration(declaration: PhaseDeclaration): string {
  return `${JSON.stringify(declaration, undefined, 2)}\n`;
}
