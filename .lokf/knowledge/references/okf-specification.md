---
type: Reference
id: https://lokf-registrar.example/knowledge/references/okf-specification
title: OKF Specification (v0.2)
description: The Open Knowledge Format specification - a directory of Markdown + YAML frontmatter, one concept per file, with a non-empty type as the only hard requirement.
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
generated:
  by: process:lokf-librarian
  at: "2026-09-12T17:00:00Z"
---

# Overview

OKF v0.2 defines required `type`, the provenance/trust/lifecycle families
(`generated`, `verified`, `sources`, `status`, `stale_after`), and Attested
Computation shape. LOKF Registrar checks the *shape* of the trust/lifecycle
family (in a bundle that uses it) and, since 0.4.0, the plain-OKF rules the
LOKF schema subsumes - required `type`, Attested Computation shape, reserved
`index.md`/`log.md` structure - with severity taken from the spec's own
force; see [Why LOKF Registrar](../explanation/why-lokf-registrar.md).
[OKF Enforcer](https://github.com/MartinForReal/okf-enforcer) is one existing
validator for this layer.
