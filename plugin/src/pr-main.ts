#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { runPr } from "./pr.ts";

/**
 * THE ONLY FILE IN THE PULL-REQUEST CAPABILITY THAT OWNS A CHILD PROCESS
 * (kernel plan M4, M4-P24 criterion 5).
 *
 * `plugin/src/pr.ts` is pure so that every refusal arm can be exercised without
 * a `gh` on PATH. This file is the wiring, and it is kept to the wiring: one
 * executor, one io pair, one exit code passed through. Nothing here decides
 * anything, so nothing here can decide it differently from the module the
 * witness mutates.
 */

process.exitCode = runPr(process.argv.slice(2), {
  env: process.env,
  io: {
    stderr: (line: string) => {
      process.stderr.write(`${line}\n`);
    },
    stdout: (line: string) => {
      process.stdout.write(`${line}\n`);
    },
  },
  exec: (program, args, env) => {
    const result = spawnSync(program, args, { env, stdio: "inherit" });
    return result.error === undefined
      ? { status: result.status }
      : { status: null, reason: String(result.error) };
  },
});
