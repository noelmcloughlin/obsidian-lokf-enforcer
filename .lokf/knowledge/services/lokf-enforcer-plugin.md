---
type: Service
id: https://lokf-enforcer.example/knowledge/services/lokf-enforcer-plugin
title: LOKF Enforcer Plugin
description: Obsidian plugin lifecycle - commands, status bar, vault-wide scanning, and OKF-validator sibling detection.
documentation: https://github.com/noelmcloughlin/obsidian-lokf-enforcer#readme
resource: src/main.ts
dependsOn:
  - https://lokf-enforcer.example/knowledge/services/validator-engine
  - https://lokf-enforcer.example/knowledge/services/report-view
  - https://lokf-enforcer.example/knowledge/services/settings-tab
about:
  - https://lokf-enforcer.example/knowledge/references/commands-and-settings
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-09T00:00:00Z"
---

# Overview

**LOKF Enforcer Plugin** (`src/main.ts`) is the plugin's lifecycle shell: it
registers four commands (`validate-vault`, `validate-active`,
`scaffold-root-header`, `check-sibling-plugin`), a clickable status-bar
indicator (`LOKF ✓` / `LOKF ⚠ N` / `LOKF ✖ N`), and the collapsible side-panel
report view.

It caches the bundle-root `base_iri` (read once per scan from `index.md`,
invalidated on `create`/`modify`/`delete`/`rename` of that one file) so
opening notes doesn't re-read the root on every keystroke, and debounces
file-open validation by 150ms so arrowing through a file list doesn't parse a
note per keystroke.

It detects an installed OKF v0.2 validator (matched by the sibling plugin id
`okf-enforcer`) via Obsidian's undocumented `app.plugins` API, duck-typed with
a try/catch so any shape mismatch degrades to "not detected" rather than
throwing, and shows a one-time notice recommending one if absent - this
plugin only checks the LOKF semantic layer (see
[Why LOKF Enforcer](../explanation/why-lokf-enforcer.md)).
