---
type: Service
id: https://lokf-registrar.example/knowledge/services/lokf-registrar-plugin
title: LOKF Registrar Plugin
description: Obsidian plugin lifecycle - commands, status bar, vault-wide scanning, bundle-root resolution, and the read-only API the sibling LOKF Curator may read.
documentation: https://github.com/noelmcloughlin/obsidian-lokf-registrar#readme
resource: src/main.ts
dependsOn:
  - https://lokf-registrar.example/knowledge/services/validator-engine
  - https://lokf-registrar.example/knowledge/services/report-view
  - https://lokf-registrar.example/knowledge/services/settings-tab
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

**LOKF Registrar Plugin** (`src/main.ts`) is the plugin's lifecycle shell: it
registers fifteen commands - `validate-vault`, `validate-active`,
`scaffold-root-header`, plus find/fix/affordance/navigation commands (see
[Commands and settings](../references/commands-and-settings.md) for the
full, current id list) - a clickable status-bar indicator (`LOKF ✓` /
`LOKF ⚠ N` / `LOKF ✖ N` / `LOKF: no bundle`), and the collapsible side-panel
report view.

Running **Validate active note** (the command, or a status-bar click) on a
note excluded by settings or outside every configured bundle root now says
so via a `Notice`, instead of clearing the status bar to `LOKF: —` with no
explanation - every other outcome (clean, unreadable, N findings) already
produced one. The debounced file-open path that fires on every navigation
stays silent by design; only an explicit ask gets told why nothing happened.

It caches the bundle-root `base_iri` (read once per scan from `index.md`,
invalidated on `create`/`modify`/`delete`/`rename` of that one file) so
opening notes doesn't re-read the root on every keystroke, and debounces
file-open validation by 150ms so arrowing through a file list doesn't parse a
note per keystroke.

The plugin neither detects nor recommends any other plugin. An earlier
design carried a commented-out `detectOkfValidator` (reading Obsidian's
undocumented `app.plugins`), a one-time notice recommending a separate OKF
v0.2 validator, and a settings action deep-linking to one; all three were
removed on 2026-09-12 once the OKF v0.2 base layer was checked here directly
(see [Why LOKF Registrar](../explanation/why-lokf-registrar.md)). The one
plugin it names in code is its sibling **LOKF Curator**, as a possible reader
of the read-only `api` surface (`getReport`, `validatePath`, `onValidated`) -
offered, never required, with no dependency in either direction.

# Bundle roots, the no-bundle state, and the Diátaxis map (2026-09-12)

With *Bundle root folders* empty, `bundleRoots()` falls back to
`implicitRoots()`, which calls `validator.ts`'s pure `implicitBundleRoots`
(renamed from the earlier `autoBundleRoot`, whose two-argument shape only
distinguished "whole vault" from "detected `knowledge_bundle/`"): a root
`index.md` carrying a LOKF header makes the whole vault the bundle
(`[""]`); otherwise a top-level `knowledge_bundle/index.md` makes that
folder the bundle (`[VISIBLE_BUNDLE_FOLDER]`); otherwise, with the
break-glass *Treat the vault root as the bundle* setting
(`treatVaultRootAsBundle`, off by default) also off, the function returns an
**empty list** - *no bundle at all*, not the old whole-vault fallback.
`hasNoBundle()` is `bundleRoots().length === 0`; in that state nothing is
scanned or warned about, the status bar reads `LOKF: no bundle`, and every
command that would otherwise act shows one explanatory `Notice`
(`noBundleNotice()`) instead. Turning the break-glass setting on reads a
headerless whole vault as one bundle anyway, but never overrides a detected
`knowledge_bundle/` folder. **Insert the bundle's semantic header**
(`scaffold-root-header`) targets whichever bundle the active note belongs
to; in a vault with no bundle it creates a `knowledge_bundle/` folder and
writes the header into its `index.md`, rather than decorating the vault
root. The scan checks Obsidian's live index before explaining an absent
root, so a dot-folder root a plugin such as Hidden Folders Access exposes is
scanned like any other.
`writeDiataxisMap` now writes `diataxis.md` as a `Document` with a minted
`id` and `generated.by: lokf-registrar/<version>` (`affordances.ts`'s
`DiataxisHeader`), upgrading a headerless map on its next refresh - `lokf
validate` aborts a run on a note with no frontmatter, which the earlier map
triggered. The feature-fit audit that stood here as open questions is
resolved: the map defect fixed; the librarian skill told to leave the
affordance blocks and the map alone; *Promote body links* described in the
README as the hand-authoring aid it is; the dot-folder refusal replaced by
the live check; and the README naming the plugin's writes for what they are.

# Identity (renamed 2026-09-12)

The plugin id is `lokf-registrar` - in `manifest.json`, the community entry,
and the settings folder `.obsidian/plugins/lokf-registrar/`. The read-only
API is reached at `app.plugins.plugins["lokf-registrar"].api`, the
device-local disable switch is stored under `lokf-registrar:disabled-on-device`,
and the Diátaxis map is stamped `generated.by: lokf-registrar/<version>`.
`affordances.ts`'s stamp refresh also recognises `lokf-enforcer/<version>`,
the actor a build before the rename wrote, so such a map is re-stamped rather
than mistaken for someone else's (see
[Why LOKF Registrar](../explanation/why-lokf-registrar.md) for the reasons).
