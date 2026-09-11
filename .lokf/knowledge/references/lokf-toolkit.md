---
type: Reference
id: https://lokf-enforcer.example/knowledge/references/lokf-toolkit
title: LOKF Toolkit
description: The `lokf` PyPI package this sidecar's tooling actually depends on and invokes - distinct from the specification website.
resource: https://pypi.org/project/lokf/
sources:
  - resource: https://raw.githubusercontent.com/nicholsn/lokf/main/lokf.yaml
    title: lokf.yaml (raw LinkML schema, no-Python fallback)
relatedTo:
  - https://lokf-enforcer.example/knowledge/references/lokf-specification
generated:
  by: process:lokf-librarian
  at: "2026-09-08T02:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-11T00:00:00Z"
---

# Overview

`.lokf/pyproject.toml` declares `lokf[build]>=0.7.0`; `just lokf-install` /
`just lokf-validate` / `just lokf-convert` / `just lokf-serve` all invoke this
package via `uv run lokf ...`. It is a separate resource from
[LOKF specification](lokf-specification.md) (lokf.nolan-nichols.com), which
documents what LOKF *means* and its own, broader environment-bootstrap flow
that this sidecar does not follow - conflating the two would misattribute the
actual tooling dependency to a website that doesn't host it.

When `uv`/Python isn't available, the raw LinkML schema
(`lokf.yaml`, linked above as a source) can be fetched directly for a manual
structural cross-check - not a substitute for `lokf validate`'s generated
JSON Schema/SHACL checks, just enough to catch an obviously wrong class or
field name.

**Not to be confused with** [Validator Engine](../services/validator-engine.md)
(`src/validator.ts`) - the LOKF Enforcer *plugin*'s own independent TypeScript
reimplementation of the same Golden Rules, used at vault-scan time and having
no runtime dependency on this Python package at all. This toolkit is used only
to maintain *this* `.lokf/` sidecar bundle itself.
