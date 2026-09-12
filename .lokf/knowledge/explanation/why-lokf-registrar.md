---
type: Explanation
id: https://lokf-registrar.example/knowledge/explanation/why-lokf-registrar
title: Why LOKF Registrar
genre: explanation
description: Why the LOKF semantic layer needs its own in-editor check, why the plugin checks the OKF v0.2 base layer itself instead of leaning on a separate validator, why it names no other plugin but its sibling LOKF Curator, and why it is called the registrar.
resource: README.md
sources:
  - resource: README.md
  - resource: docs/for-the-curious.md
about:
  - https://lokf-registrar.example/knowledge/references/okf-specification
  - https://lokf-registrar.example/knowledge/references/lokf-specification
relatedTo:
  - https://lokf-registrar.example/knowledge/services/lokf-registrar-plugin
generated:
  by: process:lokf-librarian
  at: "2026-09-12T21:00:00Z"
status: draft
---

# Overview

Plain OKF is prose + structure; LOKF adds a bundle-root semantic header, a
controlled type vocabulary, typed RDF-backed relationships, and
id/IRI-minting consistency - real, new surface worth its own validator, and
one that has to run *as a person writes*, in the editor, because an Obsidian
vault has no CI gate to catch a malformed record after the fact. That is the
registrar's half of the job the `lokf-agent-skills` README names: keeping
records well-formed, never judging whether they are true.

# Where the detailed reasoning now lives

README.md's own "For the curious" section is now one line pointing at
[docs/for-the-curious.md](../../../docs/for-the-curious.md), which carries
most of what this section below used to draw from README directly - the
checks-added-over-plain-OKF list, the OKF v0.2 base-layer rationale, what is
deliberately left unchecked, and the four-tier trust model. This concept's
"Why the name" and "What it still leaves out" sections still draw on
README.md itself (Credits, Alternative plugins, and the sibling-plugin
framing), so both files are recorded as sources.

# Why it checks the OKF v0.2 base layer itself

Every LOKF field is a slot in the LOKF schema, and the schema subsumes the
plain-OKF v0.2 rules underneath the dialect - a required `type`, the
`Attested Computation` contract, reserved `index.md`/`log.md` structure, the
v0.1→v0.2 migration hints. So the plugin checks them directly (the `okf/*`
rules, gated by `checkOkfBaseLayer`), with severity taken from the spec's own
force, rather than depending on a separate OKF validator that might not be
installed or kept current. An earlier design did the opposite - it treated
itself as a layered add-on, tried to detect an installed OKF validator, and
recommended one when absent. That detection read Obsidian's undocumented
`app.plugins` API (a routine community-review flag), and the recommendation
became moot once the base layer was covered here; both, and the settings
action that deep-linked to a specific validator, were removed on 2026-09-12.
Other OKF v0.2 validators are now mentioned once, in the README's
"Alternative plugins" footnote, as alternatives for that layer - never as
companions or dependencies.

# Why the name

Until 2026-09-12 the plugin was *LOKF Enforcer*; it was renamed before any
release, for two reasons. The job it does is the registrar's - the clerical
role in the `lokf-agent-skills` taxonomy, alongside `lokf validate` and CI's
`knowledge-registrar.yaml` gate - and a registrar keeps records well-formed
and says what it finds, where an enforcer would block: the README's longest
section is on why almost everything here is a warning. And the old name
differed by one letter from an unrelated OKF validator in the community
directory, inviting the reading that this was a fork of it, when the two
share nothing but the base specification. The id (`lokf-registrar`), the
repository (`obsidian-lokf-registrar`), this bundle's namespace, and the
`generated.by` actor on the Diátaxis map all changed with it; nothing had
been published under the old ones.

# What it still leaves out

The credibility *depth* of the §5 trust fields - who vouched, whether a
source is right, which tier a concept has reached - is the sibling
**LOKF Curator**'s surface; this plugin checks only that those fields are
well-shaped. Neither plugin detects, loads, or calls into the other; the
one point of contact is a read-only `api` this plugin offers and nobody is
required to use.
