---
type: Service
id: https://lokf-enforcer.example/knowledge/services/validator-engine
title: Validator Engine
description: Import-free LOKF semantic-layer rule engine - bundle-root header, type vocabulary, typed relationships, and id/IRI-minting consistency.
resource: src/validator.ts
isPartOf:
  - https://lokf-enforcer.example/knowledge/services/lokf-enforcer-plugin
about:
  - https://lokf-enforcer.example/knowledge/references/lokf-specification
relatedTo:
  - https://lokf-enforcer.example/knowledge/references/lokf-toolkit
generated:
  by: process:lokf-librarian
  at: "2026-09-08T02:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-09T00:00:00Z"
---

# Overview

`src/validator.ts` is deliberately import-free - no Obsidian, no YAML parser -
so it runs unchanged under Obsidian and under plain Node
(`scripts/smoke-test.ts`). Callers hand in already-parsed frontmatter.

It implements four rule groups against LOKF v0.2: the bundle-root semantic
header (`validateRootHeader`), the type vocabulary and type-specific fields
(`validateTypeVocabulary`), typed relationships with target-existence checking
(`validateRelationships`), and id/IRI-minting consistency
(`validateConceptId`). It deliberately does **not** reimplement anything OKF
v0.2 already covers - required `type`, provenance/trust/lifecycle, Attested
Computation, `index.md`/`log.md` structure - that is the installed OKF
validator's job (see [Why LOKF Enforcer](../explanation/why-lokf-enforcer.md)).

Frontmatter values are never assumed to be strings: a scalar (string, number,
or boolean) is coerced to text for messages, while a mapping or list is named
by its shape (`<a mapping>`, `<a list>`) rather than risking
`[object Object]` in a validation message.

An independent TypeScript reimplementation of the spec, not a wrapper around
the [LOKF toolkit](../references/lokf-toolkit.md) - this file has no runtime
dependency on that Python package. The two happen to validate the same rules
in different languages for different purposes: this one runs at Obsidian
vault-scan time; the Python toolkit maintains this `.lokf/` sidecar itself.
