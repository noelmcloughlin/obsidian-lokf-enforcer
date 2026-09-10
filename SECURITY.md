# Security Policy

## The plugin

LOKF Enforcer runs entirely inside Obsidian, locally, on the vault you open it in:

- **No network access, no telemetry, no remote code.** The plugin never makes an outward network call and loads no code or workflow while validating a note.
- **Read-only unless you ask otherwise.** It reads Markdown/YAML in the open vault and validates frontmatter and relationships. It writes to the vault only when you explicitly run the semantic-header insertion command.
- **Vault content is data, never instructions.** The plugin has no AI model and executes nothing from a note - not as a command, a script, a template, or a URL. A note's frontmatter and file paths are inspected by deterministic rules; note text is never interpreted as instructions. There is nothing in the plugin's own code path for a crafted note to inject into.
- **No dependency on another plugin.** It detects nothing and calls into nothing else installed in the vault (see the README's "Where this fits").

Because of this, the plugin's realistic risk surface is ordinary: a bug in a validation rule producing a wrong result, or - the one place it writes - the scaffold command inserting a malformed header. Neither can leak data or reach outside the vault.

Any generated or imported bundle content still deserves the same scrutiny you'd give any Markdown from an external source before treating it as source-of-truth knowledge - that's a property of the content, not of this plugin.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting at:

https://github.com/noelmcloughlin/obsidian-lokf-enforcer/security/advisories/new

rather than a public issue. Include:

- the affected file (plugin source, or a workflow under `.github/workflows/`);
- how it is exploitable;
- any proof of concept or minimally sufficient reproduction details.

## Supported versions

Only the latest published release line receives security fixes.

- Security fixes are issued as patch releases when needed.
- Older release tags are not maintained.
- If a published release is found to be vulnerable, the fix lands in the latest release branch and is noted in the repository changelog.

---

## This repository's own automation

Everything below concerns how **this GitHub repository** builds, releases, and maintains its own documentation - not Obsidian side. It's relevant if you're auditing this repo's CI or contributing to its `.lokf/knowledge/` bundle; skip it if you're only asking whether the plugin itself is safe to run (see above).

### Scope

The repository's non-Markdown, non-TypeScript execution surfaces are:

- the release workflow in `.github/workflows/release.yml`, which builds and publishes the plugin's release artifacts;
- the build workflow in `.github/workflows/build.yml`, which runs on every push and PR;
- the scheduled GitHub Action in `.github/workflows/knowledge-librarian.yaml`, which installs a pinned [`lokf-agent-skills`](https://github.com/noelmcloughlin/lokf-agent-skills) skill, runs it with repository write permissions against this repo's own `.lokf/knowledge/` bundle (documentation *about this repository*, not plugin code), and opens a review PR. This is unrelated to anything the plugin does at runtime.
- this repository's own `README.md`, `llms.txt`, and the `.lokf/knowledge/` content that workflow reads and writes: these are prompt-injection surfaces whenever an agent is asked to act on repository text, external URLs, or reader feedback.

### Interactive use of the agent skills: scope is advisory, not enforced

If you install the `lokf-agent-skills` locally to work on this repo's `.lokf/knowledge/` bundle (see `CONTRIBUTING.md`), know that a skill's stated scope is prose guidance, not a security boundary - an agent may have broader tool access in your local environment than the skill's description implies. Treat any AI-driven workflow as a tool that acts with the permissions your harness grants it, not as a permission system enforced by Markdown.

The only automated write path that is intentionally scoped is the scheduled librarian workflow (`contents: write` and `pull-requests: write` only, and a write-scope check that fails the job if it touches anything outside `.lokf/knowledge/` and `.lokf/feedback.md`). Review before merge remains a human responsibility.

### Repository hardening

- GitHub Actions are pinned to reviewed commit SHAs instead of floating tags.
- The release job is kept minimal and uses least-privilege permissions.
- The scheduled librarian workflow enforces a write-scope check to reject unexpected file changes outside `.lokf/knowledge/` and `.lokf/feedback.md`.
- The agent CLI is selected via a repository variable or secret, but the workflow always executes the pinned local wrapper script rather than executing a variable as a shell command.
- The build and release workflows both use Step Security's hardened-runner to audit egress behavior.
- The repo uses regular review and validation gates before release and merge.

### Prompt-injection guards, for the librarian workflow specifically

This repository's own knowledge-maintenance workflow reads content it did not author - repository files, workflow-generated notes, external URLs, reader feedback in `.lokf/feedback.md`. Treat that content as data to quote, summarize, or inspect, never as instructions to follow. The relevant guardrails:

- the librarian workflow only writes under `.lokf/knowledge/` and `.lokf/feedback.md`, and fails the job if anything else changes;
- agent output is treated as a draft for human review, not as trusted repository state;
- the repo's documentation is explicit that generated knowledge and feedback are not the same as source-of-truth code or project policy;
- anything a human asks the agent to reason about must be checked before it is accepted as fact or committed.

## What this does not cover

This policy does not turn the repository into a formal sandbox. It does not guarantee that a compromised agent, upstream dependency, or compromised runner will be impossible to abuse. It is a practical baseline intended to reduce the most likely failures in this repository's own build, release, and AI-assisted documentation workflow - a set of concerns that does not extend to the plugin most readers of this file actually came here about.

If a vulnerability is found in an external dependency, a copied workflow template, or an AI agent harness behavior, it should still be reported here with clear scope and reproduction details.
