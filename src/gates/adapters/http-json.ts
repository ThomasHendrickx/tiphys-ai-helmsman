import { realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readRegularFileIfPresent, refuseOpenForWrite } from "../../task.ts";
import type { ReleaseSubject } from "../release.ts";

/**
 * THE http-json REFERENCE ADAPTER (kernel plan M2, M2-P7 step 5). The
 * generic transport adapter, and THE ONLY PLACE A JSON POINTER EXISTS
 * (step 6): extraction left the interface, the kernel never learns what a
 * statusPath is, and a project configures pointers here, per project.
 *
 * It uses the same boundary as any third party's adapter: spawned by argv
 * with a request file path, one bounded observation, a response written to
 * the kernel-supplied record path, then exit. NOT PRIVILEGED: there is no
 * in-process path for a kernel-shipped adapter, because a defect in the
 * subprocess boundary that the shipped adapters bypass would be invisible
 * until the first third party hit it (investigation section 5.2).
 *
 * NO FAILURE VOCABULARY (plan step 2). The configuration names ONE
 * satisfying value. Optionally it names ONE terminal condition (a pointer
 * and the single value that marks the platform's state machine finished,
 * e.g. GitHub Actions' "status": "completed", which IS captured); when the
 * terminal condition holds and the satisfying value does not, the outcome
 * is `failed` naming the observed value verbatim. Without a terminal
 * declaration, every non-satisfying observed value is recorded verbatim
 * and reported `pending`; the kernel turns pending into red at the
 * deadline. Unknown never becomes green.
 *
 * LOCATE-THEN-OBSERVE (investigation section 2.1, demand 1). The incident
 * is "deploys silently not spawning": in that state there is no release
 * object to poll, so a poller with only a known endpoint cannot detect the
 * exact failure it is named after. With a `locate` configuration this
 * adapter finds the subject's release object in a listing and reports
 * `absent` when nothing matches: a legitimate early observation, distinct
 * from pending and from error, which the kernel converts to red at the
 * deadline with the reason naming the missing object.
 *
 * The adapter never sleeps, never loops, never schedules and never decides
 * what a timeout means: the kernel owns the clock and terminates an
 * attempt that overruns.
 */

interface MatchRule {
  pointer: string;
  subjectField?: keyof ReleaseSubject;
  equals?: unknown;
}

interface LocateConfig {
  listPointer: string;
  match: MatchRule[];
  idPointer: string;
  kind?: string;
  createdAtPointer?: string;
}

interface ObserveConfig {
  statusPointer: string;
  satisfiedValue: unknown;
  terminalPointer?: string;
  terminalValue?: unknown;
}

interface HttpJsonConfig {
  url: string;
  method?: string;
  locate?: LocateConfig;
  observe: ObserveConfig;
}

interface AdapterRequest {
  contractVersion: string;
  verification: string;
  subject: ReleaseSubject;
  config: HttpJsonConfig;
  attempt: { number: number; deadline: string };
  recordPath: string;
}

const ADAPTER_NAME = "http-json";

/** RFC 6901 JSON pointer resolution. Absent is distinguished from null. */
export function resolvePointer(
  document: unknown,
  pointer: string,
): { found: boolean; value?: unknown } {
  if (pointer === "") {
    return { found: true, value: document };
  }
  if (!pointer.startsWith("/")) {
    return { found: false };
  }
  let current: unknown = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.split("~1").join("/").split("~0").join("~");
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false };
      }
      current = current[index];
      continue;
    }
    if (typeof current === "object" && current !== null) {
      if (!Object.hasOwn(current, token)) {
        return { found: false };
      }
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return { found: false };
  }
  return { found: true, value: current };
}

