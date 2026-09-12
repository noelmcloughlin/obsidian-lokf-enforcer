---
type: Playbook
id: https://lokf-registrar.example/knowledge/playbooks/releasing
title: Releasing
description: Semantic-release computes the version and promotes CHANGELOG.md on merge to main, behind a required-reviewer Environment; the resulting tag invokes the same hardened build-and-attest workflow a hand-pushed tag always has.
resource: CONTRIBUTING.md
dependsOn:
  - https://lokf-registrar.example/knowledge/references/obsidian-plugin-guidelines
generated:
  by: process:lokf-librarian
  at: "2026-09-12T18:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-12T18:00:00Z"
---

# Overview

A person no longer picks the version. `semantic-release.yml`'s `release` job
runs on every push to `main`, behind the `release` GitHub Environment
(required reviewers configured in this repository's own settings, not by
the workflow file): `@semantic-release/commit-analyzer` computes the next
version from Conventional Commits since the last tag; `@semantic-release/exec`
runs `.github/scripts/changelog-release.mjs` as its `verifyRelease`,
`generateNotes`, and `prepare` hooks, which refuses the run if this
repository's `CHANGELOG.md` `## [Unreleased]` section is empty, uses it as
the release notes, and then retitles it to a dated heading with a fresh
empty one above; `@semantic-release/npm` (`npmPublish: false`) bumps
`package.json` via `npm version <ver> --no-git-tag-version`, which still
triggers the existing `version` script - `manifest.json` and `versions.json`
update exactly as they did under a hand-run `npm version`, `.npmrc`'s
`tag-version-prefix=""` included, so the tag stays bare (Obsidian matches a
release to a plugin version by exact tag equality). `@semantic-release/git`
commits those files; semantic-release's own core then creates and pushes
that bare tag. The tool itself is installed at exact pinned versions inside
the workflow, never added to `package.json`.

That push then invokes `release.yml` directly, via a `workflow_call` trigger
added alongside its original `push: tags:` one - needed because a tag pushed
with the default `GITHUB_TOKEN` does not itself re-trigger another
workflow's `push` event (GitHub's own loop prevention). `release.yml` is
otherwise unchanged and still works standalone for a hand-pushed tag: its
"Verify tag matches manifest version" step, `step-security/harden-runner` in
audit mode, `persist-credentials: false`, SHA-pinned actions, and
`permissions: {}` defaulting to a scoped `contents: write` /
`id-token: write` / `attestations: write` on the one job that needs them are
all exactly as before. The release itself is still opened as a **draft**
carrying `main.js`, `manifest.json`, and `styles.css` with build-provenance
attestation, for manual review before publishing - the same human checkpoint
this playbook has always ended on, now with a second one (the Environment
approval) in front of it.

A `pull_request`-triggered `plan` job in `semantic-release.yml` previews
every PR into `main` with `--dry-run` - no write scope, no commit, no tag -
so a malformed commit message or a broken exec script surfaces in review.
