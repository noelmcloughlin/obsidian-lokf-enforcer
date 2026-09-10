# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

No version below has been published as a GitHub release yet, so entries describe development history against `main`, not user-facing upgrades.

## [0.3.0] - 2026-09-10

### Added
- **Bundle root folders**: a vault can now hold several independent bundles as sibling project folders instead of one bundle per vault. Each configured folder gets its own `index.md`, `base_iri`, and minted/checked ids and relations; notes outside every configured folder aren't scanned. A misconfigured root (inside a dot-folder, renamed, or deleted) is reported rather than silently producing an empty "clean" bundle.
- The scaffold command targets whichever bundle the active note belongs to, and asks instead of guessing when several bundles are configured and none is open.
- A settings shortcut opens OKF Enforcer in Obsidian's community-plugin browser. Considered detecting whether it's already installed via `app.plugins`, and rejected that - not public API, and a routine flag in community-plugin review - so the shortcut and the one-time "install a validator" notice are both shown unconditionally instead.
- Unit tests for the bundle-resolution logic, extracted into plain, Obsidian-free functions so it runs under plain Node instead of needing a real vault to exercise.
- Golden-fixture bundle checks in `npm run smoke-test`: the full rule set runs over a frozen scaffolding-template skeleton and this repo's own `.lokf/knowledge/`, asserting zero errors; point `LOKF_EXTRA_BUNDLE` at another bundle to check it too.
- This repo's own `.lokf/knowledge/` bundle is maintained by `lokf-agent-skills` installed at run time rather than committed, matching their hygiene guidance; CI installs the librarian skill pinned to a tagged release. No skill is a plugin dependency.
- README rewritten: framing shared with `lokf-agent-skills`, a "Where this fits" section placing the plugin on the four-tier trust model with an explicit no-dependency statement, an Install section, a repo layout, and Credits.

### Changed
- The scaffold command now writes `publisher.id` as `person/<slug>` to agree with `type: Person` (previously `org/<slug>`).
- README's Usage section explains that the vault root is the bundle root by default, and that a `.lokf/knowledge/` bundle must be opened as its own vault - Obsidian never exposes dot-folders to any plugin.
- `llms.txt` and the README explain how to weigh a draft concept against a human-confirmed one.
- `CONTRIBUTING.md` documents the PR-based release flow and asks for Node 20+.
- Internal cleanup: type-vocabulary lookups are cached instead of rebuilt per note; `version-bump.mjs` only ever adds a version, never rewrites one already recorded.

### Fixed
- An unreadable note was silently dropped mid-scan and still counted as "scanned", so a vault could report clean while files went unchecked. Unreadable notes now get their own report row and are counted separately.
- An unreadable root `index.md` no longer aborts an entire scan, and the scaffold command now refuses to write when it can't first read the file (previously it could overwrite the file's contents).
- The knowledge-librarian's prompt-building script executed parts of its own prompt as shell commands due to an unescaped heredoc; re-scaffolded from the current template.

### Security
- `release.yml` now passes the pushed tag through the environment instead of interpolating it into a shell command, closing a script-injection path through a crafted tag name.
- `knowledge-librarian.yaml` no longer runs a repository variable's content as a shell command; it always runs a pinned wrapper script and fails the job if the agent writes outside `.lokf/knowledge/`. Both bundle workflows gained hardened-runner auditing and least-privilege permissions.

## [0.2.0] - 2026-09-08

### Added
- `.lokf/knowledge/`: this plugin's own self-documenting knowledge bundle.
- `release.yml` verifies the pushed tag matches `manifest.json`'s version before building, so a mistagged push fails fast instead of publishing a release Obsidian's installer can never find.

### Security
- `build.yml`/`release.yml`: hardened-runner auditing, least-privilege permissions, and SHA-pinned actions.

## [0.1.0] - 2026-09-08

### Added
- Validates the LOKF semantic layer on top of OKF v0.2: bundle-root header, `base_iri` checks, the type vocabulary, typed relationships, and id/IRI-minting consistency.
- Vault-wide scan with a status-bar indicator and a side-panel report.
- Declarative settings (Obsidian 1.13.0+).
- Standard `obsidian-sample-plugin` tooling: esbuild, strict TypeScript, ESLint, a Node 20/22/24 CI matrix, and attested draft GitHub releases.
