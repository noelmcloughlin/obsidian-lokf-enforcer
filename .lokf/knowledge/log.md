# Change Log

## 2026-09-12 (3)

* **Renamed** (maintainer decision): the plugin is **LOKF Registrar**, id
  `lokf-registrar`, repository `obsidian-lokf-registrar` - the name now says
  the role this bundle already gave it. Bundle-wide: the placeholder
  namespace is `https://lokf-registrar.example/knowledge/` and every `id`
  and relation target is re-minted under it; `services/lokf-enforcer-plugin.md`
  moved to `services/lokf-registrar-plugin.md` and
  `explanation/why-lokf-enforcer.md` to `explanation/why-lokf-registrar.md`,
  ids and titles with them; `index.md` retitled. `why-lokf-registrar.md`
  gains a "Why the name" section and `lokf-registrar-plugin.md` an
  "Identity" section (API path, device key, `generated.by` actor, and that
  a map stamped `lokf-enforcer/<version>` by an earlier build is still
  recognised as the plugin's own); both `generated` refreshed. `NOTICE` no
  longer calls the plugin a companion to a separate OKF validator - it
  checks the base layer itself. `references/okf-specification.md` corrected
  in passing: the plugin has checked required `type` and Attested Computation
  shape itself since 0.4.0, which that concept still denied. Entries below keep
  the names in use at the time.

## 2026-09-12 (2)

* **Corrected** `services/lokf-enforcer-plugin.md`, `services/settings-tab.md`,
  `references/commands-and-settings.md` after the maintainer had the
  afternoon's feature-fit audit implemented: `diataxis.md` is now written as a
  `Document` with a minted `id` and `generated.by: lokf-enforcer/<version>`
  (the earlier headerless map made `lokf validate` abort a run); with no
  bundle roots configured a top-level `knowledge_bundle/` is detected on its
  own (`autoBundleRoot`); a dot-folder root is accepted with a live-index
  check and a warning instead of being refused. The `## Open questions`
  section on the plugin concept is replaced by the record of what changed.

* **Corrected** `services/lokf-enforcer-plugin.md`, `services/settings-tab.md`,
  `references/commands-and-settings.md`, and rewrote
  `explanation/why-lokf-enforcer.md`: the plugin no longer detects,
  recommends, or deep-links to any other OKF validator. The commented-out
  `detectOkfValidator`, the one-time notice (`recommendOkfValidator` /
  `okfValidatorNoticeShown`), and the "Alternative OKF validator" settings
  group were removed from `src/main.ts`, `src/settings.ts`, and
  `src/validator.ts` at the maintainer's direction: with the OKF v0.2 base
  layer checked here, a separate validator is an *alternative* worth a
  footnote, not a companion, and the only plugin this one names is its
  sibling LOKF Curator. `README.md` was restructured the same day around how
  an Obsidian user actually meets a bundle (the bundle is the vault; a folder
  in the vault; derived from a repository and opened via `knowledge_bundle`)
  and now states, per Obsidian's own help on symbolic links, that a
  repository root opened as a vault cannot reach the bundle through the
  link - the previous README's contrary claim was wrong. The smoke test's
  first header fixture, formerly a verbatim copy of another project's
  `index.md`, is now a neutral example; the frozen template fixture moved
  from `scripts/fixtures/scaffolding-skeleton/` to
  `scripts/fixtures/sidecar-skeleton/` to follow the upstream skill's rename
  from `lokf-scaffolding` to `lokf-sidecar`. Command table in
  `references/commands-and-settings.md` extended to the commands the README
  documents. Not a full steady-state sweep - concepts untouched by these
  changes were not re-checked.

## 2026-09-11 (2)

* **Corrected** `services/validator-engine.md`, `services/lokf-enforcer-plugin.md`,
  `services/report-view.md` against the six-bug correctness pass on
  `src/*.ts`: the rule engine now warns on a bare scalar where the schema
  requires a list (the same bug class fixed in this bundle's own concepts on
  2026-09-09, recurring in `dependsOn` et al.), on a non-string `type`, on an
  unnormalized `excludeFolders` entry, and closes a `:port` bypass in the
  authority-denylist check; **Validate active note** now tells the user why
  when it does nothing (excluded, or outside every bundle root); and the
  report panel's "N clean" count no longer subtracts bundle-level findings
  that were never one of the scanned files.
* **Added** `playbooks/scheduled-librarian.md` (`status: draft`): the
  `knowledge-librarian.yaml` workflow's two-job privilege split (a read-only
  agent job with no persisted credentials, handing a patch to a privileged
  job that runs no agent code) had no concept at all, despite being the most
  security-sensitive workflow in the repo - `SECURITY.md` documents it in
  prose but nothing in the bundle traced back to it.
* **Added** `policies/ai-covenant.md`, `policies/code-of-conduct.md` (both
  `status: draft`): two governance documents new since the last pass,
  adopted verbatim from the sibling `lokf-agent-skills` repository.
* **Extended** `playbooks/quality-gates.md`: added `.github/dependabot.yml`,
  the mechanism that actually keeps the gate's own SHA pins from going
  stale (`actionlint` catches syntax drift, never staleness).
* **Updated** `playbooks/knowledge-sources.md` with source-map rows for all
  of the above, and re-checked the PyPI `lokf` floor (still `0.7.0`, no
  bump needed).

## 2026-09-11

