# LOKF Enforcer

> "We lasso the world with networks of silver-coloured Italian hemp,\
> We bind down the world into some sort of order;\
> We balance the earth in a pair of scales of our own devising."\
> — Amy Lowell, *The Congressional Library* (1922)

If you keep a structured knowledge base in Obsidian - a wiki, a team's shared brain, documentation for a project - this plugin quietly checks it stays well-formed as you write. No servers, no setup beyond installing it: open a vault, and a small status-bar icon tells you where things stand.

It speaks a particular dialect of structured notes called **LOKF** (more on that below) - on top of, not instead of, the Open Knowledge Format (OKF) v0.2 that [OKF Enforcer](https://github.com/MartinForReal/okf-enforcer) (or any other OKF v0.2 validator) already checks.

If the [`lokf-agent-skills`](https://github.com/noelmcloughlin/lokf-agent-skills) are the library's staff - one lays the network, one binds it into order, one holds the scales, one guides the visitors - this plugin is the house style on the cataloguing desk. **It checks each record as it is written, and vouches for nothing.**

> **For AI agents:** if `.lokf/knowledge/index.md` exists in this repository, read it first - it is a queryable [LOKF](https://lokf.nolan-nichols.com) knowledge bundle with repository-specific context that plain prose can't express. A concept marked `status: draft` has not yet been confirmed by a person; one with a `human:` entry under `verified` has - weigh them accordingly. The `lokf-docent` skill, if installed, is the disciplined way to answer from the bundle.

## What it looks like

Open a bundle folder as a vault (it has to be the bundle folder itself - see [Usage](#usage) for why), and a status-bar item appears: **LOKF ✓** when everything checks out, **LOKF ⚠ 3** for warnings, **LOKF ✖ 1** the moment something is structurally wrong - a malformed web address where the bundle's `base_iri` should be, a relationship that points nowhere.

Click it, or run **Validate vault** from the command palette, and a side panel opens: notes grouped by folder, the one you're editing pinned at the top, each finding named in plain language with the file one click away. Nothing is ever silently rejected - see [Philosophy](#philosophy-warnings-not-errors-almost-everywhere).

## Install

Not yet in the community store - the first release is in preparation (see [PUBLISHING.md](PUBLISHING.md) for the submission path). Until it lands, the options are:

- **From source** - `npm ci && npm run build`, then copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/lokf-enforcer/` and enable the plugin under **Settings → Community plugins**.
- **From a GitHub release** - once one is published, the same three files are attached to it; copy them to the same place.
- **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** - add `noelmcloughlin/obsidian-lokf-enforcer` as a beta plugin once a release exists, and BRAT keeps it updated.

Requires Obsidian **1.13.0** or later (declarative settings API).

## Usage

**The vault root is the bundle root.** This plugin scans the whole open vault and treats its top-level `index.md` as the bundle's semantic header; there is no setting for a bundle that lives in a subfolder. Two consequences:

- **A bundle inside a software repo** - the `lokf-agent-skills` convention is `.lokf/knowledge/` - must be opened *as its own vault*: **File → Open folder as vault** on the `knowledge/` folder itself. Opening the repository root as a vault does **not** work, because Obsidian's file index skips every folder whose name starts with a dot, so nothing under `.lokf/` is visible to this or any plugin. (Obsidian then writes its `.obsidian/` config folder inside the bundle; this repo's `.lokf/.gitignore` ignores it.)
- **An ordinary personal vault is left alone.** A note without LOKF fields produces no findings, and a note with no frontmatter at all is the OKF validator's business, not this plugin's. The one thing you will see is a warning that the root `index.md` carries no LOKF header - switch it off under *Settings → Semantic header* if the vault isn't a bundle.

Open the command palette and search for **LOKF**:

| Command | What it does |
|---|---|
| Validate vault (full LOKF report) | Scan everything and open the report panel |
| Validate active note | Check the current note |
| Insert semantic header template into root index.md | Adds a starter header, only if the root `index.md` has no frontmatter at all |
| Re-check for an installed OKF validator | Re-runs sibling-plugin detection |

Clicking the status-bar item validates the active note, or runs a vault scan if none is open.

## Settings

Configure under **Settings → LOKF Enforcer**. Every setting is registered declaratively, so it is reachable from Obsidian's settings search as well as the tab itself.

- **Sibling plugin** - status + recheck button, and a toggle for the one-time "install an OKF validator" notice.
- **Type vocabulary** - the known LOKF classes, whether an unrecognized `type` is worth a warning (never an error), and the accepted `genre` values.
- **Type-specific fields** - toggle the recommended-field warnings for `Metric`/`Service`/`GlossaryTerm` concepts.
- **Semantic header & base_iri** - the authority denylist (domains a `base_iri` must not live inside), the placeholder-domain list (treated as "pending", not a violation), and whether a missing header is worth a warning at all.
- **Relationships** - whether to check that a relationship target inside this bundle resolves to a real file (both full IRIs under `base_iri` and bare relative paths are checked; external IRIs never are). A broken link is always a warning, never an error - LOKF is deliberately permissive about cross-links. Also an off-by-default check of `relations[].predicate` against a configurable list, since the full RelationType vocabulary lives in the LOKF schema.
- **Scope & performance** - excluded folders and the batch size used for large vaults.

## For the curious: how the checking works

The sections above are everything you need to use the plugin. What follows is the reasoning behind it, for anyone who wants to know what's actually being checked and why.

### What LOKF adds over plain OKF

[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), in plain terms, is a folder of Markdown files, one idea per file, each starting with a small YAML block whose only real requirement is a `type` (`Service`, `Policy`, `GlossaryTerm`, and so on).

[LOKF](https://lokf.nolan-nichols.com/specification/) is that same folder, held to a stricter, more precise dialect: every field and relationship is bound to a public vocabulary (schema.org / DCAT / PROV-O), so the bundle can be losslessly turned into a knowledge graph and queried like a database. That precision is what this plugin checks for:

- A **bundle-root semantic header** on the root `index.md` - `lokf_version`, `base_iri`, `context`, `title`, `description`, `license`, `publisher` - the keys that lift the whole bundle into a graph.
- **`base_iri` authority and format checks** - it must be a valid, trailing-slash web address, and one the project actually owns (not, say, `https://github.com/<org>/<repo>/knowledge/...`).
- A **controlled type vocabulary** (`Dataset`, `Table`, `Metric`, `Service`, `Playbook`, `Tutorial`, `Explanation`, `Policy`, `GlossaryTerm`, `Reference`, `Document`, `Person`, `Organization`, `AttestedComputation`) with type-specific fields - e.g. `Table`/`Dataset` need structured `fields`/`distribution` objects, never bare strings or URLs.
- The optional Diátaxis **`genre`** facet (`tutorial` / `how-to` / `reference` / `explanation`).
- **Typed relationships** in place of bare links - `isPartOf`, `hasPart`, `references`, `dependsOn`, `derivedFrom`, `about`, `sameAs`, `relatedTo`, `definedBy`, `source`, plus a generic `relations` list - each with a precise meaning, and checked to make sure the note it points at actually exists.
- **`id` consistency** - does a concept's `id` match what its `base_iri` and file path would produce?

### What this plugin deliberately does *not* check

Required `type`, `generated`/`verified` provenance and trust, `status`/`stale_after` lifecycle, `Attested Computation` shape, and `index.md`/`log.md` structure are all **OKF v0.2 rules**, not LOKF-specific ones - and a plugin like **OKF Enforcer** already checks them well. Duplicating that logic here would mean maintaining two copies of the same rules in two repos. Instead, LOKF Enforcer detects whether an OKF v0.2 validator is installed and enabled, and shows a one-time notice recommending one if not - but it never requires, loads, or calls into that other plugin's code, and it keeps working (just with narrower coverage) if you don't install one.

### Where this fits: the "Schema-valid" tier

The companion [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills) project describes four levels of trust a claim in a bundle can earn: **schema-valid** (the frontmatter is well-formed and its relations resolve), **source-consistent** (an agent re-checked it against its source), **human-confirmed** (a named person vouches for it), and **proven-in-use** (a real question got answered from it). This plugin checks the first tier - schema-valid, and only the LOKF slice of it - as you write, inside the editor. It cannot tell you whether a claim is *true*; that takes a librarian pass and a curator's review.

**None of that is a dependency.** The skills are optional companions, not a requirement. This plugin reads Markdown and YAML and works on any LOKF bundle however it was produced - by hand, by the `lokf` CLI, or by the skills - and it never requires, loads, or calls into a skill, an agent, or another plugin, exactly as it never calls into an OKF validator (above). The skills, in turn, do not need this plugin: `lokf validate` remains the gate they rely on. The only thing the two share is the LOKF specification. Maintaining a bundle - scaffolding it, keeping it in sync with its source, having a person confirm it - is the job of the skills (`lokf-scaffolding` / `lokf-librarian` / `lokf-curator` / `lokf-docent`); this plugin is their in-editor counterpart, the same schema checked immediately while you write.

### Philosophy: warnings, not errors, almost everywhere

LOKF's own rules stay permissive by design: missing optional fields, an unknown `type`, and broken cross-links must never cause rejection. This plugin reserves **errors** for genuinely structural problems - a `base_iri` that isn't a valid address, doesn't end in `/`, or lives somewhere the project doesn't own; a `Field`/`Distribution` given as a bare string instead of a structured object. Everything else - an unrecognized type, a missing recommended field, an unresolved relative link, an `id` that doesn't match what it should mint - is a warning you can act on or ignore.

There's no auto-fix: nothing here has a safe, unambiguous machine-guessable value (you can't auto-pick a `base_iri` - that's a human domain-ownership decision).

## Privacy

This plugin makes **no network requests** and has no telemetry, analytics, or external services of any kind. It reads Markdown files in the open vault, writes only when you explicitly run the semantic-header command, and stores its settings in the vault's own plugin data. Nothing leaves your machine.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). Source lives in `src/` and the build is esbuild, matching the upstream [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) layout; `npm run lint` runs Obsidian's own `eslint-plugin-obsidianmd` ruleset.

```text
src/
  main.ts           plugin lifecycle: commands, status bar, vault scan, sibling detection
  validator.ts      the LOKF rule set - import-free, runs under plain Node
  report-view.ts    the side-panel conformance report
  settings.ts       declarative settings tab (Obsidian 1.13+)
scripts/
  smoke-test.ts     validator fixtures + whole-bundle golden fixtures (npm run smoke-test)
  fixtures/         frozen copy of the lokf-scaffolding template skeleton the smoke test validates
.lokf/              this repository's own LOKF knowledge bundle (a uv/Python sidecar)
```

`src/validator.ts` is deliberately import-free - no Obsidian, no YAML parser - and takes already-parsed frontmatter, so the whole rule set runs under plain Node via `npm run smoke-test` with no Obsidian install. Parsing happens in `src/main.ts` using Obsidian's own `parseYaml`.

## Credits

- [Nolan Nichols](https://lokf.nolan-nichols.com/), creator of [LOKF](https://lokf.nolan-nichols.com/specification/) (Linked Open Knowledge Format) and its [toolkit](https://github.com/nicholsn/lokf).
- The [LinkML Community](https://linkml.io/), creators of [LinkML](https://linkml.io/linkml/), the schema language LOKF is written in.
- [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin), whose build/lint/release layout this repository follows.
- [OKF Enforcer](https://github.com/MartinForReal/okf-enforcer) by MartinForReal - the OKF v0.2 validator this plugin is designed to sit beside, and whose bundle header is a smoke-test fixture here.
- [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills) - the scaffolding / librarian / curator / docent skills whose trust model this README borrows, and whose scaffolding templates the smoke test validates.

## Agent skills are installed, not committed

The four LOKF skills are runtime state, not source - their own guidance says so - so `.agents/`, `.claude/`, and `skills-lock.json` are git-ignored. The scheduled [`knowledge-librarian.yaml`](.github/workflows/knowledge-librarian.yaml) workflow installs the pinned `lokf-librarian` skill at run time, and `npm run smoke-test` validates a frozen copy of the scaffolding skeleton under `scripts/fixtures/`. To use the skills locally, install them once, pinned to one release ([GitHub CLI](https://cli.github.com/manual/gh_skill_install) 2.90+):

```bash
for s in lokf-scaffolding lokf-librarian lokf-curator lokf-docent; do
  gh skill install noelmcloughlin/lokf-agent-skills "$s@v0.9.0"
done
```

## Security

Please review the repository security policy at [SECURITY.md](SECURITY.md) before using the agent-driven knowledge workflow or GitHub automation in this repo.

## License

Apache-2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE).
