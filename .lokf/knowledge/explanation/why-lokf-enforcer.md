---
type: Explanation
id: https://lokf-enforcer.example/knowledge/explanation/why-lokf-enforcer
title: Why LOKF Enforcer
genre: explanation
description: Why this is a layered add-on rather than a reimplementation of an OKF validator.
about:
  - https://lokf-enforcer.example/knowledge/references/okf-specification
  - https://lokf-enforcer.example/knowledge/references/lokf-specification
generated:
  by: process:lokf-librarian
  at: "2026-09-08T00:00:00Z"
---

# Overview

Plain OKF is prose + structure; LOKF adds a bundle-root semantic header, a
controlled type vocabulary, typed RDF-backed relationships, and
id/IRI-minting consistency - real, new surface worth its own validator. But
OKF v0.2 also defines required `type`, provenance/trust/lifecycle, and
Attested Computation - already fully owned by an installed OKF validator
(such as [OKF Enforcer](https://github.com/MartinForReal/okf-enforcer)).
Reimplementing that logic here would mean maintaining two copies of the same
rules in two repos.

LOKF Enforcer is therefore a **layered add-on**: it detects whether an OKF
v0.2 validator is installed and enabled (a soft, presence-only, runtime check
against Obsidian's undocumented `app.plugins` API), recommends one if absent,
and keeps working - with narrower coverage - either way. It never requires,
loads, or calls into that other plugin's code.