/** Strict equality for JSON primitives; deep for anything else via JSON. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function display(value: unknown): string {
  return value === undefined ? "(no value)" : JSON.stringify(value);
}

interface ResponseFields {
  outcome: string;
  resolved?: Record<string, unknown>;
  observation?: { raw?: unknown; detail: string };
  reason?: string;
  units?: number;
  transport?: { httpStatus?: number };
}

function writeResponse(request: AdapterRequest, fields: ResponseFields): void {
  const refusal = refuseOpenForWrite(request.recordPath);
  if (refusal !== undefined) {
    process.stderr.write(`${ADAPTER_NAME}: ${refusal}\n`);
    process.exitCode = 1;
    return;
  }
  const response = {
    contractVersion: "1",
    adapter: ADAPTER_NAME,
    subject: request.subject,
    outcome: fields.outcome,
    ...(fields.resolved === undefined ? {} : { resolved: fields.resolved }),
    observedAt: new Date().toISOString(),
    ...(fields.observation === undefined ? {} : { observation: fields.observation }),
    ...(fields.reason === undefined ? {} : { reason: fields.reason }),
    ...(fields.units === undefined ? {} : { units: fields.units }),
    ...(fields.transport === undefined ? {} : { transport: fields.transport }),
  };
  writeFileSync(request.recordPath, `${JSON.stringify(response, null, 2)}\n`);
}

function configError(request: AdapterRequest, field: string, message: string): void {
  writeResponse(request, {
    outcome: "error",
    reason: `misconfiguration at config.${field}: ${message}`,
  });
}

async function observeOnce(request: AdapterRequest): Promise<void> {
  const config = request.config;
  if (typeof config?.url !== "string" || config.url === "") {
    configError(request, "url", "a request URL is required");
    return;
  }
  if (typeof config.observe?.statusPointer !== "string") {
    configError(request, "observe.statusPointer", "a status pointer is required");
    return;
  }
  if (!("satisfiedValue" in config.observe)) {
    configError(request, "observe.satisfiedValue", "one satisfying value is required");
    return;
  }
  const hasTerminalPointer = typeof config.observe.terminalPointer === "string";
  const hasTerminalValue = "terminalValue" in config.observe;
  if (hasTerminalPointer !== hasTerminalValue) {
    configError(
      request,
      "observe.terminalPointer",
      "terminalPointer and terminalValue are declared together or not at all",
    );
    return;
  }

  let body: string;
  let httpStatus: number;
  try {
    const response = await fetch(config.url, {
      method: config.method ?? "GET",
    });
    httpStatus = response.status;
    body = await response.text();
  } catch (error) {
    writeResponse(request, {
      outcome: "error",
      reason: `request to ${config.url} could not be completed: ${String((error as Error).message)}`,
    });
    return;
  }
  if (httpStatus < 200 || httpStatus > 299) {
    // Unreachable-in-substance: unauthenticated (401), forbidden, missing,
    // server error. No verdict was reached; never pending (M2-C-3).
    writeResponse(request, {
      outcome: "error",
      reason: `HTTP ${String(httpStatus)} from ${config.url}; no verdict can be read from a non-success transport status`,
      transport: { httpStatus },
    });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    writeResponse(request, {
      outcome: "error",
      reason: `response body from ${config.url} does not parse as JSON: ${(error as Error).message}`,
      transport: { httpStatus },
    });
    return;
  }

  // Locate, when configured: find the subject's own release object.
  let target: unknown = parsed;
  let resolved: Record<string, unknown> = { kind: "endpoint", id: config.url };
  if (config.locate !== undefined) {
    const locate = config.locate;
    if (typeof locate.listPointer !== "string" || typeof locate.idPointer !== "string" || !Array.isArray(locate.match) || locate.match.length === 0) {
      configError(
        request,
        "locate",
        "listPointer, idPointer and a non-empty match list are required",
      );
      return;
    }
    const list = resolvePointer(parsed, locate.listPointer);
    if (!list.found || !Array.isArray(list.value)) {
      writeResponse(request, {
        outcome: "error",
        reason: `no array at locate.listPointer ${JSON.stringify(locate.listPointer)} in the response from ${config.url}`,
        transport: { httpStatus },
      });
      return;
    }
    const matches = list.value.filter((item) =>
      locate.match.every((rule) => {
        const value = resolvePointer(item, rule.pointer);
        if (!value.found) {
          return false;
        }
        if (rule.subjectField !== undefined) {
          return jsonEqual(value.value, request.subject[rule.subjectField]);
        }
        return jsonEqual(value.value, rule.equals);
      }),
    );
    if (matches.length === 0) {
      writeResponse(request, {
        outcome: "absent",
        reason:
          `no release object matches the subject in the listing from ${config.url} ` +
          `(${String(list.value.length)} object(s) examined against ${String(locate.match.length)} match rule(s))`,
        observation: {
          raw: { objectsExamined: list.value.length },
          detail: "no release object for subject",
        },
        transport: { httpStatus },
      });
      return;
    }
    target = matches[0];
    const id = resolvePointer(target, locate.idPointer);
    if (!id.found || typeof id.value !== "string") {
      writeResponse(request, {
        outcome: "error",
        reason: `located object has no string value at locate.idPointer ${JSON.stringify(locate.idPointer)}`,
        transport: { httpStatus },
      });
      return;
    }
    resolved = { kind: locate.kind ?? "release-object", id: id.value };
    if (locate.createdAtPointer !== undefined) {
      const created = resolvePointer(target, locate.createdAtPointer);
      if (created.found) {
        resolved["createdAt"] = created.value;
      }
    }
    if (matches.length > 1) {
      resolved["matchCount"] = matches.length;
    }
  }

  // Observe. One satisfying value; verbatim recording of everything else.
  const status = resolvePointer(target, config.observe.statusPointer);
  const observedRaw: Record<string, unknown> = {};
  observedRaw[config.observe.statusPointer] = status.found
    ? status.value
    : "(no value)";
  let terminal = false;
  if (hasTerminalPointer) {
    const terminalObserved = resolvePointer(
      target,
      config.observe.terminalPointer as string,
    );
    observedRaw[config.observe.terminalPointer as string] = terminalObserved.found
      ? terminalObserved.value
      : "(no value)";
    terminal =
      terminalObserved.found &&
      jsonEqual(terminalObserved.value, config.observe.terminalValue);
  }
  const satisfied =
    status.found && jsonEqual(status.value, config.observe.satisfiedValue);
  const detail =
    `${config.observe.statusPointer} = ${display(status.found ? status.value : undefined)}` +
    (hasTerminalPointer
      ? `, ${config.observe.terminalPointer as string} = ${display(observedRaw[config.observe.terminalPointer as string])}`
      : "");

  if (satisfied) {
    writeResponse(request, {
      outcome: "satisfied",
      resolved,
      observation: { raw: observedRaw, detail },
      transport: { httpStatus },
    });
    return;
  }
  if (hasTerminalPointer && terminal) {
    // The platform's state machine is finished and the satisfying value is
    // not there: a terminal non-success, named verbatim, never enumerated.
    writeResponse(request, {
      outcome: "failed",
      resolved,
      reason:
        `terminal state reached with a non-satisfying value: ${detail} ` +
        `(satisfying value is ${display(config.observe.satisfiedValue)})`,
      observation: { raw: observedRaw, detail },
      transport: { httpStatus },
    });
    return;
  }
  writeResponse(request, {
    outcome: "pending",
    resolved,
    observation: { raw: observedRaw, detail },
    transport: { httpStatus },
  });
}

async function main(): Promise<void> {
  const requestPath = process.argv[2];
  if (requestPath === undefined) {
    process.stderr.write(`usage: node src/gates/adapters/http-json.ts <request-file>\n`);
    process.exitCode = 64;
    return;
  }
  const read = readRegularFileIfPresent(requestPath);
  if (read.kind !== "read") {
    process.stderr.write(
      `${ADAPTER_NAME}: request file ${requestPath} ${read.kind === "absent" ? "does not exist" : `refused: ${read.reason}`}\n`,
    );
    process.exitCode = 1;
    return;
  }
  let request: AdapterRequest;
  try {
    request = JSON.parse(read.body) as AdapterRequest;
  } catch (error) {
    process.stderr.write(
      `${ADAPTER_NAME}: request file does not parse as JSON: ${(error as Error).message}\n`,
    );
    process.exitCode = 1;
    return;
  }
  await observeOnce(request);
}

function isMain(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) {
    return false;
  }
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  await main();
}
