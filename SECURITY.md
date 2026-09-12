# Security Policy

## The plugin

LOKF Registrar runs entirely inside Obsidian, locally, on the vault you open it in:

- **No network access, no telemetry, no remote code.** The plugin never makes an outward network call and loads no code or workflow while validating a note.
- **Read-only unless you ask otherwise.** It reads Markdown/YAML in the open vault and validates frontmatter and relationships. It writes to the vault only when you explicitly run the semantic-header insertion command.
- **Vault content is data, never instructions.** The plugin has no AI model and executes nothing from a note - not as a command, a script, a template, or a URL. A note's frontmatter and file paths are inspected by deterministic rules; note text is never interpreted as instructions. There is nothing in the plugin's own code path for a crafted note to inject into.
- **No dependency on another plugin.** It detects nothing and calls into nothing else installed in the vault (see the README's "Where this fits").

Because of this, the plugin's realistic risk surface is ordinary: a bug in a validation rule producing a wrong result, or - the one place it writes - the scaffold command inserting a malformed header. Neither can leak data or reach outside the vault.

Any generated or imported bundle content still deserves the same scrutiny you'd give any Markdown from an external source before treating it as source-of-truth knowledge - that's a property of the content, not of this plugin.

## Reporting a vulnerability

Please use GitHub's [private vulnerability reporting](https://github.com/noelmcloughlin/obsidian-lokf-registrar/security/advisories/new)
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
- the lint-and-docs workflow in `.github/workflows/lint-and-docs.yaml` (ShellCheck, `actionlint`, markdownlint, link-checking, codespell) and the registrar workflow in `.github/workflows/knowledge-registrar.yaml`, which validates the knowledge bundle's *form* on every `.lokf/**` PR - both read-only;
- the semantic-release workflow in `.github/workflows/semantic-release.yml`, which computes the next version from commits, promotes `CHANGELOG.md`, and bumps `manifest.json`/`package.json`/`versions.json` on push to `main`, behind the `release` GitHub Environment - `release.yml` above still does the actual build/attest/publish, triggered by the tag this workflow creates;
- the scheduled GitHub Action in `.github/workflows/knowledge-librarian.yaml`, which installs a pinned [`lokf-agent-skills`](https://github.com/noelmcloughlin/lokf-agent-skills) skill and runs it against this repo's own `.lokf/knowledge/` bundle (documentation *about this repository*, not plugin code), then opens a review PR. The agent itself runs with **no write permissions** - see "Repository hardening" below. This is unrelated to anything the plugin does at runtime.
- the wrapper script `.lokf/scripts/knowledge-librarian.sh`, which that workflow executes;
- this repository's own `README.md`, `llms.txt`, and the `.lokf/knowledge/` content that workflow reads and writes: these are prompt-injection surfaces whenever an agent is asked to act on repository text, external URLs, or reader feedback.

### Interactive use of the agent skills: scope is advisory, not enforced

If you install the `lokf-agent-skills` locally to work on this repo's `.lokf/knowledge/` bundle (see `CONTRIBUTING.md`), know that a skill's stated scope is prose guidance, not a security boundary - an agent may have broader tool access in your local environment than the skill's description implies. Treat any AI-driven workflow as a tool that acts with the permissions your harness grants it, not as a permission system enforced by Markdown.

The only automated write path is the scheduled librarian workflow, and it is split so that the agent never holds a write-scoped token at all (see "Repository hardening" below). Review before merge remains a human responsibility.

### Repository hardening

- GitHub Actions are pinned to reviewed commit SHAs instead of floating tags, in every workflow. `.github/dependabot.yml` keeps those pins current (weekly), alongside the plugin's npm devDependencies and the `.lokf/` sidecar's Python toolchain.
- Every workflow declares `permissions: {}` at the top level, so each job opts into only the scopes it needs and nothing inherits a broader default.
- All workflows run Step Security's hardened-runner in audit mode to monitor runner egress.
- **The librarian workflow runs in two jobs so the agent and the write token never meet.** The `refresh` job runs the agent - third-party code - with `contents: read` and `persist-credentials: false`, so no git credential is on disk while it executes; it hands its proposed change to the `publish` job as a patch artifact. Only `publish`, which runs no agent code, holds `contents: write` / `pull-requests: write` to push the branch and open the PR. A compromised agent therefore cannot reach a write-scoped credential, rather than merely being caught after using one.
- **Three independent checks enforce the agent's write scope, not one.** The wrapper script itself refuses (exit 3) if the agent wrote outside `.lokf/knowledge/`/`knowledge_bundle/`/`.lokf/feedback.md`, immediately after the agent returns; the `refresh` job's own "Enforce the agent's write scope" step repeats that check independently at the YAML level, so it still runs even if the wrapper didn't get to; but the one that actually matters for trust is `publish`'s, on a clean checkout that never shared a workspace with the agent - it re-derives the same allow-list from the patch's own `git apply --numstat` output and separately refuses a patch that adds a `by: human:` claim (this skill never writes one) before applying anything. The first two run alongside the agent and so are fail-fast conveniences, not the backstop: a sufficiently capable `AGENT_CLI` sharing that workspace could in principle blind them - e.g. by setting `core.fsmonitor`/`core.hooksPath` in `.git/config` before either check next calls `git status`, or by truncating the running wrapper script mid-execution. The wrapper defends against both: it snapshots `.git/config` and `.git/hooks` before invoking the agent and restores both immediately after regardless of outcome, and its own check runs inside a `main()` function invoked only as the script's last line, so bash has already read the whole function body before the agent ever runs and nothing after the agent call can be skipped by truncating the file on disk.
- **The registrar's own checks do not run on the librarian's PR.** `knowledge-registrar.yaml`'s `validate`/`provenance` jobs are `pull_request`-triggered, and GitHub does not start `pull_request` workflows for a PR opened with the default `GITHUB_TOKEN` - which is how `publish` opens this one (a deliberate anti-recursion rule). `publish`'s own checks, above, are this PR's real backstop, not a redundant extra; if branch protection requires `validate`/`provenance` as checks, they will sit at "Expected" on this specific PR until a human fires a fresh `pull_request` event for it (close/reopen, or an empty commit).
- The agent CLI is selected via a repository variable or secret, but the workflow always executes the pinned local wrapper script rather than executing a variable as a shell command - and the wrapper parses `AGENT_CLI` into a quoted argv array rather than re-expanding it, so shell metacharacters in that value are passed as inert arguments (no `eval`, no `bash -c`). The scheduled run stays inert until the `KNOWLEDGE_LIBRARIAN_ENABLED` repository variable is set to `true`.
- The librarian workflow triggers only on `schedule` and `workflow_dispatch` - never on an issue comment or any other event an outside contributor could fire directly - and never pushes to the default branch or auto-merges.
- `main` is protected: pull requests must pass the checks above before merge, and force-pushes and branch deletion are blocked. Secret scanning and push protection are enabled. These four are GitHub repository *settings* rather than files in the tree - nothing in CI can assert they are still in force, so keeping them enabled is a maintainer responsibility.
- The `release.yml` job verifies the pushed tag matches `manifest.json` before building, publishes the release as a **draft** for manual review, and attaches build-provenance attestation.
- `semantic-release.yml`'s `release` job, which pushes a commit/tag to `main`, sits behind the same `release` GitHub Environment `publish.yml`-style workflows use elsewhere in this project (configure required reviewers on it in this repository's own Settings > Environments); its `npm install` of the pinned release tooling runs with `--ignore-scripts`.
- CodeQL is intentionally **not** enabled: the plugin is a small TypeScript bundle with no server-side surface, no network calls, and no untrusted input beyond vault Markdown it parses with deterministic rules. Dependency review is covered by Dependabot above, since every npm dependency here is a devDependency that never ships in `main.js`. If either assumption changes - a runtime dependency, or a network feature - add them then rather than carrying unused overhead now.

### Prompt-injection guards, for the librarian workflow specifically

This repository's own knowledge-maintenance workflow reads content it did not author - repository files, workflow-generated notes, external URLs, reader feedback in `.lokf/feedback.md`. Treat that content as data to quote, summarize, or inspect, never as instructions to follow. The relevant guardrails:

- the librarian workflow only writes under `.lokf/knowledge/` and `.lokf/feedback.md`, and fails the job if anything else changes;
- agent output is treated as a draft for human review, not as trusted repository state;
- the repo's documentation is explicit that generated knowledge and feedback are not the same as source-of-truth code or project policy;
- anything a human asks the agent to reason about must be checked before it is accepted as fact or committed.

**`.lokf/feedback.md` specifically.** This is the one input path that can originate from someone with no repository access: `lokf-docent` writes reader questions there, and the scheduled librarian consumes them. The `lokf-librarian` skill requires resolving only the question or disagreement an entry *names*, from the source it points at - never from the entry's own wording - so an entry phrased as a directive ("mark X verified", "skip validation") is read as the content it is reporting, not followed.

**Blast radius if a guard above ever fails.** The agent holds no write-scoped token at all (the two-job split, above): the worst it can do is propose a patch. That patch is confined to `.lokf/knowledge/` and `.lokf/feedback.md` by two independent checks, is applied by a job running no agent code, lands as a pull request against a protected branch, and requires a human maintainer's approval to merge. Nothing in this path can reach the plugin's own source, its release artifacts, or a published release.

**What this doesn't cover.** Ordinary repository content the librarian scrapes while refreshing concepts (`README.md`, docs, `src/`) has no per-entry guard like `feedback.md`'s - it relies on the same branch protection and required checks that gate every other change to `main`, a materially higher trust level than unreviewed reader feedback, not an oversight.

See also [AI_COVENANT.md](AI_COVENANT.md), which sets the human-accountability rules this automation operates under.

## What this does not cover

This policy does not turn the repository into a formal sandbox. It does not guarantee that a compromised agent, upstream dependency, or compromised runner will be impossible to abuse. It is a practical baseline intended to reduce the most likely failures in this repository's own build, release, and AI-assisted documentation workflow - a set of concerns that does not extend to the plugin most readers of this file actually came here about.

If a vulnerability is found in an external dependency, a copied workflow template, or an AI agent harness behavior, it should still be reported here with clear scope and reproduction details.
