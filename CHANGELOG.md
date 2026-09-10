# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- A **bundle root folders** setting (*Scope and performance*), for a vault
  that holds several independent bundles as sibling project folders - the
  ordinary Obsidian pattern of one vault, many subfolders, with no sidecar or
  dot-folder. List their vault-relative paths (comma-separated) and each gets
  its own `<folder>/index.md`, `base_iri`, and minted/checked ids and
  relations, scoped to that folder alone; a note outside every listed folder
  is ignored entirely. Leaving the list empty keeps the previous
  vault-root-is-the-one-bundle behavior. Entries are normalized to the form
  Obsidian's vault paths use, so `./knowledge`, `knowledge/`, ` knowledge `
  and `projects\foo` all mean what a person meant by them. An entry inside a
  dot-folder (`.lokf/knowledge`) is refused with the reason: Obsidian's file
  index never exposes those, so such a bundle can only be opened as its own
  vault. Renaming or deleting a bundle root folder drops its cached
  `base_iri`, as editing its `index.md` already did.
- The scaffold command targets whichever bundle the active note belongs to;
  with several roots configured and no note open in one of them, it asks
  first rather than guessing.
- Unit tests for the multi-bundle-root resolution logic (`npm run
  smoke-test`): normalizing/deduping/sorting a configured root list, picking
  the right bundle for a path (including a path under both a nested and its
  outer root, and one under neither), and the bundle-relative path
  conversions round-tripping. This logic was extracted from `main.ts` into
  `validator.ts` as plain, Obsidian-free functions specifically so it could
  be tested outside a real vault - see *Changed* below.
- A misconfigured bundle root is now reported instead of scanning nothing and
  reporting a healthy, empty bundle: `lokf/io-hidden-root` when a configured
  root sits inside a dot-folder, `lokf/io-missing-root` when the folder has
  been renamed or deleted. Checked once per configured root.
- Settings offer a shortcut (*Sibling plugin → Install OKF Enforcer*) that
  opens OKF Enforcer in Obsidian's community-plugin browser. The user
  installs and enables it themselves - this plugin still never installs,
  enables, loads, or calls into another plugin.
- The four `lokf-agent-skills` (scaffolding, librarian, curator, docent) are
  installed, never committed: `.agents/`, `.claude/`, and `skills-lock.json`
  are git-ignored, the two `SKILL.md` files that had been tracked are
  untracked, and `knowledge-librarian.yaml` installs the pinned
  `lokf-librarian` skill at run time. README and CONTRIBUTING give the
  one-time local install.
- `scripts/fixtures/scaffolding-skeleton/`: a frozen copy of the
  `lokf-scaffolding` template skeleton, so the smoke test's golden fixture
  reads a versioned file in this repository rather than a live, git-ignored
  install.
- Golden-fixture checks in `npm run smoke-test`: the whole LOKF rule set is run
  over every concept in the `lokf-scaffolding` template skeleton (frozen under
  `scripts/fixtures/`) and
  this repository's own `.lokf/knowledge/`, asserting zero errors. Point
  `LOKF_EXTRA_BUNDLE` at another bundle to check it too.
- README: the Amy Lowell epigraph and library framing shared with
  `lokf-agent-skills`; a "Where this fits" section placing the plugin at the
  schema-valid tier of the four-level trust model, with an explicit statement
  that it depends on neither the skills nor any other plugin; an Install
  section; a repository layout; and Credits (LOKF, LinkML,
  obsidian-sample-plugin, OKF Enforcer, lokf-agent-skills).

### Removed
- Sibling-plugin **detection**. It read `app.plugins`, which is not public
  Obsidian API and is a routine flag in community-plugin review; there is no
  supported way to ask "is plugin X installed and enabled?" The **command**
  it drove ("Re-check for an installed OKF validator"), the settings tab's
  **"OKF validator status" row**, and the **"Sibling: detected / not
  detected" line** in the status-bar tooltip are gone with it. What remains:
  the *Install OKF Enforcer* settings shortcut (now shown unconditionally,
  not just when "not detected") and the one-time first-open notice (now
  unconditional on the `recommendSiblingPlugin` toggle alone). The detection
  function itself is left commented out in `main.ts`, not deleted, in case a
  public API for this appears later.

### Changed
- Multi-bundle-root path resolution (`normalizeBundleRoots`,
  `resolveBundleRoot`, `bundleRootIndexPath`, `toBundlePath`, `toVaultPath`)
  moved from private `main.ts` methods to exported, Obsidian-free functions
  in `validator.ts`, which already runs under plain Node - `main.ts` now
  just memoizes and delegates. No behavior change; done so this logic could
  be unit-tested at all (a real vault is otherwise the only way to exercise
  it).
- The semantic-header command now scaffolds `publisher.id` as `person/<slug>`
  to agree with its `type: Person`; it previously emitted `org/<slug>`. This
  repository's own bundle header is realigned the same way.
- `llms.txt` and the README's "For AI Agents" section now explain how to weigh
  a `status: draft` concept against a `human:`-confirmed one, name the
  `lokf-docent` skill, and cross-link `lokf-agent-skills`.
- `version-bump.mjs` only ever adds a version to `versions.json`, so re-running
  it cannot rewrite the `minAppVersion` recorded against a released version.
- `isKnownType` caches the normalized type vocabulary instead of rebuilding it
  for every note, and the report view's progress bar uses `setCssStyles`.
