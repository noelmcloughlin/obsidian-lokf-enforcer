---
type: Reference
id: https://lokf-enforcer.example/knowledge/references/okf-specification
title: OKF Specification (v0.2)
description: The Open Knowledge Format specification - a directory of Markdown + YAML frontmatter, one concept per file, with a non-empty type as the only hard requirement.
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
---

# Overview

OKF v0.2 defines required `type`, and the provenance/trust/lifecycle families
(`generated`, `verified`, `sources`, `status`, `stale_after`) and Attested
Computation shape that LOKF Enforcer deliberately does not check - see
[Why LOKF Enforcer](../explanation/why-lokf-enforcer.md).
[OKF Enforcer](https://github.com/MartinForReal/okf-enforcer) is one existing
validator for this layer.
