---
type: Policy
id: https://lokf-enforcer.example/knowledge/policies/no-telemetry
title: No Telemetry
description: LOKF Enforcer makes no network requests and has no telemetry, analytics, or external services.
resource: README.md
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-11T00:00:00Z"
---

# Overview

The plugin reads Markdown files in the open vault, writes only when the user
explicitly runs the semantic-header command, and stores settings in the
vault's own plugin data. Nothing leaves the machine.
