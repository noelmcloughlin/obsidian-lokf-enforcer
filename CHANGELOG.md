# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
