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

OKF v0.2 defines required `type`, the provenance/trust/lifecycle families
(`generated`, `verified`, `sources`, `status`, `stale_after`), and Attested
Computation shape. LOKF Enforcer checks the *shape* of the trust/lifecycle
family (a bundle that uses it) but deliberately does not check required
`type` or Attested Computation shape - see
[Why LOKF Enforcer](../explanation/why-lokf-enforcer.md).
[OKF Enforcer](https://github.com/MartinForReal/okf-enforcer) is one existing
validator for this layer.
