---
lokf_version: "0.2"
okf_version: "0.2"
base_iri: https://lokf-registrar.example/knowledge/
context: https://w3id.org/lokf/context.jsonld
title: LOKF Registrar Knowledge Bundle
description: Validate the Linked Open Knowledge Format (LOKF) semantic layer on top of OKF v0.2 in Obsidian.
license: https://creativecommons.org/licenses/by/4.0/
publisher:
  type: Person
  id: https://lokf-registrar.example/knowledge/person/noelmcloughlin
  name: Noel McLoughlin
---

# LOKF Registrar Knowledge Bundle

A [LOKF](https://lokf.nolan-nichols.com) knowledge base for the **LOKF Registrar** Obsidian plugin. Every Markdown file under `knowledge/` is one concept; together they form a queryable knowledge graph, derived from this repository's code and docs.

`base_iri` is a placeholder (`lokf-registrar.example`, an RFC 2606 reserved domain) pending a real, owned namespace — see [Knowledge sources](playbooks/knowledge-sources.md).

# Services

* [LOKF Registrar plugin](services/lokf-registrar-plugin.md) - the plugin's lifecycle, commands, and status bar.
* [Validator engine](services/validator-engine.md) - the import-free LOKF rule engine.
* [Report view](services/report-view.md) - the side-panel conformance report.
* [Settings tab](services/settings-tab.md) - the declarative settings UI.

# References

* [LOKF specification](references/lokf-specification.md)
* [LOKF toolkit](references/lokf-toolkit.md)
* [OKF specification](references/okf-specification.md)
* [Obsidian plugin guidelines](references/obsidian-plugin-guidelines.md)
* [Commands and settings](references/commands-and-settings.md)

# Glossary

* [LOKF](glossary/lokf.md)
* [OKF](glossary/okf.md)
* [Diátaxis genre](glossary/diataxis-genre.md)

# Playbooks

* [Knowledge sources](playbooks/knowledge-sources.md)
* [Contributing](playbooks/contributing.md)
* [Releasing](playbooks/releasing.md)
* [Quality gates](playbooks/quality-gates.md)
* [Scheduled librarian](playbooks/scheduled-librarian.md)

# Policies

* [No telemetry](policies/no-telemetry.md)
* [AI Covenant](policies/ai-covenant.md)
* [Code of Conduct](policies/code-of-conduct.md)

# Explanation

* [Why LOKF Registrar](explanation/why-lokf-registrar.md)
