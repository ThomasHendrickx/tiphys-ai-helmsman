/**
 * `tiphys tuition add|list|index` (kernel plan M3, M3-P8 steps 2 and 6;
 * R-091).
 *
 *   add --file <entry> [--into <dir>]   validate an entry and file it
 *   list [--kernel-relevant] [--dir <d>] one line per entry
 *   index [--out <f>] [--check] [--dir <d>]  project the mechanism index
 *
 * PROMOTION IS NOT A SUBCOMMAND, and that is a decision rather than an
 * omission. R-091 says kernel-relevant tuition ships upstream as a kernel pull
 * request; the kernel never opens pull requests, so promotion is a documented
 * orchestrator procedure (M3-P9's `AGENTS.md`) and building a promoter that M3
 * would use once is the M1-P3 mistake.
 *
 * `add` WRITES WITH AN EXCLUSIVE CREATE, so a second entry claiming an id that
 * already exists fails loudly and names the file rather than overwriting a
 * record. A `T-nnn` id is never renumbered and never reused after retirement,
 * which makes an overwrite a silent loss of exactly the artifact this feed
 * exists to keep.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { EX_USAGE } from "../cli.ts";
import { refuseOpenForWrite } from "../task.ts";
import { decodeDocument, readOperatorPath } from "../validate.ts";
import {
  MECHANISM_INDEX_FILE,
  driftLines,
  listEntryFiles,
  loadEntry,
  projectIndex,
  renderIndex,
} from "../tuition.ts";
import type { TuitionEntry } from "../tuition.ts";

const USAGE =
  "usage: tiphys tuition add --file <entry> [--into <dir>] | " +
  "tiphys tuition list [--kernel-relevant] [--dir <dir>] | " +
  "tiphys tuition index [--out <file>] [--check] [--dir <dir>]";

interface Options {
  file?: string;
  into?: string;
  dir?: string;
  out?: string;
  check: boolean;
  kernelRelevant: boolean;
}

function parseArgs(argv: string[]): { options?: Options; usageError?: string } {
  const options: Options = { check: false, kernelRelevant: false };
  const valued = new Map<string, keyof Options>([
    ["--file", "file"],
    ["--into", "into"],
    ["--dir", "dir"],
    ["--out", "out"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (argument === "--kernel-relevant") {
      options.kernelRelevant = true;
      continue;
    }
    const field = valued.get(argument);
    if (field === undefined) {
      return { usageError: `unknown option ${argument}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${argument} requires a value` };
    }
    (options as unknown as Record<string, unknown>)[field] = value;
    index += 1;
  }
  return { options };
}

/** The feed directory a subcommand works in: `--dir`, else `<cwd>/tuition`. */
function feedDirectory(options: Options): string {
  return options.dir ?? join(process.cwd(), "tuition");
}

/** Load every entry in the feed, reporting the first that does not validate. */
function loadFeed(
  directory: string,
): { ok: true; entries: TuitionEntry[] } | { ok: false } {
  const listing = listEntryFiles(directory);
  if (!listing.ok) {
    process.stderr.write(`tiphys tuition: ${listing.reason}\n`);
    return { ok: false };
  }
  const entries: TuitionEntry[] = [];
  let failed = false;
  for (const path of listing.paths) {
    const loaded = loadEntry(path);
    if (!loaded.ok) {
      process.stderr.write(`tiphys tuition: ${loaded.reason}\n`);
      for (const line of loaded.diagnostics) {
        process.stdout.write(`${line}\n`);
      }
      failed = true;
      continue;
    }
    entries.push(loaded.entry);
  }
  return failed ? { ok: false } : { ok: true, entries };
}

