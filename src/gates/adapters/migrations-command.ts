import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyEntry,
  readRegularFileIfPresent,
  refuseOpenForWrite,
  singleLine,
} from "../../task.ts";
import type { ReleaseSubject } from "../release.ts";

/**
 * THE migrations-command REFERENCE ADAPTER (kernel plan M2, M2-P7 step 5).
 * Entirely local: the repository inventory comes from a declared directory
 * and filename pattern, the applied inventory from a project-declared
 * command whose JSON output is read at project-configured pointers. The
 * kernel never learns the platform's migration vocabulary; this
 * configuration is where it lives.
 *
 * Same subprocess boundary as any third party's adapter, not privileged
 * (investigation section 5.2).
 *
 * THE TWO INVENTORIES ARE NOT SYMMETRIC (plan criterion 8; investigation
 * section 7.3, grounded in a real capture: a Supabase management API
 * returned {"migrations":[]} for two ACTIVE_HEALTHY production projects).
 * A REPOSITORY inventory with zero migrations is not-applicable: the
 * project has nothing to verify. A non-empty repository inventory with an
 * EMPTY applied inventory is the recorded incident exactly ("migrations
 * skipped by a flake while the code deployed anyway") and is reported
 * `pending` (the apply job may still be queued), which the kernel converts
 * to RED at the deadline, never not-applicable.
 *
 * OUTCOME SEMANTICS (design decision D-p7-6 in the phase work history):
 * repository migrations missing from the applied inventory are `pending`
 * naming the missing ids (a queued job may yet apply them; red at the
 * deadline). An applied migration the repository does not have (drift), or
 * an id whose checksum differs where the inventory exposes one, will never
 * become right by waiting: terminal `failed` naming the migration.
 */

interface MigrationsConfig {
  migrationsDir: string;
  pattern: string;
  appliedCommand: string[];
  appliedPointer: string;
  idPointer: string;
  checksumPointer?: string;
}

interface AdapterRequest {
  contractVersion: string;
  verification: string;
  subject: ReleaseSubject;
  config: MigrationsConfig;
  attempt: { number: number; deadline: string };
  recordPath: string;
}

const ADAPTER_NAME = "migrations-command";

/** RFC 6901 JSON pointer resolution, local to this adapter's configuration. */
function resolvePointer(
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

interface ResponseFields {
  outcome: string;
  resolved?: Record<string, unknown>;
  observation?: { raw?: unknown; detail: string };
  reason?: string;
  units?: number;
  precondition?: { id: string; evidence?: string[] };
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
    ...(fields.precondition === undefined ? {} : { precondition: fields.precondition }),
  };
  writeFileSync(request.recordPath, `${JSON.stringify(response, null, 2)}\n`);
}

function configError(request: AdapterRequest, field: string, message: string): void {
  writeResponse(request, {
    outcome: "error",
    reason: `misconfiguration at config.${field}: ${message}`,
  });
}

