---
type: Playbook
id: https://lokf-registrar.example/knowledge/playbooks/scheduled-librarian
title: Scheduled Librarian
description: The knowledge-librarian.yaml workflow's two-job privilege split - how a third-party agent proposes bundle changes without ever holding a write-scoped token.
resource: .github/workflows/knowledge-librarian.yaml
dependsOn:
  - https://lokf-registrar.example/knowledge/references/lokf-toolkit
generated:
  by: process:lokf-librarian
  at: "2026-09-12T21:00:00Z"
status: draft
---

# Overview

`.github/workflows/knowledge-librarian.yaml` runs the `lokf-librarian` skill
on a schedule (Mondays 05:00 UTC) to keep `.lokf/knowledge/` in step with the
repository, then opens a review PR with whatever changed - never pushing to
the default branch or auto-merging, and a no-op when nothing changed. It is
inert until the `KNOWLEDGE_LIBRARIAN_ENABLED` repository variable is set to
`true`. `AGENT_CLI` is read from a repository variable or, as a fallback,
a repository secret (`vars.AGENT_CLI || secrets.AGENT_CLI`).

**Two jobs, split by privilege.** `refresh` runs the agent - third-party
code - under `contents: read` with `persist-credentials: false`, so no git
credential is on disk while it executes; it hands its proposed change to
`publish` as a patch artifact (`git diff --cached --binary`, uploaded and
downloaded across jobs). Only `publish`, which runs no agent code, holds
`contents: write` / `pull-requests: write` to apply the patch, push the
branch, and open the PR. A compromised agent therefore cannot reach a
write-scoped credential at all, rather than being caught only after using
one - the previous single-job design's weaker guarantee.

**Three independent checks enforce the agent's write scope, not two.**
`.lokf/scripts/knowledge-librarian.sh` - the fixed, reviewed wrapper the
workflow always executes, never a repository variable's content as a shell
command - parses `AGENT_CLI` into a quoted argv array
(`read -r -a agent_cmd <<< "$AGENT_CLI"`) rather than re-expanding it
unquoted, so shell metacharacters in that value are inert arguments, not
executed. Inside the wrapper, the agent invocation and its post-run write-scope
check both live in a `main()` function called only as the script's last
line, so bash has read the whole function body before the agent ever runs -
nothing after the agent call can be skipped by an agent that truncates the
running script mid-execution. The wrapper also snapshots `.git/config` and
`.git/hooks` before invoking the agent and restores both unconditionally
afterwards, so an agent that sets `core.fsmonitor`/`core.hooksPath` or drops
a hook cannot hijack a later `git status` this script or the workflow runs
in the same checkout. The `refresh` job's own "Enforce the agent's write
scope" step repeats the boundary check again at the YAML level. But the
check that actually matters for trust is `publish`'s: on a clean checkout
that never shared a workspace with the agent, it re-derives the same
`.lokf/knowledge/` / `knowledge_bundle/` / `.lokf/feedback.md` allow-list
from the patch's own `git apply --numstat` output, and separately refuses
(`grep -Eq '^\+ *-? *by: *human:'`) a patch that adds a `by: human:` claim -
this skill never writes one (see `lokf-librarian`'s `SKILL.md`) - before
applying anything. The first two checks run alongside the agent and are
fail-fast conveniences, not the backstop.

**The registrar's own CI checks do not run on the librarian's PR.**
`knowledge-registrar.yaml`'s `validate`/`provenance` jobs are
`pull_request`-triggered, and GitHub does not start `pull_request` workflows
for a PR opened with the default `GITHUB_TOKEN` (anti-recursion). `publish`'s
checks above are this PR's real backstop; if branch protection requires
`validate`/`provenance`, they sit at "Expected" until a human fires a fresh
`pull_request` event (close/reopen, or an empty commit).

See [SECURITY.md](../../../SECURITY.md)'s "Repository hardening" and
"Prompt-injection guards" sections for the full rationale, and
[AI_COVENANT.md](../../../AI_COVENANT.md)'s "Repository-Owned Agent
Automation" for the human-accountability rules this workflow operates
under (bot identity, review always required, verdicts only a person can
record).