- `npm run lint` no longer sweeps the `.lokf/` Python sidecar into the
  TypeScript project; its `.venv` had been producing 227 spurious errors.
- The "no root index.md" warning names the bundle's actual index path, which
  is no longer necessarily the vault's own root.
- `PUBLISHING.md` defers to `CONTRIBUTING.md`'s PR-based release flow instead
  of describing a second, conflicting one, and the bundle's `releasing`
  playbook cites `CONTRIBUTING.md` as its source.
- `PUBLISHING.md` reordered: the pending `obsidian-releases` submission is
  now §1, with a status line saying no findable release exists yet; the
  fresh-repo bootstrap this repo already completed moved to a "forks only"
  appendix instead of leading the file.
- README's Usage section now states plainly that the vault root is the bundle
  root: a `.lokf/knowledge/` bundle must be opened as its own vault, because
  Obsidian's file index skips dot-folders and a repository root opened as a
  vault never exposed the bundle to any plugin. It also says what happens in
  an ordinary personal vault (nothing, bar one switchable warning).
  `.lokf/.gitignore` now ignores the `.obsidian/` folder Obsidian creates
  inside the bundle when it is opened that way.
- `CONTRIBUTING.md` and `PUBLISHING.md` ask for Node 20+ (18 is end-of-life;
  CI builds on 20, 22, and 24).

### Fixed
- A note the vault could not read was silently dropped mid-scan and still
  counted in "scanned N notes", so a vault could report clean while files went
  unchecked. Unreadable files now get their own row in the report and a count
  in the summary notice.
- An unreadable root `index.md` no longer aborts an entire vault scan, and the
  semantic-header command now refuses to write when it cannot first read the
  file - previously that path could overwrite the file's contents.
- `.lokf/scripts/knowledge-librarian.sh` built its agent prompt in an unquoted
  heredoc with unescaped backticks, so bash executed `` `generated` `` and
  `` `timestamp` `` as commands and blanked them from the prompt.
  Re-scaffolded from the current template, which escapes them and adds the
  draft-marking and "For the curator" instructions.

### Security
- `release.yml` passes the pushed tag to the shell through the environment
  instead of `${{ }}` interpolation, closing a script-injection path through a
  crafted tag name.
- `knowledge-librarian.yaml` re-scaffolded from the current `lokf-scaffolding`
  template: it no longer runs `bash -c "$KNOWLEDGE_LIBRARIAN_CMD"` - a
  repository variable's content executed as a command - but always the pinned
  wrapper script, and fails the job if the agent writes outside
  `.lokf/knowledge/`. Both bundle workflows gain `step-security/harden-runner`
  (audit), workflow-level `permissions: {}` with per-job grants, and current
  action pins (checkout v7.0.1, setup-uv v10.0.1, github-script v9.0.0).

## [0.2.0] - 2026-09-08

### Added
- `.lokf/knowledge/` - a self-documenting LOKF knowledge bundle covering this
  plugin's own services, references, glossary, playbooks, and privacy policy,
  referenced from a new "For AI Agents" section in the README.
- `release.yml` now verifies the pushed tag matches `manifest.json`'s
  `version` before building, failing fast on a mistagged push (e.g. a leading
  `v`) instead of publishing a release Obsidian's installer can never find.

### Security
- `build.yml` and `release.yml`: added `step-security/harden-runner` in audit
  mode, `persist-credentials: false` on checkout, and a least-privilege
  `permissions: {}` workflow-level default, with write scopes opted into only
  by the job that needs them.
- `actions/checkout`, `actions/setup-node`, `actions/attest`, and
  `step-security/harden-runner` pinned to commit SHAs instead of floating
  major-version tags.

## [0.1.0] - 2026-09-08

### Added
- Initial release. Validates the LOKF (Linked Open Knowledge Format) semantic
  layer on top of OKF v0.2: bundle-root semantic header (`lokf_version`,
  `base_iri`, `context`, `publisher`, ...) and `base_iri` authority/format
  checks, the LOKF type vocabulary with type-specific fields (`Table`/`Dataset`
  `fields`/`distribution`, `Metric`, `Service`, `GlossaryTerm`), the Diátaxis
  `genre` facet, typed relationships (`isPartOf`, `hasPart`, `references`,
  `dependsOn`, `derivedFrom`, `about`, `sameAs`, `relatedTo`, `definedBy`,
  `source`, and the generic `relations` list), and `id`/IRI-minting
  consistency against `base_iri`.
- Vault-wide scan with a status-bar indicator, a collapsible side-panel
  report (active note pinned at top, folder-grouped, batched for large
  vaults), and a command to insert a starter semantic header into an empty
  root `index.md`.
- Detects whether an OKF v0.2 validator (such as OKF Enforcer) is installed
  and enabled, and recommends one if not - this plugin only checks the LOKF
  semantic layer and deliberately does not duplicate OKF-core checks
  (required `type`, provenance/trust/lifecycle, Attested Computation,
  `index.md`/`log.md` structure).
- Settings are declared with Obsidian 1.13.0's `getSettingDefinitions()` API, so
  they appear in Obsidian's settings search; `minAppVersion` is 1.13.0.
- Tooling follows upstream `obsidian-sample-plugin`: sources in `src/`, esbuild
  watch/production modes, `strict` TypeScript, ESLint with
  `eslint-plugin-obsidianmd`, a Node 20/22/24 CI matrix, and a draft GitHub
  release with build attestation. `main.js` is git-ignored and produced by the
  release workflow rather than committed.
