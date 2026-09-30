/*
 * M6-P5: stands in for the harness CLI. It reads the brief from stdin,
 * writes the verdict the prompt names (copied from the settings' `verdict`),
 * prints the stream in `stream` to stdout, records what it saw in `echo`
 * (including the commit it stands on, the NAMES of its environment, its HOME,
 * since the kernel removes the worktree afterwards, the arguments the kernel
 * passed the executor after the prompt, and what `node_modules` in its working
 * directory holds), and exits with
 * `exit`. The settings are the JSON in its third argument (stub-executor.mjs).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [model, prompt, settingsJson] = process.argv.slice(2);
const settings = JSON.parse(settingsJson ?? "{}");
const stdin = readFileSync(0, "utf8");
if (settings.echo) {
  writeFileSync(
    settings.echo,
    JSON.stringify({
      cwd: process.cwd(),
      model,
      prompt,
      stdin,
      head: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() ?? null,
      envNames: Object.keys(process.env).sort(),
      home: process.env["HOME"] ?? null,
      extra: settings.extra ?? null,
      nodeModules: existsSync("node_modules") ? readdirSync("node_modules").sort() : null,
    }),
  );
}
const named = /Write your verdict to (\S+), relative to the current directory\./.exec(prompt ?? "");
if (named !== null && settings.verdict) {
  mkdirSync(dirname(named[1]), { recursive: true });
  writeFileSync(named[1], readFileSync(settings.verdict));
}
process.stdout.write(readFileSync(settings.stream ?? ""));
process.exitCode = Number(settings.exit ?? "0");
