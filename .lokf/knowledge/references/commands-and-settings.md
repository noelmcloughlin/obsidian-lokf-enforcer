---
type: Reference
id: https://lokf-enforcer.example/knowledge/references/commands-and-settings
title: Commands and Settings
description: The plugin's four commands, status-bar behavior, and settings-tab groups.
resource: README.md
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-09T00:00:00Z"
---

# Commands

| id | name |
|---|---|
| `validate-vault` | Validate vault (full LOKF report) |
| `validate-active` | Validate active note |
| `scaffold-root-header` | Insert semantic header template into root index.md |
| `check-sibling-plugin` | Re-check for an installed OKF validator |

Clicking the status-bar item validates the active note, or runs a vault scan
if none is open.

# Settings groups

Sibling plugin, Type vocabulary, Type-specific fields, Semantic header and
base IRI, Relationships, Scope and performance - see `src/settings.ts`.
