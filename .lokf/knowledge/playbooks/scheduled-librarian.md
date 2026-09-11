---
type: Playbook
id: https://lokf-enforcer.example/knowledge/playbooks/scheduled-librarian
title: Scheduled Librarian
description: The knowledge-librarian.yaml workflow's two-job privilege split - how a third-party agent proposes bundle changes without ever holding a write-scoped token.
resource: .github/workflows/knowledge-librarian.yaml
dependsOn:
  - https://lokf-enforcer.example/knowledge/references/lokf-toolkit
generated:
  by: process:lokf-librarian
  at: "2026-09-11T12:00:00Z"
status: draft
---

# Overview

`.github/workflows/knowledge-librarian.yaml` runs the `lokf-librarian` skill
on a schedule (Mondays 05:00 UTC) to keep `.lokf/knowledge/` in step with the
repository, then opens a review PR with whatever changed - never pushing to
the default branch or auto-merging, and a no-op when nothing changed. It is
inert until the `KNOWLEDGE_LIBRARIAN_ENABLED` repository variable is set to
`true`.

**Two jobs, split by privilege.** `refresh` runs the agent - third-party
code - under `contents: read` with `persist-credentials: false`, so no git
credential is on disk while it executes; it hands its proposed change to
`publish` as a patch artifact (`git diff --cached --binary`, uploaded and
downloaded across jobs). Only `publish`, which runs no agent code, holds
`contents: write` / `pull-requests: write` to apply the patch, push the
branch, and open the PR. A compromised agent therefore cannot reach a
write-scoped credential at all, rather than being caught only after using
one - the previous single-job design's weaker guarantee.

**Enforced twice, not just requested.** `.lokf/scripts/knowledge-librarian.sh` -
the fixed, reviewed wrapper the workflow always executes, never a
repository variable's content as a shell command - parses `AGENT_CLI`
into a quoted argv array (`read -r -a agent_cmd <<< "$AGENT_CLI"`) rather
than re-expanding it unquoted, so shell metacharacters in that value are
inert arguments, not executed. The wrapper checks the agent didn't write
outside `.lokf/knowledge/`/`.lokf/feedback.md` immediately after it
returns; the `refresh` job's own "Enforce the agent's write scope" step
checks the same boundary again before anything is packaged for `publish`.

See [SECURITY.md](../../../SECURITY.md)'s "Repository hardening" and
"Prompt-injection guards" sections for the full rationale, and
[AI_COVENANT.md](../../../AI_COVENANT.md)'s "Repository-Owned Agent
Automation" for the human-accountability rules this workflow operates
under (bot identity, review always required, verdicts only a person can
record).
