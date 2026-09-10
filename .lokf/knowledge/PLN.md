# LOKF Enforcer — Release-Readiness + Ecosystem Alignment Plan

Status: implementation described below is **committed** on `main` up to
`d339de0`. Bundle root folders, the sibling-detection removal, and their
tests are **uncommitted** - see "Commit shape". Phase 5 (first release) is
pending the decisions at the end.

## Goal

Prepare `obsidian-lokf-enforcer` for a release and align it with the curated
sibling repo `lokf-agent-skills`. Reference repos: `obsidian-sample-plugin`
(build pattern), `lokf-agent-skills` (curation pattern, checked out at
`../lokf-agent-skills`).

See: https://github.com/obsidianmd/obsidian-sample-plugin.git
See: https://github.com/noelmcloughlin/lokf-agent-skills.git
See: https://raw.githubusercontent.com/nicholsn/lokf/refs/heads/main/lokf.yaml

## Design

**Bundle scope.** A vault validates as one implicit bundle by default (its
root `index.md` is the semantic header). *Settings → Scope and performance →
Bundle root folders* lets a vault instead hold several independent bundles as
sibling project folders - the Obsidian-native pattern of one vault, many
subfolders - each with its own `index.md`, `base_iri`, and minted/checked
ids and relations. A note outside every configured root is not scanned.
`validator.ts` stays free of the concept of "which bundle": it only ever
receives paths already relative to whichever single bundle is being
validated (`normalizeBundleRoots`, `resolveBundleRoot`, `bundleRootIndexPath`,
`toBundlePath`, `toVaultPath` - pure functions, unit-tested under plain Node).
`main.ts` resolves each candidate file to its bundle, caches one `base_iri`
per bundle root (`Map<root, string | null>`), and reports a misconfigured
root (`lokf/io-hidden-root` for a dot-folder, `lokf/io-missing-root` for a
renamed/deleted one) instead of silently scanning nothing. A dot-folder path
(the `.lokf/knowledge` sidecar convention) can never be a bundle root -
Obsidian's file index never exposes one - so the setting rejects such an
entry outright; that bundle shape still works by opening the folder itself
as its own vault.

**Sibling plugin (OKF Enforcer).** LOKF Enforcer checks only the LOKF
semantic layer and depends on nothing else - no other plugin, no skill, no
network access. It offers a shortcut to install OKF Enforcer (opens
`obsidian://show-plugin?id=okf-enforcer`) and a one-time notice recommending
one, both shown unconditionally: there is no supported way to detect whether
a given plugin is already installed (`app.plugins` is undocumented API and a
routine community-review flag), and no attempt is made to install or enable
it automatically - that would need `app.plugins.enablePlugin()` and would
silently switch on third-party code the user never chose, which contradicts
a plugin whose whole pitch is that it vouches for nothing and calls into
nothing.

**Agent skills.** They are repository tooling for this repo's own
`.lokf/knowledge/` bundle, never a plugin dependency - a plugin user needs
none, and a contributor needs at most librarian and curator (scaffolding
only re-generates the tooling; docent only answers questions in an agent).
They are installed, never committed, per their own hygiene note:
`.agents/`, `.claude/`, `skills-lock.json` are git-ignored. CI installs
`lokf-librarian` pinned to `LOKF_SKILLS_REF` (`v0.9.0`) at run time via a
plain `git clone` of the tagged sibling repo; `scripts/fixtures/` holds a
frozen copy of the scaffolding template so `npm run smoke-test` has a golden
fixture that doesn't depend on a live, git-ignored install. No plugin feature
runs a skill - the plugin stays deterministic and offline; that separation
is the trust model both projects share.

**Release flow.** `CONTRIBUTING.md` is the single source of truth: a PR
carries the version bump (`npm version ... --no-git-tag-version`), a bare
tag lands on the merge commit (`.npmrc` sets `tag-version-prefix=""`),
`release.yml` verifies tag == manifest version and opens a draft. The
 bundle's `releasing` playbook defers.

## Upstream `lokf` changes to track (open, unmerged)

