---
type: Service
id: https://lokf-enforcer.example/knowledge/services/settings-tab
title: Settings Tab
description: Declarative settings tab (Obsidian 1.13.0 getSettingDefinitions API) for LOKF Enforcer's configuration.
resource: src/settings.ts
isPartOf:
  - https://lokf-enforcer.example/knowledge/services/lokf-enforcer-plugin
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

`LokfSettingTab` returns declarative `SettingDefinitionItem` groups from
`getSettingDefinitions()` rather than building DOM in `display()` - the
imperative form is deprecated since Obsidian 1.13.0 and excluded from
settings search, which is why `manifest.json` sets `minAppVersion` to
`1.13.0`. Comma-separated list settings (known types, genre values, known
predicates, authority denylist, placeholder domains, excluded folders) are
joined/split in `getControlValue`/`setControlValue`, and persistence routes
through the plugin's own `saveSettings()` so the sibling-notice flag isn't
dropped on a settings change.