function cmdAdd(options: Options): number {
  if (options.file === undefined) {
    process.stderr.write(`tiphys tuition: --file is required\n${USAGE}\n`);
    return EX_USAGE;
  }
  /* VALIDATE FIRST, WRITE SECOND. An invalid entry must leave the feed
     directory byte-identical, which is criterion 7's own test. */
  const loaded = loadEntry(options.file);
  if (!loaded.ok) {
    process.stderr.write(`tiphys tuition: ${loaded.reason}\n`);
    for (const line of loaded.diagnostics) {
      process.stdout.write(`${line}\n`);
    }
    return 1;
  }
  const directory = options.into ?? join(process.cwd(), "tuition");
  const target = join(directory, `${loaded.entry.id}.yaml`);
  const refusal = refuseOpenForWrite(target);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys tuition: ${refusal}\n`);
    return 1;
  }
  try {
    mkdirSync(directory, { recursive: true });
    /* EXCLUSIVE CREATE: an id already in the feed is a loud refusal, never an
       overwrite. Ids are never reused, so the collision is the fault. */
    writeFileSync(target, loaded.body, { flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    process.stderr.write(
      code === "EEXIST"
        ? `tiphys tuition: ${target} already exists, and a tuition id is never reused\n`
        : `tiphys tuition: ${target} could not be written: ${String(error)}\n`,
    );
    return 1;
  }
  process.stdout.write(`added ${loaded.entry.id} to ${target}\n`);
  return 0;
}

function cmdList(options: Options): number {
  const feed = loadFeed(feedDirectory(options));
  if (!feed.ok) {
    return 1;
  }
  for (const entry of feed.entries) {
    if (options.kernelRelevant && !entry["kernel-relevant"]) {
      continue;
    }
    const targets = entry["structural-consequence"]?.length ?? 0;
    process.stdout.write(
      `${entry.id} ${entry.date} targets=${String(targets)}\n`,
    );
  }
  return 0;
}

function cmdIndex(options: Options): number {
  const directory = feedDirectory(options);
  const feed = loadFeed(directory);
  if (!feed.ok) {
    return 1;
  }
  const projection = projectIndex(feed.entries);
  if (!projection.ok) {
    process.stderr.write(`tiphys tuition: ${projection.reason}\n`);
    return 1;
  }
  const rendered = renderIndex(projection.rows);
  const out = options.out ?? join(directory, MECHANISM_INDEX_FILE);

  if (options.check) {
    const read = readOperatorPath(out);
    if (!read.ok) {
      process.stderr.write(`tiphys tuition: ${read.reason}\n`);
      return 1;
    }
    const decoded = decodeDocument(read.body, out);
    if (!decoded.ok) {
      process.stderr.write(`tiphys tuition: ${decoded.reason}\n`);
      return 1;
    }
    const problems = driftLines(decoded.value, projection.rows);
    for (const problem of problems) {
      process.stdout.write(`DRIFT ${problem}\n`);
    }
    if (problems.length > 0) {
      process.stderr.write(
        `tiphys tuition: ${basename(out)} is not the projection of the feed in ${directory}\n`,
      );
      return 1;
    }
    /* THE BYTE COMPARISON IS SEPARATE AND SECOND. The structural diff above
       names WHICH mechanism drifted, which a byte comparison cannot; this
       catches a hand edit that changed nothing a reader of the decoded
       document would see (a reordering, a rewrap, an added comment) and says
       so in those words rather than claiming a rule changed. */
    if (read.body !== rendered) {
      process.stdout.write(
        `DRIFT ${out} decodes to the projection and its bytes differ from it, so it has been hand-edited\n`,
      );
      process.stderr.write(
        `tiphys tuition: ${basename(out)} is generated; regenerate it with tiphys tuition index\n`,
      );
      return 1;
    }
    process.stdout.write(
      `${String(projection.rows.length)} mechanism(s) projected from ${String(feed.entries.length)} entr(ies); the committed index matches\n`,
    );
    return 0;
  }

  const refusal = refuseOpenForWrite(out);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys tuition: ${refusal}\n`);
    return 1;
  }
  try {
    writeFileSync(out, rendered);
  } catch (error) {
    process.stderr.write(
      `tiphys tuition: ${out} could not be written: ${String(error)}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `wrote ${String(projection.rows.length)} mechanism(s) from ${String(feed.entries.length)} entr(ies) to ${out}\n`,
  );
  return 0;
}

export function cmdTuition(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  const parsed = parseArgs(rest);
  if (parsed.options === undefined) {
    process.stderr.write(
      `tiphys tuition: ${parsed.usageError ?? "usage error"}\n${USAGE}\n`,
    );
    return EX_USAGE;
  }
  if (subcommand === "add") {
    return cmdAdd(parsed.options);
  }
  if (subcommand === "list") {
    return cmdList(parsed.options);
  }
  if (subcommand === "index") {
    return cmdIndex(parsed.options);
  }
  process.stderr.write(
    `tiphys tuition: ${subcommand === undefined ? "a subcommand is required" : `unknown subcommand ${subcommand}`}\n${USAGE}\n`,
  );
  return EX_USAGE;
}
