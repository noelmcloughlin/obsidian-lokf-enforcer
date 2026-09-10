---
type: Playbook
id: https://lokf-enforcer.example/knowledge/playbooks/knowledge-sources
title: Knowledge Sources
description: Map of the repository locations this bundle was derived from, and how to re-check each on a future refresh.
generated:
  by: process:lokf-librarian
  at: "2026-09-08T01:00:00Z"
---

# Sources swept for this bootstrap discovery pass

| Source | Yields | Re-check by |
|---|---|---|
| `manifest.json`, `package.json` | plugin identity, version, dependencies | diff against the last recorded `version`/`minAppVersion` |
| `src/main.ts`, `src/validator.ts`, `src/report-view.ts`, `src/settings.ts` | the four Service concepts | re-read each file; a new/removed command, rule group, or settings group is a gap |
| `README.md` | commands/settings tables, privacy stance | diff the Commands/Settings/Privacy sections |
| `CONTRIBUTING.md` | the contributing/releasing playbooks | diff against the current dev-setup and release-flow sections |
| `.github/workflows/build.yml`, `.github/workflows/release.yml` | CI/release facts referenced in the releasing playbook | diff the pinned-action SHAs, permissions, and trigger conditions |
| `scripts/smoke-test.ts` | the plain-Node testability claim in the validator-engine concept | confirm it still imports only from `../src/validator` |
| `CHANGELOG.md`, `versions.json`, `git tag` | release history | see note below |
| PyPI `lokf` package | `.lokf/pyproject.toml`'s `lokf[build]>=` floor | `pip index versions lokf`; bump the floor on a minor/patch release, ask the human first on a major one |

**2026-09-09 re-check**: swept every row above against current repo state -
no drift (all `src/*.ts`, `README.md`, `CONTRIBUTING.md`, `build.yml`, `release.yml` match what their concepts already record). PyPI's `lokf` had moved from `0.5.0` to `0.7.0`; bumped the `pyproject.toml` floor and re-ran `just lokf-validate`, which surfaced 6 concepts with a bare-scalar value on a multivalued relation field under the newer generated schema (fixed; see `log.md`).

No external standards beyond the two already-recorded References (LOKF spec, OKF spec) and Obsidian's own guidelines were found. No `Dataset`, `Table`, `Metric`, `Organization`, or `AttestedComputation` concepts exist yet - this repo has no structured datasets, metrics, or a publishing organization beyond the individual author already recorded as this bundle's `publisher`.
