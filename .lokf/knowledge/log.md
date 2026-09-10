# Change Log

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
