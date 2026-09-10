---
lokf_version: "0.2"
okf_version: "0.2"
base_iri: https://lokf-enforcer.example/knowledge/
context: https://w3id.org/lokf/context.jsonld
title: LOKF Enforcer Knowledge Bundle
description: Validate the Linked Open Knowledge Format (LOKF) semantic layer on top of OKF v0.2 in Obsidian.
license: https://creativecommons.org/licenses/by/4.0/
publisher:
  type: Person
  id: https://lokf-enforcer.example/knowledge/person/noelmcloughlin
  name: Noel McLoughlin
---

# LOKF Enforcer Knowledge Bundle

A [LOKF](https://lokf.nolan-nichols.com) knowledge base for the **LOKF Enforcer** Obsidian plugin. Every Markdown file under `knowledge/` is one concept; together they form a queryable knowledge graph, derived from this repository's code and docs.

`base_iri` is a placeholder (`lokf-enforcer.example`, an RFC 2606 reserved domain) pending a real, owned namespace — see [Knowledge sources](playbooks/knowledge-sources.md).

# Services

* [LOKF Enforcer plugin](services/lokf-enforcer-plugin.md) - the plugin's lifecycle, commands, and status bar.
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

# Policies

* [No telemetry](policies/no-telemetry.md)

# Explanation

* [Why LOKF Enforcer](explanation/why-lokf-enforcer.md)