- [PR #68](https://github.com/nicholsn/lokf/pull/68) - typed-relation
  integrity check. Overlaps this plugin's `lokf/4-relations` rule and the
  scaffolding `justfile`'s `lokf-check-refs` recipe. After merge: the
  README's "in-editor counterpart to `lokf validate`" claim gets stronger;
  `lokf-check-refs` becomes redundant (a `lokf-agent-skills` change, not
  this repo's).
- [PR #69](https://github.com/nicholsn/lokf/pull/69) - `pattern` validation
  for http/email slots. After merge, diff against this plugin's own
  `base_iri`/`endpoint`/`documentation` checks (`lokf/2-header`,
  `lokf/3-fields`) so the editor and the CLI agree on what's well-formed -
  especially the trailing-slash rule on `base_iri`.
- [PR #67](https://github.com/nicholsn/lokf/pull/67) - `excerpt`/
  `supporting_text` paired with `resource`, for re-verifiable claims. Bundle
  *authoring* provenance - the librarian's concern, not a plugin rule. After
  merge: this repo's own bundle can adopt it; the `.lokf/pyproject.toml`
  floor (`lokf>=0.7.0`) bumps with the release that carries it.

None of these blocks a release; they're follow-ups.

## Release state

- No findable release exists yet. The only tag, `v0.2.0`, has a leading `v`
  and will never match `manifest.json`'s `version` the way Obsidian's
  installer requires; the public GitHub releases API returns zero releases.
  `0.1.0`/`0.2.0` are CHANGELOG entries, not releases - Phase 5 produces the
  first one.
- **Stale tag.** Delete `v0.2.0` on both sides
  (`git push --delete origin v0.2.0; git tag -d v0.2.0`) before cutting a
  real release - destructive on the remote, so yours to run, not the
  agent's.
- **Versioning: 0.3.0.** The scaffold command's visible output changed and
  capability was added, and `[0.2.0]` is already dated in the CHANGELOG and
  recorded in `versions.json` - re-cutting 0.2.0 would rewrite published
  history.

## Current state

- `manifest.json` / `package.json` / `versions.json` / CHANGELOG top all
  agree on `0.2.0`.
- `npm run build && npm run lint && npm run smoke-test` pass (Node 22.17.1;
  CI matrix 20/22/24; `CONTRIBUTING.md` say 20+).
- `build.yml` runs build + lint + smoke-test on every push/PR, gating the
  golden fixtures. `release.yml` guards tag == manifest version, attests
  provenance, opens a draft.
- The sibling bundle validates clean under this plugin's rules (32 files, 1
  warning): `LOKF_EXTRA_BUNDLE=../lokf-agent-skills/.lokf/knowledge npm run
  smoke-test`.

## Implemented (committed, `0bcb278`..`d339de0`)

Full detail in `CHANGELOG.md`'s `[Unreleased]` section; this is a pointer,
not a restatement:

- Unreadable files are reported (`lokf/io-unreadable`), never silently
  dropped from a scan, including an unreadable root `index.md`; the scaffold
  command refuses to write over a file it couldn't read.
- Publisher convention realigned to `Person` + `person/`, matching the
  sibling bundle.
- Golden-fixture bundle checks in `npm run smoke-test` (in-repo bundles
  required; the sibling bundle opt-in via `LOKF_EXTRA_BUNDLE`, to keep the
  suite hermetic).
- Skills installed at run time, not committed; both bundle workflows
  re-scaffolded from the current template (write-scope enforcement,
  `harden-runner`, current action pins, a script-injection fix in the
  librarian's prompt-building heredoc).
- `release.yml` passes the tag through `env:` rather than interpolating
  `${{ github.ref_name }}` into a `run:` block (script-injection fix).
- README/CONTRIBUTING/PUBLISHING/CHANGELOG brought into alignment with the
  sibling repo and with `CONTRIBUTING.md`'s release flow.

## Implemented (uncommitted - see "Commit shape")

- **Bundle root folders**, widened from a single configurable root to a
  list - see "Design" above and the bundle-root-folders entry under
  "Resolved decisions" for the full technical writeup, including what
  changed for porting to OKF Enforcer.
- **Sibling-plugin detection removed**; an install shortcut added instead -
  see "Design" above and the matching "Resolved decisions" entry.
- Unit tests for the multi-bundle-root resolution logic, and the
  `validator.ts` extraction that made them possible - see "Resolved
  decisions".

## Phase 5 — First findable release — PENDING

1. Commit the working tree (see "Commit shape").
2. Branch `release/<version>` off `main`; `npm version <minor|patch>
   --no-git-tag-version` (bumps package + manifest + versions.json); date
   the `[Unreleased]` heading.
3. PR → review → merge.
4. On `main`: `git tag <version>` (bare) and `git push origin <version>`.
   `release.yml` verifies the tag, builds, attests, opens a draft. Publish
   the draft by hand; write notes there.
5. submission to `obsidian-releases`) applies, for the first time.

---

## Commit shape

Everything since `d339de0` is uncommitted, across
`.github/workflows/knowledge-librarian.yaml`, `CHANGELOG.md`, `README.md`,
`scripts/smoke-test.ts`, `src/main.ts`, `src/settings.ts`, `src/validator.ts`.
Three logical commits - the first two both touch `main.ts`/`settings.ts`/
`README.md`/`CHANGELOG.md`, so getting this exact split would need
patch-level (`git add -p`) staging rather than whole-file `git add`:

1. `feat(scope): support multiple bundle root folders per vault`
   - `src/validator.ts`: `LokfSettings.bundleRoots: string[]` (comma-separated
     in the UI, like `excludeFolders`), `normalizeBundleRoot()`,
     `hiddenRootSegment()`, `missingRootIndexIssues(settings, rootIndexPath)`,
     and the multi-root resolution functions - `normalizeBundleRoots()`,
     `resolveBundleRoot()`, `bundleRootIndexPath()`, `toBundlePath()`,
     `toVaultPath()` - pure, Obsidian-free, unit-tested.
   - `src/main.ts`: `bundleRoots()` memoizes and delegates to
     `normalizeBundleRoots()`; `resolveRoot()`/`rootIndexPathFor()`/
     `isInBundle()` are thin wrappers over the `validator.ts` functions; the
     per-root `baseIriCache` Map and `findBaseIriFor()` replace the old
     single `baseIri`/`baseIriLoaded` pair; `scanVault`'s per-root
     `lokf/io-hidden-root` / `lokf/io-missing-root` / missing-index findings
     loop and its base_iri pre-fetch; `resolveScaffoldTarget()` and the
     scaffold command's folder-creation and bundle-named template title.
   - `scripts/smoke-test.ts`: three new sections (26 assertions) covering
     `normalizeBundleRoots`/`resolveBundleRoot`/`bundleRootIndexPath`/
     `toBundlePath`/`toVaultPath`, plus the existing `normalizeBundleRoot`/
     `hiddenRootSegment` and updated `missingRootIndexIssues` coverage.
   - `src/settings.ts`: the *Bundle root folders* setting (`textarea`, CSV,
     `validate` rejecting any dot-folder entry), `bundleRoots` added to
     `CSV_KEYS`, `invalidateBaseIriCache()` wired to that key's change.
   - `README.md` / `CHANGELOG.md`: the corresponding Usage, Settings, and
     `[Unreleased]` entries.
2. `refactor(sibling): drop OKF-validator detection; add an install shortcut`
   - `src/main.ts`: `detectOkfValidator()` and the `SIBLING_PLUGIN_ID`
     constant commented out, not deleted; `checkSiblingPlugin()`,
     `siblingDetected`, `isSiblingDetected()`, `siblingStatusText()`, and the
     `check-sibling-plugin` command removed; `maybeShowSiblingNotice()`
     replaces the detection-gated notice with an unconditional one-time one;
     `refreshStatus()` drops the "Sibling: detected/not detected" tooltip
     line.
   - `src/settings.ts`: the "OKF validator status" row removed; *Install OKF
     Enforcer* (`OKF_ENFORCER_URI`) now shown unconditionally instead of only
     while undetected; the "Recommend installing..." toggle's description
     reworded to match.
   - `README.md` / `CHANGELOG.md`: the command-palette table row removed, the
     "detects whether..." sentence and repository-layout comment reworded, a
     `### Removed` entry, and the Settings section's Sibling-plugin bullet
     updated.
3. `docs(ci): note how to test-drive the librarian's skill-install step`
   - `.github/workflows/knowledge-librarian.yaml`: a comment at the
     `workflow_dispatch:` trigger pointing at the manual-run tip that used to
     live only in this plan.

## Verification

- `npm run build && npm run lint && npm run smoke-test` - all green.
- `LOKF_EXTRA_BUNDLE=../lokf-agent-skills/.lokf/knowledge npm run smoke-test` - green.
- `version-bump.mjs` dry-run: adds `0.3.0`; re-run is a no-op with an honest message.
- `release.yml` / `build.yml` parse as YAML; no `ref_name` left in a `run:` block.
- `git check-ignore`: `.agents/`, `.claude/`, `skills-lock.json`, `.lokf/.venv`,
  `node_modules`, `main.js`, `sample-vault/` all ignored; `git ls-files .agents`
  is empty; `scripts/fixtures/` is tracked.
- Both bundle workflows parse as YAML. The librarian's install step runs on
  every invocation, so a `workflow_dispatch` exercises it before `AGENT_CLI`
  is set (the agent step is a no-op until then).
- **Not verifiable here:** everything that depends on the Obsidian `App` (no
  headless Obsidian). Check by hand, in a real vault:
  - The unreadable-file scan: make a note unreadable (permissions), run
    "Validate vault", expect an `lokf/io-unreadable` row and `(1 unreadable)`
    in the notice; also run the scaffold command against an unreadable
    `index.md` and confirm it refuses.
  - Bundle root folders, empty (default): unchanged whole-vault behavior.
  - One configured root: only that folder's notes are scanned; a note
    elsewhere shows no verdict when opened.
  - Several configured roots, including one nested in another: each note
    resolves to its nearest (most specific) root, not the outer one; a note
    under neither is ignored, not flagged. Rename or delete a configured
    root's folder and expect `lokf/io-missing-root` at its `index.md` path;
    set a root to a dot-folder path and expect the setting to refuse it, or
    (if set before the guard existed) `lokf/io-hidden-root` on scan.
  - Cache invalidation on a folder rename: open a note in a configured
    bundle so its `base_iri` is cached, rename the bundle's folder away,
    change `base_iri` in its `index.md`, rename the folder back, and
    re-validate the note - its `lokf/5-id` finding must reflect the *new*
    `base_iri`, not the one cached before the rename.
  - Scaffold command with several roots configured: open a note in one of
    them and run it - expect it to target that bundle; with no note open in
    any of them, expect the "open a note first" Notice, not a guess.
  - Sibling plugin: confirm no "OKF validator status" row and no
    "Sibling: ..." status-bar tooltip line remain; the "Install OKF
    Enforcer" settings row is visible regardless of whether OKF Enforcer is
    actually installed, and opens the community-plugin browser.

## Open decisions

### done

- **Delete the stale `v0.2.0` tag** on origin? (recommended - destructive, yours)

### pending

1. **Commit now, and in what shape?** (see "Commit shape")
2. **Version:** 0.3.0 (recommended) vs 0.2.1.
3. **Curator pass** before the release PR, or after? It records a *person's*
   verdicts, so running it as part of this work would fabricate `human:`
   confirmations - do it yourself before release if you want "confirmed by
   a person: n of N" to rise. **Known drift to feed it:** the bundle's
   `references/commands-and-settings.md` and
   `services/lokf-enforcer-plugin.md` still list the removed
   `check-sibling-plugin` command ("four commands"; it's three now) and
   predate the bundle-root-folders setting. Both carry `verified:` entries,
   so they were left for the librarian/curator loop rather than hand-edited
   here - hand-editing verified content is exactly the "edited since a
   person last confirmed it" state that loop exists to catch.
4. **Submit to `obsidian-releases`** as part of this release, or later?
5. **Read a hidden `.lokf/knowledge` bundle through the Adapter API?**
   Technically possible: `vault.adapter.list()`/`.read()` take arbitrary
   paths and do reach dot-folders, which is how plugins like
   *Hidden Folders Access* work. But those notes stay invisible to the
   editor - no `TFile`, so no click-to-open from the report, no `file-open`
   or `modify` events, no editing the thing you were just told to fix. It
   would be a read-only audit of files Obsidian won't let you touch, which
   argues for keeping the current answer (open the bundle folder as its own
   vault). Recommend not building it; revisit only if someone actually asks.

## Resolved decisions

- Publisher convention: `Person` + `person/` (matches sibling bundle).
- Golden fixtures: in-repo bundles required; external bundles opt-in.
- Release flow: `CONTRIBUTING.md` is the single source of truth.
- Upstream `lokf` PRs #67/#68/#69: tracked above; none blocks this release.
- Skills un-vendored per their hygiene note: run-time install in CI, frozen
  fixture in-repo, ignored locally. No plugin feature runs a skill - the
  plugin stays deterministic and offline; that separation *is* the trust model.
- **`LOKF_SKILLS_REF` stays pinned to `v0.9.0`.** It is the only tag on the
  sibling's remote; a `v1.0.0` there is not planned. Whenever the sibling
  next cuts a tag, bump `LOKF_SKILLS_REF` in `knowledge-librarian.yaml` and
  the two documented `@v0.9.0` install pins together; a manual
  `workflow_dispatch` run first (documented as a comment at that trigger in
  the workflow file) exercises the install step against the new tag before
  the scheduled run does.
- **Never auto-enable the sibling plugin, and don't detect it either.**
  Settings offer a shortcut that opens
  `obsidian://show-plugin?id=okf-enforcer` (id confirmed in
  `obsidian-releases/community-plugins.json`; OKF Enforcer 0.6.1 is genuinely
  an OKF v0.2 validator, though the store blurb still says v0.1) and shown
  unconditionally. Two things deliberately not built: installing or enabling
  it *for* the user, which would need `app.plugins.enablePlugin()` - an
  undocumented internal API that would also silently switch on third-party
  code the user never chose; and *detecting* whether it's already installed,
  which read `app.plugins.enabledPlugins`/`app.plugins.plugins` - also not
  public API, and a routine community-review flag. Detection drove a command
  ("Re-check for an installed OKF validator"), a settings row ("OKF
  validator status"), and a status-bar tooltip line, all removed with it;
  the one-time first-open notice (`recommendSiblingPlugin`) now fires
  unconditionally instead of only when "not detected". `detectOkfValidator()`
  is left commented out in `main.ts`, not deleted, in case a public "is
  plugin X installed" API appears later.
- **"Bundle root folders" setting: one root, widened to many.** A bundle
  root no longer has to equal vault root, and a vault can hold several
  independent bundles as sibling project folders (`projects/a-knowledge`,
  `projects/b-knowledge`, each its own `index.md` and `base_iri`). Design
  calls: notes *outside* every configured root are ignored entirely, never
  validated headerless; a note under two configured roots (one nested in the
  other) belongs to the more specific one, not both - `bundleRoots()` sorts
  roots longest-first so the first prefix match wins.

  What changed, for porting to **OKF Enforcer** via PR later (it has the same
  hard-coded vault-root-is-bundle-root assumption, so the gap and the fix are
  the same shape there):
  - `LokfSettings.bundleRoots: string[]` (`validator.ts`) - vault-relative
    folder paths; `[]` = vault root, unchanged default behavior. Stored and
    edited exactly like `excludeFolders` - comma-separated text in the UI,
    an array in settings, via the existing `parseCsv`/`joinCsv`.
    `normalizeBundleRoot()` (trims slashes) and `hiddenRootSegment()` (names
    a dot-folder segment) operate on one root string at a time; multi-root
    orchestration is the new `normalizeBundleRoots()`/`resolveBundleRoot()`/
    `bundleRootIndexPath()`/`toBundlePath()`/`toVaultPath()` - also in
    `validator.ts`, and also pure: they take the resolved root and settings
    as plain arguments, never touch the Obsidian `App`.
  - Input normalization (`normalizeBundleRoot`) settles every spelling a
    person plausibly types onto the exact form Obsidian's vault paths use -
    forward slashes, no leading/trailing slash or whitespace, no doubled
    slashes, no `./` segments - because `resolveBundleRoot` is a plain
    prefix match: an unnormalized `./knowledge` or `projects\foo` would
    match nothing and be reported as a missing folder. `..` is deliberately
    left alone; it can't name a vault folder and falls through to that same
    missing-root report, which is the honest message for it.
  - `main.ts`'s path-translation boundary is root-parameterized:
    `bundleRoots()` (memoized on the raw array's *identity*, not a joined
    string - folder names may contain any joiner, so `["My Notes"]` and
    `["My", "Notes"]` would otherwise collide; identity is sound because
    settings lists are always replaced, never mutated), `resolveRoot(vaultPath)`
    (which configured root, if any, a path belongs to - `""` for the
    implicit whole-vault bundle when none are configured, `null` when
    explicit roots are configured and the path is under none of them),
    `rootIndexPathFor(root)`, `isInBundle()` (`resolveRoot() !== null`).
    `issuesFor()` builds its `exists` closure per call, bound to the note's
    own resolved root.
  - **base_iri caching is a `Map<root, string | null>`** (`baseIriCache`) -
    the real complexity in going from one bundle to N. `findBaseIriFor(root)`
    reads and caches lazily; `scanVault` pre-fetches every root actually
    present among the candidate files with one `Promise.all` before the
    parallel scan batches, so files sharing a root don't all miss an
    unwarmed cache at once and each trigger their own read of the same
    `index.md`. `invalidateBaseIri(path)` drops every cached root whose
    index sits *at or under* `path` - a bundle root folder being renamed or
    deleted fires one vault event for the folder, not one per file inside
    it, so an exact-path check alone left the old `base_iri` cached under a
    folder that no longer held it. It checks the union of currently cached
    and currently configured roots (covers a root just edited out of
    settings); `invalidateBaseIriCache()`, called when the `bundleRoots`
    setting itself changes, clears the whole map.
  - Settings UI: *Scope and performance → Bundle root folders*, a
    comma-separated `textarea` (like `excludeFolders`) rather than
    Obsidian's native `type: "folder"` picker - a real UX trade-off: the
    picker's vault-folder suggester and typo/nonexistent-folder prevention
    are lost for a multi-entry list. `SettingDefinitionList` (the
    add/reorder/delete affordance) could restore a per-entry picker but
    needs a synthetic indexed-key scheme (`bundleRoots.0`, `bundleRoots.1`,
    ...) not built yet. `validate` still rejects any entry inside a
    dot-folder, checking each comma-separated token.
  - **Dot-folder guard.** `.lokf/knowledge` is the sidecar convention, so
    it's the first thing a user of these tools will type, and Obsidian's
    file index never exposes a dot-folder - `getMarkdownFiles()` returns
    nothing and `getAbstractFileByPath()` returns null for everything under
    it. Unguarded, the scan would report "0 notes, no root index.md": a
    healthy-looking empty bundle. Guarded in two places - the setting's
    `validate` hook rejects the path with the reason, and `scanVault`
    synthesizes `lokf/io-hidden-root`, once per configured root. A third
    guard, `lokf/io-missing-root`, covers a root folder renamed or deleted
    after being configured, also per root. The `io-*` issue builders sit in
    `main.ts` beside `unreadableIssues()`, since like it they describe vault
    access rather than a LOKF rule.
  - `missingRootIndexIssues(settings, rootIndexPath)` takes the expected path
    so its message names e.g. `projects/a-knowledge/index.md`; run once per
    configured root (or once for the implicit `""` root when none are
    configured).
  - `scaffoldRootHeader()` needs a target root when several are configured.
    `resolveScaffoldTarget()`: the active note's own bundle if it has one;
    else the sole configured root; else the implicit whole-vault root when
    none are configured; else (several configured, no note open in any of
    them) `null`, and the command asks the user to open a note in the target
    bundle first rather than guessing. Also creates the bundle-root folder
    if it doesn't exist yet (`vault.create()` fails outright otherwise), and
    the inserted template's `title:` uses the bundle folder's own name
    rather than the vault's name when the bundle isn't the whole vault.
  - **Unit-tested.** The resolution logic is pure path algebra, so it lives
    in `validator.ts` (which runs under plain Node) rather than behind the
    Obsidian `App` in `main.ts`, which only memoizes and delegates.
    `scripts/smoke-test.ts` covers it in three sections (26 assertions)
    plus the input-normalization spellings above: normalization (dedup,
    blank-drop, longest-first sort, stable order for equal-length disjoint
    roots), resolution (empty roots
    -> implicit whole-vault bundle; single root -> matches vs. a
    same-named non-matching prefix like `knowledge-archive/`; nested roots
    -> the more specific one wins, the outer one is the fallback; disjoint
    roots -> each path picks its own, a third path matches neither), and the
    path conversions including a round-trip check. What's still not unit
    testable, because it genuinely needs the Obsidian `App`: `findBaseIriFor`'s
    caching, `scanVault`'s per-root findings loop, and
    `resolveScaffoldTarget()`'s active-note lookup - covered by the manual
    steps in "Verification" instead.
  - `excludeFolders` stays vault-relative and independent of `bundleRoots`.
