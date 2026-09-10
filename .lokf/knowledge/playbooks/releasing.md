---
type: Playbook
id: https://lokf-enforcer.example/knowledge/playbooks/releasing
title: Releasing
description: PR-based version-bump flow, then a tag push that triggers the hardened GitHub Actions release workflow.
resource: CONTRIBUTING.md
dependsOn:
  - https://lokf-enforcer.example/knowledge/references/obsidian-plugin-guidelines
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-09T00:00:00Z"
---

# Overview

`npm version minor --no-git-tag-version` bumps `package.json`/`manifest.json`/
`versions.json`; `.npmrc`'s `tag-version-prefix=""` keeps a subsequent
`npm version` tag bare (e.g. `0.2.0`, no leading `v`) - Obsidian matches a
release to a plugin version by exact tag equality against `manifest.json`.

`.github/workflows/release.yml` now enforces this itself: a "Verify tag
matches manifest version" step fails the run before any build if the pushed
tag doesn't match. The workflow also runs `step-security/harden-runner` in
audit mode, checks out with `persist-credentials: false`, pins
`actions/checkout`/`actions/setup-node`/`actions/attest` to commit SHAs, and
defaults to `permissions: {}` at the workflow level with
`contents: write`/`id-token: write`/`attestations: write` scoped to just the
one job. The release itself is opened as a **draft** carrying `main.js`,
`manifest.json`, and `styles.css` with build-provenance attestation, for
manual review before publishing.
