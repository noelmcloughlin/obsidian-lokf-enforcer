---
type: Reference
id: https://lokf-registrar.example/knowledge/references/commands-and-settings
title: Commands and Settings
description: The plugin's commands, status-bar behavior, and settings-tab groups, as README.md documents them.
resource: README.md
generated:
  by: process:lokf-librarian
  at: "2026-09-12T15:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-12T15:00:00Z"
---

# Commands

| id | name |
| --- | --- |
| `validate-vault` | Validate vault (full LOKF report) |
| `validate-active` | Validate active note |
| `scaffold-root-header` | Insert semantic header template into root index.md |
| `find-concept` | Find a concept (by name, type, or relations) |
| `find-orphan` | Find an orphan concept (nothing links to it) |
| `lookup-field` | Look up a LOKF field |
| `goto-finding` | Go to a finding (search all findings) |
| `next-finding` / `previous-finding` | Go to next / previous finding |
| `fix-safe-active` / `fix-safe-vault` | Fix safe issues in the active note / across the vault |
| `promote-links` | Promote body links to typed relations… |
| `affordances-active` / `affordances-vault` / `diataxis-map` | Add Obsidian affordances to the active note / across the vault / Generate the Diátaxis map (`diataxis.md`, written as a `Document` with a minted `id` and `generated.by: lokf-registrar/<version>` so `lokf validate` accepts it) |

(Command ids other than the first three are as named in `src/main.ts`; the
README documents them by display name. There is no command that checks for,
opens, or recommends any other plugin.)

Clicking the status-bar item validates the active note, or runs a vault scan
if none is open.

# Settings groups

This device, In-editor diagnostics, Type vocabulary, Type-specific fields,
Semantic header & base_iri, Relationships, OKF v0.2 base layer, Trust &
lifecycle, Rule severity, Field aliasing, Scope & performance - see
`src/settings.ts` and [Settings tab](../services/settings-tab.md).
