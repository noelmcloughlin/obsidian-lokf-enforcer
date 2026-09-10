# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

No version below has been published as a GitHub release yet, so entries describe development history against `main`, not user-facing upgrades. No tags exist yet either, which is why version headings carry no compare links.

## [Unreleased]

## [0.3.0] - 2026-09-11

### Added

- **Bundle root folders**: a vault can now hold several independent bundles as sibling project folders instead of one bundle per vault. Each configured folder gets its own `index.md`, `base_iri`, and minted/checked ids and relations; notes outside every configured folder aren't scanned. A misconfigured root (inside a dot-folder, renamed, or deleted) is reported rather than silently producing an empty "clean" bundle.
- The scaffold command targets whichever bundle the active note belongs to, and asks instead of guessing when several bundles are configured and none is open.
- A settings shortcut opens OKF Enforcer in Obsidian's community-plugin browser. Considered detecting whether it's already installed via `app.plugins`, and rejected that - not public API, and a routine flag in community-plugin review - so the shortcut and the one-time "install a validator" notice are both shown unconditionally instead.
- Unit tests for the bundle-resolution logic, extracted into plain, Obsidian-free functions so it runs under plain Node instead of needing a real vault to exercise.
- Golden-fixture bundle checks in `npm run smoke-test`: the full rule set runs over a frozen scaffolding-template skeleton and this repo's own `.lokf/knowledge/`, asserting zero errors; point `LOKF_EXTRA_BUNDLE` at another bundle to check it too.
- This repo's own `.lokf/knowledge/` bundle is maintained by `lokf-agent-skills` installed at run time rather than committed, matching their hygiene guidance; CI installs the librarian skill pinned to a tagged release. No skill is a plugin dependency.
- README rewritten: framing shared with `lokf-agent-skills`, a "Where this fits" section placing the plugin on the four-tier trust model with an explicit no-dependency statement, an Install section, a repo layout, and Credits.
- `lint-and-docs.yaml`: a static-checks workflow covering the shell, workflows, and prose this repo ships - ShellCheck, `actionlint`, markdownlint, `lychee` link-checking (configured in `lychee.toml`), and codespell - on every push and PR plus a weekly schedule, so link rot surfaces without waiting for an incidental PR. Backported from `lokf-agent-skills`'s `validate.yml`.
- `.markdownlint-cli2.jsonc`, adopted from `lokf-agent-skills`: five rules disabled for reasons specific to this content (unwrapped prose, frontmatter `title:` reading as an implicit H1, adjacent callouts, template placeholder tokens, insertable fragments) and `MD024` scoped to `siblings_only` so Keep a Changelog's repeated category headings pass while real duplicates still fail. This repo additionally ignores `node_modules/` and the run-time-installed `.agents/`/`.claude/` skill directories, none of which exist in the repo it came from.
- `.github/dependabot.yml`: weekly updates for the pinned action SHAs, the plugin's npm devDependencies (grouped into one PR), and the `.lokf/` sidecar's Python toolchain. The SHA-pinning convention used across every workflow goes stale silently otherwise - `actionlint` catches syntax drift, not staleness.
- `AI_COVENANT.md`, adopted from `lokf-agent-skills`: contributors own what they submit regardless of which tools helped write it, AI may support but not proxy discussion participation, and repository-owned agents (this repo's scheduled `knowledge-librarian`) commit under a bot identity, always via a reviewable PR, and may never record a human verdict a person didn't actually give. Referenced from `CONTRIBUTING.md`, the PR template, and both issue templates.
- `.github/pull_request_template.md`: a scope checkbox, the pre-PR checklist in short form (including the reminder that anything needing a real Obsidian `App` has no automated test), and the AI-assistance clause.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), shared verbatim with `lokf-agent-skills` so both repositories hold contributors to one standard. Linked from `README.md` and `CONTRIBUTING.md`.
- README gained a Contributing section pointing at the contributing guide, the code of conduct, and the AI covenant.

### Changed