* **Corrected** `services/lokf-enforcer-plugin.md`, `references/commands-and-settings.md`:
  both described a fourth command, `check-sibling-plugin`, "re-checking for
  an installed OKF validator" via `app.plugins`. That detection
  (`detectOkfValidator`) is commented out in `src/main.ts` - not a public
  API, flagged in community-plugin review - and was never wired to a
  command; only three commands exist (`validate-vault`, `validate-active`,
  `scaffold-root-header`), and the sibling notice now fires unconditionally
  rather than only when the sibling is absent. `README.md` already stated
  this correctly; only the bundle's own concepts had drifted.

* **Corrected** `services/report-view.md`: attributed `processQueue`/batch
  size 50 to `src/report-view.ts` itself. That batching lives in
  `src/main.ts` (see `lokf-enforcer-plugin.md`) and the batch size is the
  user-configurable `batchSize` setting, not a hardcoded constant;
  `report-view.ts` only renders the progress bar it's driven with.

* **Added** `playbooks/quality-gates.md` (`status: draft`): the
  `.github/workflows/lint-and-docs.yaml` CI workflow (ShellCheck,
  actionlint, markdownlint-cli2 + `.markdownlint-cli2.jsonc`, lychee,
  codespell) had no concept and wasn't in the source map, despite being
  committed since 2026-09-08 (`e735ffe`). Extended `knowledge-sources.md`
  with a row for it and its markdownlint config.

* **Re-verified**: `playbooks/contributing.md` (enriched to describe the
  git-ignored-`main.js` "Failed to load plugin" failure mode, matching
  `CONTRIBUTING.md`'s newly added guidance), `playbooks/releasing.md`,
  `services/validator-engine.md`, `services/settings-tab.md`,
  `policies/no-telemetry.md`, `references/lokf-toolkit.md` (PyPI `lokf`
  still at `0.7.0` - `pyproject.toml`'s floor needs no bump) - no other
  drift found. The three external-spec-URL references (LOKF spec, OKF spec,
  Obsidian plugin guidelines) and the glossary/explanation concepts were not
  re-fetched this run and remain unverified.

## 2026-09-10

* **Corrected** the bundle header's `publisher.id`: it declared `type: Person`
  but minted under `org/` (`.../knowledge/org/noelmcloughlin`); now
  `person/noelmcloughlin`, the convention the sibling `lokf-agent-skills`
  bundle uses. The plugin's own scaffold template (`src/main.ts`,
  `scaffold-root-header`) carried the same mismatch and was fixed alongside.

* **Corrected** `playbooks/releasing.md`'s `resource`: it describes the
  PR-based version-bump flow now cites `CONTRIBUTING.md`.

## 2026-09-09

* **Bug fixed**: 6 concepts carried a bare-scalar value on a multivalued
  typed-relation field (`definedBy` on `glossary/lokf.md`, `glossary/okf.md`,
  `references/lokf-specification.md`; `relatedTo` on `references/lokf-toolkit.md`
  and `services/validator-engine.md`; `isPartOf` on `services/report-view.md`,
  `services/settings-tab.md`, `services/validator-engine.md`) - the same bug
  class the 2026-09-08 audit found and fixed elsewhere had recurred. `just
  lokf-validate` now passes again (17/17 concepts). Caught only after bumping
  the `lokf` toolkit floor from `>=0.5.0` to `>=0.7.0` in `.lokf/pyproject.toml`
  (latest PyPI release; no breaking changes noted) surfaced it under the newer
  generated schema.

* **Re-verified**: all 9 resource-bearing concepts backed by a repo-local file
  or by `README.md` (both plugin services, both playbooks with a repo doc
  resource, `references/commands-and-settings.md`, `policies/no-telemetry.md`)
  against their current sources - no drift found - plus `references/lokf-toolkit.md`
  against the live PyPI listing. Recorded a `process:lokf-librarian` `verified`
  event on each. The three concepts whose `resource` is an external spec URL
  (LOKF spec, OKF spec, Obsidian plugin guidelines) were not re-fetched this
  run and were left unverified.

## 2026-09-08 (3)

* **Added** `references/lokf-toolkit.md`: the `.lokf/pyproject.toml` toolkit
  dependency (the `lokf` PyPI package, or its raw LinkML schema as a
  no-Python fallback) was previously conflated with the specification website
  in this bundle's own prose (`.lokf/README.md` called the website "the
  toolkit that does the turning"). Split into its own Reference concept,
  `relatedTo`-linked from `services/validator-engine.md`, and fixed the
  website/toolkit conflation in `.lokf/README.md`.

## 2026-09-08 (2)

* **Gap closed**: the version-history gap flagged in
  [Knowledge sources](playbooks/knowledge-sources.md) - `manifest.json`/the
  `v0.2.0` git tag ahead of `versions.json`/`CHANGELOG.md` - was fixed in the
  host repo (`versions.json` now records `0.2.0`; `CHANGELOG.md` has a
  `## [0.2.0]` entry). Updated the playbook to stop reporting it as open.

## 2026-09-08

* **Initialization**: Bootstrap discovery pass. Scaffolded the LOKF bundle and
  populated it with 16 concepts derived from the lokf-enforcer repository: 4
  services (plugin, validator engine, report view, settings tab), 4 references
  (LOKF spec, OKF spec, Obsidian plugin guidelines, commands and settings), 3
  glossary terms (LOKF, OKF, Diátaxis genre), 3 playbooks (knowledge sources,
  contributing, releasing), 1 policy (no telemetry), and 1 explanation (why
  LOKF Enforcer exists as a layered add-on). `base_iri` is a placeholder
  (`lokf-enforcer.example`) pending a real, owned namespace.
