---
type: Reference
id: https://lokf-registrar.example/knowledge/references/lokf-specification
title: LOKF Specification
description: The Linked Open Knowledge Format specification - a semantic profile of OKF binding fields and relationships to schema.org/DCAT/PROV-O.
resource: https://lokf.nolan-nichols.com/specification/
definedBy:
  - https://lokf.nolan-nichols.com/specification/
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
---

# Overview

LOKF is a semantic profile of OKF: the same directory-of-Markdown convention,
plus a bundle-root semantic header, a controlled type vocabulary (14
classes), typed RDF-backed relationships, and id/IRI-minting rules.
`src/validator.ts` implements Golden Rules 2-5 of this specification; Golden
Rule 6 (trust/provenance/lifecycle) is OKF v0.2's own and is deliberately left
to a separately installed OKF validator.
