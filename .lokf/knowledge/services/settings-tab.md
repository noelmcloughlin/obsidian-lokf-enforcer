---
type: Service
id: https://lokf-registrar.example/knowledge/services/settings-tab
title: Settings Tab
description: Declarative settings tab (Obsidian 1.13.0 getSettingDefinitions API) for LOKF Registrar's configuration.
resource: src/settings.ts
isPartOf:
  - https://lokf-registrar.example/knowledge/services/lokf-registrar-plugin
about:
  - https://lokf-registrar.example/knowledge/references/commands-and-settings
generated:
  by: process:lokf-librarian
  at: "2026-09-12T21:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-12T21:00:00Z"
---

# Overview

`LokfSettingTab` returns declarative `SettingDefinitionItem` groups from
`getSettingDefinitions()` rather than building DOM in `display()` - the
imperative form is deprecated since Obsidian 1.13.0 and excluded from
settings search, which is why `manifest.json` sets `minAppVersion` to
`1.13.0`. Comma-separated list settings (known types, genre values, known
predicates, authority denylist, placeholder domains, excluded folders) are
joined/split in `getControlValue`/`setControlValue`, and persistence routes
through the plugin's own `saveSettings()` so settings are written from one
place. *Bundle root folders* no longer refuses a dot-folder entry: it is
saved, and a `Notice` warns if Obsidian's index does not list that folder
today (a plugin such as Hidden Folders Access can expose one); left empty, a
top-level `knowledge_bundle/` is detected on its own - and with neither a
header nor a `knowledge_bundle/` folder, the vault has no bundle at all
(status bar `LOKF: no bundle`), unless *Scope & performance*'s break-glass
**Treat the vault root as the bundle** toggle (`treatVaultRootAsBundle`, off
by default and "not recommended" in its own description) is on, which reads
a headerless whole vault as one bundle anyway without overriding a detected
`knowledge_bundle/` folder. The tab's groups are: This device, In-editor
diagnostics, Type vocabulary, Type-specific fields, Semantic header &
base_iri, Relationships, OKF v0.2 base layer, Trust & lifecycle, Rule
severity, Field aliasing, and Scope & performance. There is no group for any
other plugin: the former "Alternative OKF validator" group (a deep link into
the community-plugin browser plus a one-time-notice toggle) was removed on
2026-09-12.
