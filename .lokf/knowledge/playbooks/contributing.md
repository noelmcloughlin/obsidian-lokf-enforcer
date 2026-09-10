---
type: Playbook
id: https://lokf-enforcer.example/knowledge/playbooks/contributing
title: Contributing
description: Local dev setup, layout, and pre-PR checklist for LOKF Enforcer.
resource: CONTRIBUTING.md
generated:
  by: process:lokf-librarian
  at: "2026-09-11T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-11T00:00:00Z"
---

# Overview

`npm install && npm run dev` (esbuild watch mode); `npm run build`
type-checks (`tsc -noEmit`) then bundles; `npm run lint` runs
`eslint-plugin-obsidianmd`; `npm run smoke-test` runs the pure `validator.ts`
fixtures under plain Node - no Obsidian install needed for that one.

`main.js` is git-ignored and built by the release workflow, not committed -
so a fresh clone/checkout has no `main.js` at all. Obsidian shows a bare
"Failed to load plugin" with nothing in the console when the entry file is
missing (the loader has no `require`-able target and fails silently rather
than naming the cause), which is why the playbook now tells contributors to
run `npm install && npm run dev` (or `npm run build` for a one-off) before
the first reload, and again after any `git pull` that touches `src/`.

`validator.ts` must stay import-free, and free of anything an installed OKF
v0.2 validator already checks (required `type`, provenance/trust/lifecycle,
Attested Computation, `index.md`/`log.md` structure).
