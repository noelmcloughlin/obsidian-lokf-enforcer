---
type: Reference
id: https://lokf-enforcer.example/knowledge/references/obsidian-plugin-guidelines
title: Obsidian Plugin Guidelines
description: Obsidian's official developer guidelines for community plugins - UI conventions, prohibited patterns, and release requirements.
resource: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
---

# Overview

Enforced in this repo via `eslint-plugin-obsidianmd` (`eslint.config.mts`) and
cited directly in `PUBLISHING.md`'s rejection-reasons list: no
`innerHTML`/inline styles, no HTML heading elements in a settings tab
(`new Setting(...).setHeading()` instead), no detaching leaves in `onunload`
(this plugin has none - Obsidian cleans up views, commands, and
`registerEvent` handlers on its own), sentence-case UI text, and no plugin id
embedded inside command ids.
