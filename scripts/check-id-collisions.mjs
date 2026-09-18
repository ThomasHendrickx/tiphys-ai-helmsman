#!/usr/bin/env node
// Report identifier collisions across the schemes CLAUDE.md declares stable,
// and print the next free id in each.
//
// WHY THIS EXISTS. The rule "a retired id is never reused, in ANY of these
// schemes" was written after the DR-0019 collision and it named check commands
// for the DR scheme only. Two more collisions followed in the T scheme, because
// an allocator who finds no command for their scheme allocates from memory, and
// this project has recorded repeatedly that memory does not survive a busy
// session. Recorded as T-039.
//
// TWO DISTINCTIONS THE FIRST DRAFT OF THIS SCRIPT GOT WRONG, both of which made
// it report 16 collisions where there were 2. A check that cries wolf is one
// nobody runs twice, so they are written down rather than just fixed.
//
//   1. A COLLISION IS IN THE CURRENT TREE, NOT IN HISTORY. An id that carried a
//      different subject on a branch and was renumbered BEFORE landing is the
//      rule working, not a breach. So collisions are read from `git ls-files`.
//   2. `tuition/T-nnn.yaml` IS THE PROJECTION OF `delivery/tuition/T-nnn-*.md`,
//      not a second entry. The same id in both is expected and required. Only
//      two distinct subjects inside one AUTHORING directory collide.
//
// The TAKEN set is the opposite: it reads all of history, because deletion does
// not free an id. The retirement keeps being cited by the documents that
// discuss it, which is exactly how DR-0019 was paid for twice.
//
// Exit 0 when no scheme has a live collision. Exit 1 on a collision, naming
// every file. Exit 2 on a usage or git error.

import { execFileSync } from "node:child_process"
import { basename } from "node:path"

const SCHEMES = [
  {
    label: "tuition",
    prefix: "T",
    width: 3,
    authoring: ["delivery/tuition"],
    projections: ["tuition"],
    re: /^T-(\d+)/,
  },
  {
    label: "owner decision records",
    prefix: "DR",
    width: 4,
    authoring: ["delivery/decisions"],
    projections: [],
    re: /^DR-(\d+)/,
  },
]

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" })
  } catch (err) {
    process.stderr.write(`check-id-collisions: git ${args.join(" ")} failed: ${err.message}\n`)
    process.exit(2)
  }
}

function paths(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function parse(scheme, path) {
  const match = scheme.re.exec(basename(path))
  if (!match) return null
  const id = `${scheme.prefix}-${match[1]}`
  const subject = basename(path).replace(scheme.re, "").replace(/\.[a-z]+$/, "").replace(/^-/, "")
  return { id, subject }
}

let collisions = 0
for (const scheme of SCHEMES) {
  const dirs = [...scheme.authoring, ...scheme.projections]

  // TAKEN: every id the scheme has ever carried, deleted ones included.
  const taken = new Set()
  for (const path of paths(git(["log", "--all", "--pretty=format:", "--name-only", "--", ...dirs]))) {
    const row = parse(scheme, path)
    if (row) taken.add(Number(row.id.split("-")[1]))
  }

  // LIVE: what the current tree carries, per authoring directory.
  const live = new Map()
  for (const path of paths(git(["ls-files", "--", ...scheme.authoring]))) {
    const row = parse(scheme, path)
    if (!row) continue
    taken.add(Number(row.id.split("-")[1]))
    if (!live.has(row.id)) live.set(row.id, new Map())
    live.get(row.id).set(row.subject, path)
  }

  for (const [id, subjects] of [...live].sort()) {
    if (subjects.size < 2) continue
    collisions += 1
    process.stdout.write(`COLLISION ${id} (${scheme.label}) carries ${subjects.size} distinct subjects:\n`)
    for (const path of [...subjects.values()].sort()) process.stdout.write(`  ${path}\n`)
  }

  const highest = taken.size ? Math.max(...taken) : 0
  process.stdout.write(
    `${scheme.label}: ${taken.size} id(s) taken across all history, ` +
      `highest ${scheme.prefix}-${String(highest).padStart(scheme.width, "0")}, ` +
      `next free ${scheme.prefix}-${String(highest + 1).padStart(scheme.width, "0")}\n`,
  )
}

if (collisions > 0) {
  process.stdout.write(`check-id-collisions: ${collisions} collision(s)\n`)
  process.exit(1)
}
process.stdout.write("check-id-collisions: no collisions\n")
