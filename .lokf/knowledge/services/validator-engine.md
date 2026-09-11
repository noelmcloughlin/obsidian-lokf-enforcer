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
  at: "2026-09-11T12:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-11T12:00:00Z"
---

# Overview

`src/validator.ts` is deliberately import-free - no Obsidian, no YAML parser -
so it runs unchanged under Obsidian and under plain Node
(`scripts/smoke-test.ts`). Callers hand in already-parsed frontmatter.

It implements five rule groups against LOKF v0.2: the bundle-root semantic
header (`validateRootHeader`), the type vocabulary and type-specific fields
(`validateTypeVocabulary`), typed relationships with target-existence checking
(`validateRelationships`), id/IRI-minting consistency
(`validateConceptId`), and the *shape* of the OKF v0.2 §5 trust/lifecycle
fields a bundle uses (`validateTrustLifecycle`). It deliberately does **not**
reimplement anything OKF v0.2 already covers - required `type`, Attested
Computation, `index.md`/`log.md` structure, or the credibility *depth* of the
§5 fields - that is the installed OKF validator's job (see
[Why LOKF Enforcer](../explanation/why-lokf-enforcer.md)).

Frontmatter values are never assumed to be strings: a scalar (string, number,
or boolean) is coerced to text for messages, while a mapping or list is named
by its shape (`<a mapping>`, `<a list>`) rather than risking
`[object Object]` in a validation message. `type` gets the same treatment: a
list or mapping is a shape warning of its own, while a coercible scalar
(`type: 123`) reads as text and falls through to the ordinary
"not in the vocabulary" warning - only a genuinely missing or blank `type` is
silent, since that's the installed OKF validator's error to raise.

Each of the ten Golden-Rule-4 relation fields (`dependsOn`, `references`, …)
must be a YAML list even for a single target - the generated LOKF schema
requires it, so a bare scalar there passes this plugin clean but fails real
`lokf validate`. That mismatch bit this bundle twice (see `log.md`,
2026-09-09) before the rule engine itself learned to warn on it; a bare
scalar now surfaces in the editor, naming the field and showing the list
form, rather than only in CI.

`excludeFolders` accepts the same spellings a bundle-root folder does
(trailing/leading slash, surrounding whitespace, a `./` prefix) via the same
normalizer - a folder written with a trailing slash used to exclude nothing
at all. The `base_iri` authority-denylist check compares the URL's
`hostname`, not `host`, so a denylisted domain on a non-default port
(`https://github.com:8080/...`) can no longer slip past it.

An independent TypeScript reimplementation of the spec, not a wrapper around
the [LOKF toolkit](../references/lokf-toolkit.md) - this file has no runtime
dependency on that Python package. The two happen to validate the same rules
in different languages for different purposes: this one runs at Obsidian
vault-scan time; the Python toolkit maintains this `.lokf/` sidecar itself.
