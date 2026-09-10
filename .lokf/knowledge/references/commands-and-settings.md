---
type: Reference
id: https://lokf-enforcer.example/knowledge/references/commands-and-settings
title: Commands and Settings
description: The plugin's three commands, status-bar behavior, and settings-tab groups.
resource: README.md
generated:
  by: process:lokf-librarian
  at: "2026-09-11T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-11T00:00:00Z"
---

# Commands

| id | name |
|---|---|
| `validate-vault` | Validate vault (full LOKF report) |
| `validate-active` | Validate active note |
| `scaffold-root-header` | Insert semantic header template into root index.md |

There is no `check-sibling-plugin` command: the plugin cannot detect whether
an OKF validator is installed (see
[LOKF Enforcer plugin](../services/lokf-enforcer-plugin.md)), so there is
nothing for a command to re-check.

Clicking the status-bar item validates the active note, or runs a vault scan
if none is open.

# Settings groups

Sibling plugin, Type vocabulary, Type-specific fields, Semantic header and
base IRI, Relationships, Scope and performance - see `src/settings.ts`.
