# LOKF Enforcer

An [Obsidian](https://obsidian.md) plugin that validates the **Linked Open Knowledge Format (LOKF)** semantic layer across your vault - on top of, not instead of, the Open Knowledge Format (OKF) v0.2 that [OKF Enforcer](https://github.com/MartinForReal/okf-enforcer) (or any other OKF v0.2 validator) already checks.

## For AI Agents

If `.lokf/knowledge/index.md` exists in this repository, read it first. It is a queryable [LOKF](https://lokf.nolan-nichols.com) knowledge bundle containing repository-specific context, conventions, and typed relationships intended for agents.

## What LOKF adds over plain OKF

[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) gives you *prose + structure*: a directory of Markdown files, one concept per file, each with a YAML frontmatter block whose only hard requirement is a non-empty `type`.

[LOKF](https://lokf.nolan-nichols.com/specification/) is a **semantic profile** of OKF: the same files, but every field and relationship is bound to a public vocabulary (schema.org / DCAT / PROV-O), so the bundle expands losslessly to JSON-LD/RDF and is queryable with SPARQL. That adds real, new surface to check:

- A **bundle-root semantic header** on the root `index.md` - `lokf_version`, `base_iri`, `context`, `title`, `description`, `license`, `publisher` - the keys that lift the whole bundle into RDF.
- **`base_iri` authority and format checks** - it must be a valid, trailing-slash URI, and it must live in a URL space the project actually controls (not, say, `https://github.com/<org>/<repo>/knowledge/...`).
- A **controlled type vocabulary** (`Dataset`, `Table`, `Metric`, `Service`, `Playbook`, `Tutorial`, `Explanation`, `Policy`, `GlossaryTerm`, `Reference`, `Document`, `Person`, `Organization`, `AttestedComputation`) with type-specific fields - e.g. `Table`/`Dataset` need structured `fields`/`distribution` objects, never bare strings or URLs.
- The optional Diátaxis **`genre`** facet (`tutorial` / `how-to` / `reference` / `explanation`).
- **Typed relationships** in place of bare links - `isPartOf`, `hasPart`, `references`, `dependsOn`, `derivedFrom`, `about`, `sameAs`, `relatedTo`, `definedBy`, `source`, plus a generic `relations` list - each mapped to a fixed RDF predicate, with target resolution against `base_iri`.
- **`id`/IRI-minting consistency** - does a concept's `id` match what `base_iri` + its path would mint?

## What this plugin deliberately does *not* check

Required `type`, `generated`/`verified` provenance and trust, `status`/`stale_after` lifecycle, `Attested Computation` shape, and `index.md`/`log.md` structure are all **OKF v0.2 rules**, not LOKF-specific ones - and a plugin like **OKF Enforcer** already checks them well. Duplicating that logic here would mean maintaining two copies of the same rules in two repos. Instead, LOKF Enforcer detects whether an OKF v0.2 validator is installed and enabled, and shows a one-time notice recommending one if not - but it never requires, loads, or calls into that other plugin's code, and it keeps working (just with narrower coverage) if you don't install one.

## Usage model

LOKF bundles conventionally live as a sidecar directory inside a software repo (e.g. `.lokf/knowledge/`). This plugin scans the **whole open vault**, so the intended way to use it is to open that `knowledge/` directory directly as an Obsidian vault - vault root and bundle root then coincide, and the vault's own root `index.md` is the file carrying the semantic header.

Open the command palette and search for **LOKF**:

| Command | What it does |
|---|---|
| Validate vault (full LOKF report) | Scan everything and open the report panel |
| Validate active note | Check the current note |
| Insert semantic header template into root index.md | Adds a starter header, only if the root `index.md` has no frontmatter at all |
| Re-check for an installed OKF validator | Re-runs sibling-plugin detection |

Clicking the status-bar item validates the active note, or runs a vault scan if none is open. In the report panel, click a file name to open it.

## Settings

Configure under **Settings → LOKF Enforcer**. Every setting is registered declaratively, so it is reachable from Obsidian's settings search as well as the tab itself - which is why this plugin requires **Obsidian 1.13.0 or later**.

- **Sibling plugin** - status + recheck button, and a toggle for the one-time "install an OKF validator" notice.
- **Type vocabulary** - the known LOKF classes, whether an unrecognized `type` is worth a warning (never an error), and the accepted `genre` values.
- **Type-specific fields** - toggle the recommended-field warnings for `Metric`/`Service`/`GlossaryTerm` concepts.
- **Semantic header & base_iri** - the authority denylist (domains a `base_iri` must not live inside), the placeholder-domain list (treated as "pending", not a violation), and whether a missing header is worth a warning at all.
- **Relationships** - whether to check that a relationship target inside this bundle resolves to a real file (both full IRIs under `base_iri` and bare relative paths are checked; external IRIs never are). A broken link is always a warning, never an error - LOKF is deliberately permissive about cross-links. Also an off-by-default check of `relations[].predicate` against a configurable list, since the full RelationType vocabulary lives in the LOKF schema.
- **Scope & performance** - excluded folders and the batch size used for large vaults.

## Philosophy: warnings, not errors, almost everywhere

LOKF's own rules stay permissive by design: missing optional fields, an unknown `type`, and broken cross-links must never cause rejection. This plugin reserves **errors** for genuinely structural problems - a `base_iri` that isn't a valid URI, doesn't end in `/`, or lives in an unowned URL space; a `Field`/`Distribution` given as a bare string instead of a structured object. Everything else - an unrecognized type, a missing recommended field, an unresolved relative link, an `id` that doesn't match its minted IRI - is a warning you can act on or ignore.

There's no auto-fix: nothing here has a safe, unambiguous machine-guessable value (you can't auto-pick a `base_iri` - that's a human domain-ownership decision).

## Privacy

This plugin makes **no network requests** and has no telemetry, analytics, or external services of any kind. It reads Markdown files in the open vault, writes only when you explicitly run the semantic-header command, and stores its settings in the vault's own plugin data. Nothing leaves your machine.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). Source lives in `src/` and the build is esbuild, matching the upstream [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) layout; `npm run lint` runs Obsidian's own `eslint-plugin-obsidianmd` ruleset.

`src/validator.ts` is deliberately import-free - no Obsidian, no YAML parser - and takes already-parsed frontmatter, so the whole rule set runs under plain Node via `npm run smoke-test` with no Obsidian install. Parsing happens in `src/main.ts` using Obsidian's own `parseYaml`.

## License

Apache-2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE).
