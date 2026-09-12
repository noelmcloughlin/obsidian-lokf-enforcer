---
type: Policy
id: https://lokf-registrar.example/knowledge/policies/ai-covenant
title: AI Covenant
description: Contributors own what they submit regardless of which tools helped write it; AI may support but never proxy discussion; a repository-owned agent commits under a bot identity through a reviewed PR and never self-awards a human verdict.
resource: AI_COVENANT.md
generated:
  by: process:lokf-librarian
  at: "2026-09-11T12:00:00Z"
status: draft
---

# Overview

Adopted verbatim (aside from repo-specific links) from the sibling
[lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills)
repository's own `AI_COVENANT.md`, so both projects hold contributors to one
standard. Its "Repository-Owned Agent Automation" section is the part this
repository's own CI actually implements: see
[Scheduled Librarian](../playbooks/scheduled-librarian.md) for how
`knowledge-librarian.yaml` is held to it (bot identity, mandatory PR review,
and never writing a `human:` verdict itself).
