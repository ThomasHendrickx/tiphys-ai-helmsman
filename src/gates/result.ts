import type { Pin } from "./pin.ts";

/**
 * THE GATE RESULT RECORD (kernel plan M2, M2-P1 step 2).
 *
 * Every gate this milestone ships emits exactly one of these, and the exit
 * test counts them. Nine phases build against this shape, so it is written
 * once here and never re-derived: a gate that invents its own record is a
 * review finding.
 *
 * THE STATUS VOCABULARY IS FOUR WORDS AND THEY ARE NOT INTERCHANGEABLE.
 *
 *   green            the gate did its work and the property holds
 *   red              the gate did its work and the property does not hold
 *   not-applicable   the gate's precondition WAS EVALUATED and found unmet
 *   error            the gate could not reach a verdict
 *
 * `not-applicable` is the one most easily abused, and SC-011 is why it is
 * spelled out: it ASSERTS that a precondition was evaluated. A gate that
 * could not evaluate its precondition, could not find its input, or was
 * invoked without a parameter it needs is `error` and never
 * `not-applicable` and never green (M2-C-3, fail closed). "Never green by
 * omission" is the whole point of the vocabulary.
 *
 * M2-C-2, ENFORCED HERE RATHER THAN REMEMBERED. A record with status
 * `green` and `units` 0 claims a property holds while having examined
 * nothing. `makeGateResult` rewrites it to `error` naming M2-C-2 and marks
 * it `vacuous`, and there is no other constructor, so a gate built on this
 * module cannot emit one. The runner applies the SAME rule again when it
 * ingests a record, because a gate written in another language or by hand
 * does not go through this constructor and must not be able to smuggle a
 * vacuous green past the runner (see `ingestRecord` in run.ts).
 *
 * WHY `vacuous` IS A FIELD AND NOT A STRING TO GREP FOR. Step 8 requires
 * the summary to count `vacuous` as a strict subset of `error`. Once the
 * rewrite has happened, a vacuous error and an ordinary error are the same
 * status, so the runner would have to recover the distinction by
 * pattern-matching the detail text of a record another program wrote.
 * MECHANISMS.md's row "Deciding what another program will do by
 * pattern-matching the text of a file it consumes" is exactly that
 * mechanism and it cost this project four rounds. So the distinction is
 * carried structurally. This is an addition to the plan's field list and is
 * declared as such in the work history.
 */

/** The four words. Nothing else is a status. */
export type GateStatus = "green" | "red" | "not-applicable" | "error";

export const GATE_STATUSES: readonly GateStatus[] = [
  "green",
  "red",
  "not-applicable",
  "error",
];

/**
 * The gate subprocess exit-code table, and the runner's own aggregate exit
 * codes. One table, used by both ends of the pipe, so a gate and the runner
 * can never disagree about what 20 means.
 *
 * 64 is EX_USAGE and is the CLI's, not a gate status: a gate that exits 64
 * was invoked wrongly, which means it measured nothing, which the runner
 * records as `error`.
 */
export const EXIT_GREEN = 0;
export const EXIT_RED = 1;
export const EXIT_NOT_APPLICABLE = 20;
export const EXIT_GATE_ERROR = 21;

export function exitCodeForStatus(status: GateStatus): number {
  if (status === "green") {
    return EXIT_GREEN;
  }
  if (status === "red") {
    return EXIT_RED;
  }
  if (status === "not-applicable") {
    return EXIT_NOT_APPLICABLE;
  }
  return EXIT_GATE_ERROR;
}

export function statusForExitCode(code: number): GateStatus | undefined {
  if (code === EXIT_GREEN) {
    return "green";
  }
  if (code === EXIT_RED) {
    return "red";
  }
  if (code === EXIT_NOT_APPLICABLE) {
    return "not-applicable";
  }
  if (code === EXIT_GATE_ERROR) {
    return "error";
  }
  return undefined;
}

/**
 * What a precondition evaluation concluded. `met` false means EVALUATED AND
 * UNMET; an evaluation that could not conclude produces no PreconditionRecord
 * at all, because the gate is `error` and the reason says so.
 */
export interface PreconditionRecord {
  id: string;
  met: boolean;
  reason: string;
  evidence?: string[];
}

/** Start and end pins for the gates M2-C-5 binds. */
export interface PinPair {
  start: Pin;
  end: Pin;
}

export interface GateResult {
  gate: string;
  status: GateStatus;
  units: number;
  unitLabel: string;
  startedAt: string;
  endedAt: string;
  /** Set only when the M2-C-2 rewrite fired. See the module comment. */
  vacuous?: boolean;
  precondition?: PreconditionRecord;
  pin?: PinPair;
  detail: string;
  /** Paths relative to the evidence directory. */
  evidence: string[];
}

/** The fields a caller supplies; the constructor owns `vacuous`. */
export interface GateResultFields {
  gate: string;
  status: GateStatus;
  units: number;
  unitLabel: string;
  startedAt: string;
  endedAt: string;
  precondition?: PreconditionRecord;
  pin?: PinPair;
  detail: string;
  evidence?: string[];
}

export const M2_C_2_DETAIL =
  "M2-C-2 (never green by omission): a gate reporting green with units 0 " +
  "examined nothing, so this record is error";

/**
 * THE ONLY CONSTRUCTOR. Applies the M2-C-2 rewrite, so a green record with
 * zero units cannot be constructed. `units` is coerced to a non-negative
 * integer: a negative or fractional unit count is not a smaller measurement,
 * it is an unusable one, so it is treated as zero and therefore triggers the
 * same rewrite when the status was green.
 */
export function makeGateResult(fields: GateResultFields): GateResult {
  const units =
    Number.isFinite(fields.units) && Number.isInteger(fields.units) && fields.units > 0
      ? fields.units
      : 0;
  const base: GateResult = {
    gate: fields.gate,
    status: fields.status,
    units,
    unitLabel: fields.unitLabel,
    startedAt: fields.startedAt,
    endedAt: fields.endedAt,
    detail: fields.detail,
    evidence: fields.evidence === undefined ? [] : [...fields.evidence],
  };
  if (fields.precondition !== undefined) {
    base.precondition = fields.precondition;
  }
  if (fields.pin !== undefined) {
    base.pin = fields.pin;
  }
  if (base.status === "green" && base.units === 0) {
    return {
      ...base,
      status: "error",
      vacuous: true,
      detail:
        base.detail === ""
          ? M2_C_2_DETAIL
          : `${M2_C_2_DETAIL}; the gate reported: ${base.detail}`,
    };
  }
  return base;
}

/** Serialize a record the way every kernel JSON state file is written. */
export function renderGateResult(result: GateResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
