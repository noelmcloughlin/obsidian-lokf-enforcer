---
type: Playbook
id: https://lokf-registrar.example/knowledge/playbooks/knowledge-sources
title: Knowledge Sources
description: Map of the repository locations this bundle was derived from, and how to re-check each on a future refresh.
generated:
  by: process:lokf-librarian
  at: "2026-09-12T21:00:00Z"
---

# Sources swept for this bootstrap discovery pass

| Source | Yields | Re-check by |
| --- | --- | --- |
| `manifest.json`, `package.json` | plugin identity, version, dependencies | diff against the last recorded `version`/`minAppVersion` |
| `src/main.ts`, `src/validator.ts`, `src/report-view.ts`, `src/settings.ts` | the four Service concepts | re-read each file; a new/removed command, rule group, or settings group is a gap |
| `README.md` | commands/settings tables, privacy stance | diff the Commands/Settings/Privacy sections |
| `CONTRIBUTING.md` | the contributing/releasing playbooks | diff against the current dev-setup and release-flow sections |
| `.github/workflows/build.yml`, `.github/workflows/release.yml` | CI/release facts referenced in the releasing playbook | diff the pinned-action SHAs, permissions, and trigger conditions |
| `.github/workflows/lint-and-docs.yaml`, `.markdownlint-cli2.jsonc` | the quality-gates playbook | diff the three job names/tools and the markdownlint rule overrides |
| `.github/dependabot.yml` | the quality-gates playbook's dependency-freshness paragraph | diff the three `package-ecosystem` entries and their groupings |
| `.github/workflows/knowledge-librarian.yaml`, `.lokf/scripts/knowledge-librarian.sh` | the scheduled-librarian playbook | diff the job split, permissions, and what the wrapper enforces |
| `AI_COVENANT.md`, `CODE_OF_CONDUCT.md` | the two governance policy concepts | diff against the sibling `lokf-agent-skills` copies - both are meant to stay verbatim |
| `scripts/smoke-test.ts` | the plain-Node testability claim in the validator-engine concept | confirm it still imports only from `../src/validator` |
| `docs/for-the-curious.md` (new 2026-09-12, moved out of `README.md`'s former "For the curious" section) | the detailed reasoning behind the checks - what LOKF adds over plain OKF, the OKF v0.2 base-layer rationale, what is deliberately left unchecked, the four-tier trust model | diff against `explanation/why-lokf-registrar.md`'s `sources` list; re-read on every README/docs restructuring |
| `CHANGELOG.md`, `versions.json`, `git tag` | release history | see note below |
| PyPI `lokf` package | `.lokf/pyproject.toml`'s `lokf[build]>=` floor | `pip index versions lokf`; bump the floor on a minor/patch release, ask the human first on a major one |

**2026-09-12 (evening) re-check**: swept `src/main.ts`, `src/validator.ts`,
`src/settings.ts` against the "no bundle" state and the break-glass
`treatVaultRootAsBundle` setting (both new this session, per `CHANGELOG.md`'s
`## [Unreleased]`) - found and corrected drift in `lokf-registrar-plugin.md`,
`validator-engine.md`, `settings-tab.md`, and `references/commands-and-settings.md`
(the command-id table had drifted from `src/main.ts`'s actual ids well before
this session's changes - 15 commands exist, not 3, and several ids named in
the table did not match the source at all). Corrected `playbooks/scheduled-librarian.md`
against this session's security hardening (`SECURITY.md`, the workflow, and
the wrapper script all touched: a third independent write-scope check in
`publish`, a `by: human:` patch guard, and a git-config/hooks snapshot
defence in the wrapper). Added the `docs/` row above for the new
`docs/for-the-curious.md`, and recorded it as an additional `sources` entry
on `explanation/why-lokf-registrar.md`. Re-verified (no drift):
`playbooks/contributing.md`, `policies/no-telemetry.md`,
`playbooks/quality-gates.md` (`.github/dependabot.yml`,
`.github/workflows/lint-and-docs.yaml` unchanged this session).
`playbooks/releasing.md` was already current (dated the same session, ahead
of this refresh) against `semantic-release.yml`'s `--ignore-scripts` addition
and `CHANGELOG.md`'s promoted `## [Unreleased]`. PyPI's `lokf` is still at
`0.7.0` (checked via PyPI's JSON API - `uv pip index versions` is not a
subcommand this environment's `uv 0.12.11` supports); no floor bump needed.
This repository's own git `origin` remote still points at
`https://github.com/noelmcloughlin/obsidian-lokf-enforcer` (the pre-rename
URL) - no concept's `resource`/`documentation` field hardcodes that URL as a
fact, so this is left as a repository-level detail outside this bundle's
remit rather than a concept-level drift to fix.

**2026-09-11 re-check**: swept `src/*.ts` against the six-bug fix pass -
found and corrected drift in `validator-engine.md`, `lokf-registrar-plugin.md`,
and `report-view.md` (see `log.md`). Added three new sources this pass first
surfaced with no concept at all: `.github/dependabot.yml`,
`knowledge-librarian.yaml`'s two-job security split, and the two new
governance documents - all four rows above. PyPI's `lokf` is still at
`0.7.0`; no floor bump needed.

**2026-09-09 re-check**: swept every row above against current repo state -
no drift (all `src/*.ts`, `README.md`, `CONTRIBUTING.md`, `build.yml`, `release.yml` match what their concepts already record). PyPI's `lokf` had moved from `0.5.0` to `0.7.0`; bumped the `pyproject.toml` floor and re-ran `just lokf-validate`, which surfaced 6 concepts with a bare-scalar value on a multivalued relation field under the newer generated schema (fixed; see `log.md`).

**Orphan sweep (2026-09-12 evening).** `src/` now has 23 files; only the four
naming a Service concept (`main.ts`, `validator.ts`, `report-view.ts`,
`settings.ts`) are tracked here individually. The rest (`affordances.ts`,
`concept-modal.ts`, `confirm-modal.ts`, `field-modal.ts`, `fields.ts`,
`finding-modal.ts`, `fixes.ts`, `graph.ts`, `inline.ts`, `locator.ts`,
`lokf-vocab.json`, `propose-modal.ts`, `propose.ts`, `public-api.ts`,
`report-filter.ts`, `suggest-context.ts`, `suggest.ts`, `vocab.ts`) implement
functionality already described at the command/feature level inside the
existing Service concepts (e.g. `propose.ts`/`propose-modal.ts` behind
*Promote body links…*, `public-api.ts` behind the read-only `api` surface) -
consciously left as implementation detail rather than given one concept
each, a pre-existing gap this pass did not introduce. Also consciously left
out: `community-plugin-entry.json`, `NOTICE`, `lychee.toml`,
`.releaserc.json`, `skills-lock.json` - repo plumbing with no independent
knowledge claim beyond what `references/commands-and-settings.md`,
`playbooks/quality-gates.md`, and `playbooks/scheduled-librarian.md` already
attribute to the files that generate or govern them.

No external standards beyond the two already-recorded References (LOKF spec, OKF spec) and Obsidian's own guidelines were found. No `Dataset`, `Table`, `Metric`, `Organization`, or `AttestedComputation` concepts exist yet - this repo has no structured datasets, metrics, or a publishing organization beyond the individual author already recorded as this bundle's `publisher`.