function observeOnce(request: AdapterRequest): void {
  const config = request.config;
  if (typeof config?.migrationsDir !== "string" || config.migrationsDir === "") {
    configError(request, "migrationsDir", "a repository migrations directory is required");
    return;
  }
  if (typeof config.pattern !== "string" || config.pattern === "") {
    configError(request, "pattern", "a filename pattern is required");
    return;
  }
  if (!Array.isArray(config.appliedCommand) || config.appliedCommand.length === 0) {
    configError(request, "appliedCommand", "an applied-inventory command argv is required");
    return;
  }
  if (typeof config.appliedPointer !== "string") {
    configError(request, "appliedPointer", "a JSON pointer to the applied list is required");
    return;
  }
  if (typeof config.idPointer !== "string") {
    configError(request, "idPointer", "a JSON pointer to each entry's id is required");
    return;
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(config.pattern);
  } catch (error) {
    configError(request, "pattern", `not a valid expression: ${(error as Error).message}`);
    return;
  }

  // REPOSITORY inventory. The directory and its files are paths this
  // adapter did not create: M2-C-6, type established before any open, a
  // non-regular entry is error naming the path and the type, never a block.
  const dirEntry = classifyEntry(config.migrationsDir);
  if (dirEntry.kind === "absent" || dirEntry.kind === "dangling") {
    writeResponse(request, {
      outcome: "not-applicable",
      reason: `repository migrations directory ${config.migrationsDir} does not exist`,
      precondition: {
        id: "repository-migrations-present",
        evidence: [`${config.migrationsDir}: absent`],
      },
    });
    return;
  }
  if (dirEntry.kind === "unexaminable") {
    writeResponse(request, { outcome: "error", reason: dirEntry.reason });
    return;
  }
  if (dirEntry.kind === "regular") {
    writeResponse(request, {
      outcome: "error",
      reason: `${config.migrationsDir} is a regular file, not a directory`,
    });
    return;
  }
  let names: string[];
  try {
    names = readdirSync(config.migrationsDir);
  } catch (error) {
    writeResponse(request, {
      outcome: "error",
      reason: `${config.migrationsDir} could not be listed: ${singleLine(String(error))}`,
    });
    return;
  }
  const matching = names.filter((name) => pattern.test(name)).sort();
  if (matching.length === 0) {
    writeResponse(request, {
      outcome: "not-applicable",
      reason:
        `repository migrations directory ${config.migrationsDir} contains zero ` +
        `migrations matching ${config.pattern}`,
      precondition: {
        id: "repository-migrations-present",
        evidence: [
          `${config.migrationsDir}: ${String(names.length)} entr(ies), 0 matching ${config.pattern}`,
        ],
      },
    });
    return;
  }
  const repository = new Map<string, { file: string; sha256: string }>();
  for (const name of matching) {
    const path = join(config.migrationsDir, name);
    const read = readRegularFileIfPresent(path);
    if (read.kind === "refused") {
      // M2-C-6: a FIFO or other non-regular entry in the migrations
      // directory is error naming the path and the observed type.
      writeResponse(request, { outcome: "error", reason: read.reason });
      return;
    }
    if (read.kind === "absent") {
      writeResponse(request, {
        outcome: "error",
        reason: `${path} vanished between listing and reading`,
      });
      return;
    }
    const match = pattern.exec(name);
    const id = match !== null && match[1] !== undefined ? match[1] : name;
    repository.set(id, {
      file: name,
      sha256: createHash("sha256").update(read.body).digest("hex"),
    });
  }

  // APPLIED inventory: another program's output, parsed only at the
  // project-declared pointers, never pattern-matched as text.
  const child = spawnSync(
    config.appliedCommand[0] as string,
    config.appliedCommand.slice(1),
    { encoding: "utf8" },
  );
  if (child.error !== undefined) {
    writeResponse(request, {
      outcome: "error",
      reason: `applied-inventory command could not be run: ${singleLine(String(child.error))}`,
    });
    return;
  }
  if (child.status !== 0) {
    writeResponse(request, {
      outcome: "error",
      reason:
        `applied-inventory command exited ${String(child.status)}: ` +
        `${singleLine(child.stderr ?? "")}`,
    });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(child.stdout ?? "");
  } catch (error) {
    writeResponse(request, {
      outcome: "error",
      reason: `applied-inventory output does not parse as JSON: ${(error as Error).message}`,
    });
    return;
  }
  const list = resolvePointer(parsed, config.appliedPointer);
  if (!list.found || !Array.isArray(list.value)) {
    writeResponse(request, {
      outcome: "error",
      reason: `no array at appliedPointer ${JSON.stringify(config.appliedPointer)} in the applied-inventory output`,
    });
    return;
  }
  const applied = new Map<string, { checksum?: string; checksumAbsent?: boolean }>();
  for (let index = 0; index < list.value.length; index += 1) {
    const entry: unknown = list.value[index];
    const id = resolvePointer(entry, config.idPointer);
    if (!id.found || (typeof id.value !== "string" && typeof id.value !== "number")) {
      writeResponse(request, {
        outcome: "error",
        reason:
          `applied entry ${String(index)} has no string or number value at ` +
          `idPointer ${JSON.stringify(config.idPointer)}`,
      });
      return;
    }
    const record: { checksum?: string; checksumAbsent?: boolean } = {};
    if (config.checksumPointer !== undefined) {
      // Content verification was requested. A usable checksum is a non-empty
      // string; null, absent, empty or non-string is NOT a usable checksum,
      // and (CR-P7H-2) must not silently reduce this row to an id-only pass.
      const checksum = resolvePointer(entry, config.checksumPointer);
      if (checksum.found && typeof checksum.value === "string" && checksum.value !== "") {
        record.checksum = checksum.value;
      } else {
        record.checksumAbsent = true;
      }
    }
    applied.set(String(id.value), record);
  }

  const repositoryIds = [...repository.keys()];
  const appliedIds = [...applied.keys()];
  const raw = { repository: repositoryIds, applied: appliedIds };

  // Drift: applied migrations the repository does not have. Terminal.
  const drift = appliedIds.filter((id) => !repository.has(id)).sort();
  if (drift.length > 0) {
    writeResponse(request, {
      outcome: "failed",
      resolved: { kind: "applied-migrations", id: appliedIds.join(",") },
      reason:
        `applied inventory contains ${String(drift.length)} migration(s) the ` +
        `repository does not: ${drift.join(", ")} (drift)`,
      observation: { raw, detail: `drift: ${drift.join(", ")}` },
    });
    return;
  }
  // Content drift where both sides expose a checksum. Terminal.
  for (const [id, entry] of repository) {
    const appliedEntry = applied.get(id);
    if (appliedEntry?.checksum !== undefined && appliedEntry.checksum !== entry.sha256) {
      writeResponse(request, {
        outcome: "failed",
        resolved: { kind: "applied-migrations", id: appliedIds.join(",") },
        reason:
          `migration ${id} (${entry.file}) is applied with checksum ` +
          `${appliedEntry.checksum}, repository content sha256 is ${entry.sha256} ` +
          `(content drift)`,
        observation: { raw, detail: `content drift: ${id}` },
      });
      return;
    }
  }
  // CR-P7H-2: content verification was requested (checksumPointer configured)
  // but a MATCHED row (present in both inventories) exposes no usable applied
  // checksum, so the comparison the config asked for could not be made. This
  // is NOT a silent pass on id-match: an unchecked assumption never becomes a
  // green (M2-C-3). It is surfaced as error naming the ids, and observation.raw
  // discloses which rows were checksum-compared versus which could not be.
  // Terminal, and ahead of the missing/pending check, because waiting cannot
  // add a checksum the applied inventory does not expose. Two structurally
  // different members reach this: an applied checksum of null, and an absent
  // checksum key (both set checksumAbsent above).
  if (config.checksumPointer !== undefined) {
    const checksumCompared = repositoryIds
      .filter((id) => applied.get(id)?.checksum !== undefined)
      .sort();
    const checksumAbsent = repositoryIds
      .filter((id) => applied.get(id)?.checksumAbsent === true)
      .sort();
    if (checksumAbsent.length > 0) {
      writeResponse(request, {
        outcome: "error",
        resolved: { kind: "applied-migrations", id: appliedIds.join(",") },
        reason:
          `checksumPointer ${JSON.stringify(config.checksumPointer)} is configured, but ` +
          `${String(checksumAbsent.length)} matched migration(s) expose no applied checksum, ` +
          `so the requested content comparison could not be made: ${checksumAbsent.join(", ")}; ` +
          `an unverifiable row is not a silent pass on id-match (M2-C-3)`,
        observation: {
          raw: { ...raw, checksumCompared, checksumAbsent },
          detail: `checksum requested but absent for: ${checksumAbsent.join(", ")}`,
        },
      });
      return;
    }
  }

  // Missing: repository migrations the applied inventory does not show.
  // Pending, never a terminal red here: the apply job may be queued, and
  // the kernel's deadline is what turns a wait into a red.
  const missing = repositoryIds.filter((id) => !applied.has(id)).sort();
  if (missing.length > 0) {
    writeResponse(request, {
      outcome: "pending",
      resolved: {
        kind: "applied-migrations",
        id: appliedIds.length === 0 ? "(empty applied inventory)" : appliedIds.join(","),
      },
      observation: {
        raw,
        detail: `migrations not applied: ${missing.join(", ")}`,
      },
    });
    return;
  }

  // Every matched row was id-matched, and (when checksumPointer is configured)
  // every matched row also exposed a usable checksum that agreed: an absent
  // one would have been surfaced as error above, so a green here is auditable.
  const satisfiedRaw =
    config.checksumPointer === undefined
      ? raw
      : { ...raw, checksumCompared: repositoryIds };
  writeResponse(request, {
    outcome: "satisfied",
    resolved: { kind: "applied-migrations", id: repositoryIds.join(",") },
    observation: {
      raw: satisfiedRaw,
      detail:
        `${String(repositoryIds.length)} migration(s) applied and matching` +
        (config.checksumPointer === undefined
          ? ""
          : ` (all ${String(repositoryIds.length)} checksum(s) compared and matched)`),
    },
    units: repositoryIds.length,
  });
}

function main(): void {
  const requestPath = process.argv[2];
  if (requestPath === undefined) {
    process.stderr.write(
      `usage: node src/gates/adapters/migrations-command.ts <request-file>\n`,
    );
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
  observeOnce(request);
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
  main();
}