- The scaffold command now writes `publisher.id` as `person/<slug>` to agree with `type: Person` (previously `org/<slug>`).
- README's Usage section explains that the vault root is the bundle root by default, and that a `.lokf/knowledge/` bundle must be opened as its own vault - Obsidian never exposes dot-folders to any plugin.
- `llms.txt` and the README explain how to weigh a draft concept against a human-confirmed one.
- `CONTRIBUTING.md` documents the PR-based release flow and asks for Node 20+.
- Internal cleanup: type-vocabulary lookups are cached instead of rebuilt per note; `version-bump.mjs` only ever adds a version, never rewrites one already recorded.
- Renamed `knowledge-validate.yaml` to `knowledge-registrar.yaml`, matching the rename upstream in `lokf-agent-skills` v0.12.0: the workflow keeps the bundle's records well-formed and provenanced, and never judges whether their content is true - that is the curator's job. Cross-references in `SECURITY.md`, `CONTRIBUTING.md`, `lint-and-docs.yaml`, and the bundle's own concepts were updated to match.
- README now names the registrar gate directly, mirroring the "fifth role" paragraph in `lokf-agent-skills`'s own README: the plugin works the registrar's desk inside Obsidian, and `knowledge-registrar.yaml` staffs the same desk in CI - neither reaching a verdict of its own. This keeps the registrar theme consistent across both projects' READMEs.
- `.lokf/README.md`'s directory tree lists the quality-gates playbook and the `scripts/` wrapper directory, both of which it had grown without recording.
- `SECURITY.md` now inventories every workflow (including the lint-and-docs and registrar gates and the librarian's wrapper script), describes the librarian's two-job privilege split and the blast radius if a prompt-injection guard fails, states the `.lokf/feedback.md` guard explicitly, and records why CodeQL is deliberately not enabled while Dependabot covers dependency review.
- `CONTRIBUTING.md` gained the CI gates contributors trip most often, the Dependabot note, a "Using AI tools" section pointing at the covenant, and an explanation of why a fresh clone shows "Failed to load plugin" until `npm run build` has produced the git-ignored `main.js`.

### Fixed

- An unreadable note was silently dropped mid-scan and still counted as "scanned", so a vault could report clean while files went unchecked. Unreadable notes now get their own report row and are counted separately.
- An unreadable root `index.md` no longer aborts an entire scan, and the scaffold command now refuses to write when it can't first read the file (previously it could overwrite the file's contents).
- The knowledge-librarian's prompt-building script executed parts of its own prompt as shell commands due to an unescaped heredoc; re-scaffolded from the current template.
- `.lokf/knowledge/` drift against the source it documents: two concepts described a fourth command (`check-sibling-plugin`) that does not exist - sibling detection via `app.plugins` is commented out, so the recommendation notice fires unconditionally rather than only when absent - and one attributed the scan's batching to `report-view.ts` rather than `main.ts`, where the batch size is the configurable `batchSize` setting. `README.md` had been correct throughout; only the bundle had drifted.
- A stale, frontmatter-free planning document under `.lokf/knowledge/` crashed `lokf validate` for the entire bundle rather than failing gracefully on that one file; removed, and the `lint-and-docs`/registrar gates now cover what it was tracking.
- `CONTRIBUTING.md`'s layout table no longer lists sibling detection as a `main.ts` responsibility, and two typos in the pre-PR checklist are corrected.
- **`LOFK` -> `LOKF`** in the plugin description carried by `manifest.json`, `package.json`, and `community-plugin-entry.json` - a transposition in the public-facing blurb Obsidian's community-plugin browser shows, and in the entry submitted to the plugin directory. The `codespell` gate only scans `**/*.md`, so no CI check covered it.
- Markdown that the new `lint-and-docs` gate would have failed on: a bare URL in `SECURITY.md`, an unlabelled code fence in `.lokf/README.md`, and missing blank lines around headings and lists throughout `CHANGELOG.md`, the bundle's `log.md`, and the bug-report template.
- A folder in **Excluded folders** written with a trailing slash, a leading slash, surrounding whitespace, or a `./` prefix - the natural ways to type one - silently excluded nothing at all; only the exact bare spelling worked. Now normalized the same way **Bundle root folders** already was.
- **Base_iri authority check** compared `URL.host` (which includes `:port`) against the denylist, so `https://github.com:8080/...` passed as a controlled namespace though `https://github.com/...` correctly failed. Now compares `hostname`.
- A relation field (`dependsOn`, `references`, `sameAs`, and the other eight from Golden Rule 4) written as a bare scalar - `dependsOn: <iri>`, not a list - passed validation clean, even though the generated LOKF schema requires an array for all ten and real `lokf validate` fails it. This is the same bug class the 2026-09-09 bundle audit found and fixed in this repo's own concepts (see `.lokf/knowledge/log.md`); the plugin itself never caught it. Now warned, naming the field and showing the list form.
- `type` set to a number, boolean, list, or mapping produced no finding at all - indistinguishable from a genuinely missing `type`, which is silent by design (that's the installed OKF validator's error to raise). A list or mapping now gets its own shape warning; a coercible scalar (`type: 123`) reads as text and hits the ordinary "not in the vocabulary" warning, exactly like an unrecognized string would.
- **Validate active note** (the command, and the status-bar click) went completely silent - no notice, status bar cleared to `LOKF: —` - when run on a note excluded by settings or outside every configured bundle root, despite the command being enabled for any Markdown file. Every other outcome (clean, unreadable, N findings) already produced a Notice; this is the one case where the user most needed to be told why nothing happened.
- The report panel's **"N clean"** count subtracted every row in the results list from the scanned-file count, including bundle-level findings (no root `index.md`, a hidden or missing bundle-root folder) that were never one of the scanned files to begin with - undercounting "clean" by however many such findings a scan produced.

### Security

- `release.yml` now passes the pushed tag through the environment instead of interpolating it into a shell command, closing a script-injection path through a crafted tag name.
- `knowledge-librarian.yaml` no longer runs a repository variable's content as a shell command; it always runs a pinned wrapper script and fails the job if the agent writes outside `.lokf/knowledge/`. Both bundle workflows gained hardened-runner auditing and least-privilege permissions.
- `knowledge-librarian.yaml` is split into two jobs so the agent and the write-scoped token never meet: `refresh` runs the agent - third-party code - under `contents: read` with `persist-credentials: false` and hands its proposed change to `publish` as a patch artifact; only `publish`, which runs no agent code, holds `contents: write` / `pull-requests: write`. A compromised agent can no longer reach a write credential at all, rather than being caught after using one. Ported from `lokf-agent-skills` v0.11.0.
- `knowledge-librarian.sh` parses `AGENT_CLI` into a quoted argv array instead of expanding it unquoted at the command position, so shell metacharacters in that value are passed as inert arguments - there is no `eval` and no `bash -c`. The previous form suppressed the ShellCheck warning (`SC2086`) that names exactly this. The wrapper also enforces the bundle boundary itself after the agent returns, so the "edit only the bundle" contract is now checked twice by two independent mechanisms.
- The scheduled librarian run is armed by a dedicated `KNOWLEDGE_LIBRARIAN_ENABLED` repository variable rather than inferred from `AGENT_CLI` being set, so an agent command can be staged without going live.

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
