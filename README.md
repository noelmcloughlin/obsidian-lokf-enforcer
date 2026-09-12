# LOKF Enforcer

> "We lasso the world with networks of silver-coloured Italian hemp,\
> We bind down the world into some sort of order;\
> We balance the earth in a pair of scales of our own devising."\
> — Amy Lowell, *The Congressional Library* (1922)

If you keep a structured knowledge base in Obsidian - a wiki, a team's shared brain, documentation for a project - this plugin quietly checks it stays well-formed as you write. No servers, no setup beyond installing it: open a vault, and a small status-bar icon tells you where things stand.

*New to LOKF, with just a vault of ordinary notes? Start at [Starting from an existing vault](#starting-from-an-existing-vault).*

It speaks a particular dialect of structured notes called **LOKF** (more on that below), layered on the Open Knowledge Format (OKF) v0.2. Because the LOKF schema already subsumes the OKF v0.2 base layer, this plugin checks that layer itself - so a bundle stays checkable even if no separate OKF v0.2 validator like [OKF Enforcer](https://github.com/MartinForReal/okf-enforcer) is installed or maintained.

If the [`lokf-agent-skills`](https://github.com/noelmcloughlin/lokf-agent-skills) are the library's staff - one lays the network, one binds it into order, one holds the scales, one guides the visitors - the two Obsidian plugins work the **registrar's desk**, where the records themselves are kept and the paperwork has to be straight. **LOKF Enforcer** - this one - checks that each record is well-formed as it is written. [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator) puts the source beside the claim and writes down what a person decided. **Neither reaches a verdict of its own: a registrar keeps the provenance honest and leaves the judging to the curator.**

> **For AI agents:** if `.lokf/knowledge/index.md` exists in this repository, read it first - it is a queryable [LOKF](https://lokf.nolan-nichols.com) knowledge bundle of repository-specific context; `llms.txt` says how to weigh what you find there (drafts vs. person-confirmed) and names the `lokf-docent` skill for answering from it.

## Why a vault needs a catalogue

The knowledge is already in the vault. What's missing is a way to tell, at a glance, which of it is still sound - and without that you end up re-checking everything yourself, which is the work the vault was supposed to save you, while the notes quietly rot.

A catalogue is only worth keeping if its records hold their shape. That is this plugin's half of the job: the frontmatter is well-formed, the types are ones the vocabulary knows, the relationships point at notes that exist, and the ids are the ones this bundle's `base_iri` would mint. Who checked a claim, and when, is a separate question - recorded in the same files and shown in plain words by [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator). Well-formed is the floor all of that stands on: a record nobody can parse is one nobody can vouch for either.

## What it looks like

Open a vault that has an `index.md` at its root (or at the [bundle root you configure](#usage)), and a status-bar item appears: **LOKF ✓** when everything checks out, **LOKF ⚠ 3** for warnings, **LOKF ✖ 1** the moment something is structurally wrong - a malformed web address where the bundle's `base_iri` should be, a relationship that points nowhere.

Click it, or run **Validate vault** from the command palette, and a side panel opens: notes grouped by folder, the one you're editing pinned at the top, each finding named in plain language with the file one click away. A filter box narrows the list as you type (`sev:error`, `rule:lokf/2`, or any text), and a **Go to a finding** quick-switcher (plus next/previous-finding commands) jumps straight to the offending line. Right-clicking a finding offers to copy its message, open it, apply its one safe fix, or silence the whole note; when a file's findings span several frontmatter keys they group under each. Nothing is ever silently rejected - see [Philosophy](#philosophy-warnings-not-errors-almost-everywhere).

You don't have to open the panel to catch a problem. **As you type, the offending frontmatter value is underlined** - wavy red for an error, amber for a warning, the finding on hover - and editing a note re-checks just that note instead of rescanning the whole vault. **Autocomplete** offers the values a field expects - a `type`, `genre`, or `status`, a relation's predicate, or a relation target from elsewhere in the bundle. Both are on by default and switch off under *Settings → In-editor diagnostics*.

## Install

Not yet in the community store - the first release is in preparation. Until it lands, the options are:

- **From source** - `npm ci && npm run build`, then copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/lokf-enforcer/` and enable the plugin under **Settings → Community plugins**.
- **From a GitHub release** - once one is published, the same three files are attached to it; copy them to the same place.
- **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** - add `noelmcloughlin/obsidian-lokf-enforcer` as a beta plugin once a release exists, and BRAT keeps it updated.

Requires Obsidian **1.13.0** or later (declarative settings API).

## Starting from an existing vault

Neither this plugin nor [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator) *authors* frontmatter - they check and curate records that already carry it, so enabling them on a vault of plain notes writes nothing. To turn scattered notes into a bundle, use the [`lokf-agent-skills`](https://github.com/noelmcloughlin/lokf-agent-skills): `lokf-scaffolding` lays down `.lokf/` and a `knowledge_bundle` symlink, then `lokf-librarian` reads your notes as *sources* and derives a frontmatter'd concept layer into `.lokf/knowledge/` (typed relations wired, each concept marked a draft). Open `knowledge_bundle` as a vault (see [Usage](#usage)) and this plugin validates it natively, ready for a person to confirm the drafts. Your original notes are untouched - the derived bundle sits beside them, which is why it starts with no Obsidian backlinks; those accrue as it grows. To light them up at once, run **Generate Obsidian affordances across the vault** ([below](#usage)): it tags each concept with its Diátaxis `genre`, lists its typed relations as `[[wikilinks]]`, and builds a Diátaxis map from the `genre` facet.

## Usage

**By default, the vault root is the bundle root** - the plugin scans the whole open vault and treats its top-level `index.md` as the bundle's semantic header. Two consequences of that default:

- **A bundle inside a repository** - the `lokf-agent-skills` convention is `.lokf/knowledge/` - must be opened *as its own vault*: **File → Open folder as vault** on the `knowledge/` folder itself. Opening the repository root as a vault may **does** may not make sense (the  `knowledge/` bundle being derived from repository contents), and **does** not work as  Obsidian's file index skips every folder whose name starts with a dot, so nothing under `.lokf/` is visible to this or any plugin (although `knowledge_bundle` symlink is workaround).
- **An ordinary personal vault is left alone.** A note without LOKF fields produces no findings, and a note with no frontmatter at all is the OKF validator's business, not this plugin's. The one thing you will see is a warning that the root `index.md` carries no LOKF header - switch it off under *Settings → Semantic header* if the vault isn't a bundle.

**If your vault holds several project folders and each is its own bundle** - the ordinary Obsidian pattern, one vault for everything, subfolders for projects - list them under *Settings → Scope and performance → Bundle root folders* (comma-separated, e.g. `knowledge, projects/foo`). Each becomes an independent bundle: its own `<folder>/index.md`, its own `base_iri`, ids and relations minted and checked relative to that folder alone. A note outside every listed folder is ignored entirely - as if it didn't exist. Leave the list empty (the default) for the common one-vault-per-bundle case above, where the whole vault is the one bundle.

**On Linux or Mac, a symlink avoids the dot-folder problem above:** `lokf-scaffolding` creates a `knowledge_bundle` link at the repository root pointing to `.lokf/knowledge`, so opening the repository root as the vault reaches the bundle through the link - Obsidian checks only each path segment's own name for a leading dot, and `knowledge_bundle` has none. Without the symlink, or on Windows, open `.lokf/knowledge` as its own vault instead. Either way, a dot-folder can't be entered under **Bundle root folders**: the setting rejects it with a reason rather than silently scanning nothing.

The **scaffold command** (below) targets whichever bundle the active note belongs to; with several roots configured and no note open in any of them, it asks you to open one first rather than guessing which bundle you meant.

Open the command palette and search for **LOKF**:

| Command | What it does |
| --- | --- |
| Validate vault (full LOKF report) | Scan everything and open the report panel |
| Validate active note | Check the current note |
| Insert semantic header template into root index.md | Adds a starter header, only if the root `index.md` has no frontmatter at all |
| Find a concept (by name, type, or relations) | Keyboard-first quick-switcher over every concept in the bundle |
| Find an orphan concept (nothing links to it) | Lists the concepts nothing else links to |
| Look up a LOKF field | Searchable reference of the LOKF frontmatter fields and what each one means |
| Go to a finding (search all findings) | Keyboard-first quick-switcher over every finding; opens the note on the offending line |
| Go to next / previous finding | Cycle through the report's findings, jumping to each |
| Fix safe issues in the active note | Applies the deterministic fixes (see [Philosophy](#philosophy-warnings-not-errors-almost-everywhere)) in one undo step |
| Fix safe issues across the vault | Applies the same deterministic fixes to every note in one pass, after a confirmation |
| Promote body links to typed relations… | Guesses a typed relation for each body link and lets you confirm which to add |
| Add Obsidian affordances to the active note | Tags the note with its Diátaxis `genre` and lists its typed relations as `[[wikilinks]]`, in one managed block (tag pane + graph + backlinks) |
| Generate Obsidian affordances across the vault | Does that for every concept, plus a Diátaxis map per bundle, after a confirmation |
| Generate the Diátaxis map for this bundle | Builds or refreshes `diataxis.md`, grouping concepts by `genre` into the four Diátaxis quadrants |

Clicking the status-bar item validates the active note, or runs a vault scan if none is open.

## Settings

Configure under **Settings → LOKF Enforcer**. Every setting is registered declaratively, so it is reachable from Obsidian's settings search as well as the tab itself.

- **This device** - a device-local switch that silences the plugin (status bar, inline underlines, autocomplete, and scanning) on this device only. It's stored per-device and never synced, so a vault synced to a phone can turn it off there while the desktop keeps working.
- **Alternative OKF validator** - an optional shortcut that opens OKF Enforcer in Obsidian's community-plugin browser (you install and enable it yourself - this plugin never installs, enables, or calls into another plugin, and can't detect whether one is present). Now that the OKF v0.2 base layer is checked here, a dedicated OKF validator is an alternative, not required, so the one-time notice is off by default. (Not LOKF Curator, which is this plugin's *sibling* - see [Alternatives](#alternatives).)
- **In-editor diagnostics** - the two live editor aids, both on by default and both raw-frontmatter (Source mode) only: underlining a finding's value as you type (wavy red for an error, amber for a warning, the finding on hover), and autocompleting the values a field expects - a `type`, `genre`, or `status`, a relation's predicate, or a relation target from the bundle.
- **Type vocabulary** - the known LOKF classes, whether an unrecognized `type` is worth a warning (never an error), and the accepted `genre` values.
- **Type-specific fields** - toggle the recommended-field warnings for `Metric`/`Service`/`GlossaryTerm` concepts.
- **Semantic header & base_iri** - the authority denylist (domains a `base_iri` must not live inside), the placeholder-domain list (treated as "pending", not a violation), and whether a missing header is worth a warning at all.
- **Relationships** - whether to check that a relationship target inside this bundle resolves to a real file (both full IRIs under `base_iri` and bare relative paths are checked; external IRIs never are). A broken link is always a warning, never an error - LOKF is deliberately permissive about cross-links. Also an off-by-default check of `relations[].predicate` against a configurable list, since the full RelationType vocabulary lives in the LOKF schema.
- **OKF v0.2 base layer** - whether to check the OKF v0.2 rules the LOKF schema already subsumes: a required `type`, the `Attested Computation` contract shape, reserved `index.md`/`log.md` structure, and v0.1→v0.2 migration hints. On by default so a bundle stays checkable with no separate OKF validator; turn it off if you run a dedicated one. Severity follows the spec: what OKF marks REQUIRED/MUST is an error, the rest a warning.
- **Enforce OKF conformance as errors** - on by default, and **not recommended to turn off**: it's a break-glass escape hatch. Turning it off downgrades the OKF-required errors (a missing `type`, an `Attested Computation` with no `runtime`, a non-root `index.md` with frontmatter, a non-ISO `log.md` date, a missing `generated.by` or source `resource`) to warnings, so a non-conformant bundle stops being flagged as broken - use it only to unblock temporarily (e.g. mid-migration) while you fix the data. LOKF's own structural errors are unaffected.
- **Trust & lifecycle (OKF v0.2 §5)** - whether to validate the *shape* of the `verified`/`generated` provenance, `status`, `stale_after`, and `sources` fields a bundle uses (never their credibility *depth* or trust-tier verdict), plus the accepted `status` values. The two fields OKF marks REQUIRED - a `generated.by` actor and each source's `resource` - are errors (relaxable via *Enforce OKF conformance*); the rest are warnings. Nothing fires on a bundle that carries no §5 fields.
- **Rule severity** - a list of rule ids whose warnings you want raised to errors (for a team that wants stricter gating). Escalation only: a finding that is already an error by default is never downgraded, so this can only make the check stricter, never invert the "warnings, not errors" contract.
- **Field aliasing (advanced)** - `user=canonical` pairs (e.g. `depends_on=dependsOn`) that rename a vault's own frontmatter keys onto the LOKF ones before checking, so a vault that never adopted the canonical spellings can still be validated. Off by default, because turning it on stops the plugin flagging the divergence - use it only when the alternative spelling is deliberate.
- **Scope & performance** - the [bundle root folders](#usage) for a vault holding several independent bundles as project folders, excluded folders, a **per-note opt-out key** (a note with `lokf: ignore` in its frontmatter is silenced - no findings, underlines, or report rows - while still counting as a concept in the bundle graph), and the batch size used for large vaults.

## For the curious: how the checking works

The sections above are everything you need to use the plugin. What follows is the reasoning behind it, for anyone who wants to know what's actually being checked and why.

### What LOKF adds over plain OKF

[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), in plain terms, is a folder of Markdown files, one idea per file, each starting with a small YAML block whose only real requirement is a `type` (`Service`, `Policy`, `GlossaryTerm`, and so on).

[LOKF](https://lokf.nolan-nichols.com/specification/) is that same folder, held to a stricter, more precise dialect: every field and relationship is bound to a public vocabulary (schema.org / DCAT / PROV-O), so the bundle can be losslessly turned into a knowledge graph and queried like a database. That precision is what this plugin checks for:

- A **bundle-root semantic header** on the root `index.md` - `lokf_version`, `base_iri`, `context`, `title`, `description`, `license`, `publisher` - the keys that lift the whole bundle into a graph.
- **`base_iri` authority and format checks** - it must be a syntactically valid absolute IRI, terminated with `/` or `#` (so ids mint by plain concatenation), and in a namespace the project actually owns (not, say, `https://github.com/<org>/<repo>/knowledge/...`). It is an *identifier namespace, not a hyperlink*: a concept's `id` only looks like a URL, so it need not resolve - a 404 is valid by design, though a [Cool URI](https://www.w3.org/Provider/Style/URI) that could double as a working link later is the ideal. The check is on form and authority, never on whether the address is live.
- A **controlled type vocabulary**, derived from the LOKF schema (`Dataset`, `Table`, `Metric`, `Service`, `Playbook`, `Tutorial`, `Explanation`, `Policy`, `GlossaryTerm`, `Reference`, `Document`, `Role`, `AttestedComputation`, `Person`, `Organization`) with type-specific fields - e.g. `Table`/`Dataset` need structured `fields`/`distribution` objects, never bare strings or URLs.
- The optional Diátaxis **`genre`** facet (`tutorial` / `how-to` / `reference` / `explanation`).
- **Typed relationships** in place of bare links - the schema's full `RelationType` set (`isPartOf`, `hasPart`, `references`, `dependsOn`, `derivedFrom`, `about`, `sameAs`, `relatedTo`, `wasAttributedTo`, `definedBy`, `measures`, `joinsWith`, `source`, `memberOf`, `holder`), plus a generic `relations` list - each with a precise meaning, and checked to make sure the note it points at actually exists.
- **`id` consistency** - does a concept's `id` match what its `base_iri` and file path would produce?
- **Trust/lifecycle field shapes (OKF v0.2 §5)** - when a bundle uses them, that `verified`/`generated` events are well-formed `{ by, at }` with an OKF §7 actor (`human:<id>`, `process:<id>`, or `<producer>/<version>`), `status` is one of the schema's lifecycle values, `stale_after` is a date, and each `sources` entry names its `resource`. These fields originate in OKF but are defined in the LOKF schema and are the substrate LOKF's curation ceremony stands on, so their *shape* is checked here (never their credibility *depth* or trust-tier display) - and the two fields OKF marks REQUIRED, a `generated.by` actor and each source's `resource`, are errors while the rest are warnings.

### The OKF v0.2 base layer

Because every LOKF field is a LOKF schema slot, the plugin already has what it needs to check the plain-OKF rules *underneath* the LOKF dialect - so it does, rather than leaning on a separate tool that might not be installed or kept up to date. The spec is the authority: a rule exists here because OKF v0.2 (or the LOKF schema that mirrors it) says so, not because another tool happens to check it. These are the `okf/*` findings, switchable off in one place (*Settings → OKF v0.2 base layer*) if you do run a dedicated OKF validator. **Severity follows the spec's own force:** what OKF marks *REQUIRED / MUST* (or lists under §11 conformance) is an **error**; the shape of optional fields and the migration hints are warnings. Those mandatory errors can be **temporarily downgraded to warnings** with *Enforce OKF conformance as errors* (a not-recommended break-glass toggle in the same settings group) - for a mid-migration bundle, keeping the findings visible without blocking.

- **A required `type`** (OKF §4.1/§11, REQUIRED) - **error.** The one always-required OKF key, and `required` in the LOKF schema too. Flagged only when the note is plainly a concept (it carries other LOKF fields), so an ordinary vault note with just tags or aliases is still left alone.
- **The `Attested Computation` contract shape** (§10) - a missing `runtime` is an **error** (§10.2 REQUIRED, and `required` in the schema); the shape of the optional `parameters` / `executor` / `attester` / `computation` fields, and the expectation of a body `# Computation` block, are warnings.
- **Reserved `index.md` / `log.md` structure** (§8/§9, §11 conformance) - **errors.** A non-root `index.md` carries no frontmatter (only a bundle-root one may, and only `okf_version`), and `log.md` date headings MUST be ISO 8601 `YYYY-MM-DD`.
- **v0.1 → v0.2 migration hints** (§13) - warnings. A legacy `timestamp` (superseded by `generated`) and a body `# Citations` list (superseded by `sources`); v0.2 consumers still tolerate the v0.1 forms, so these only nudge.

### What this plugin deliberately does *not* check

What stays out of scope is the *verdict*, not the paperwork. For the §5 trust/lifecycle fields the plugin checks their *shape* but never their credibility *depth* - it won't weigh a source's signals, rank trust tiers, or decide whether a claim is current. Nor does it execute anything: an `Attested Computation`'s contract is checked, but running the computation, inspecting a receipt, and returning an attestation verdict (§10.5) are runtime concerns a consumer performs, not an in-editor linter's.

### Where this fits: the "Schema-valid" tier

The companion [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills) project describes four levels of trust a claim in a bundle can earn: **schema-valid** (the frontmatter is well-formed and its relations resolve), **source-consistent** (an agent re-checked it against its source), **human-confirmed** (a named person vouches for it), and **proven-in-use** (a real question got answered from it). Each proves less than its name suggests. This plugin checks the first tier - schema-valid, and only the LOKF slice of it - as you write, inside the editor. It cannot tell you whether a claim is *true*; that takes a librarian pass and a curator's review, and [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator) is where the latter happens in the editor.

There is no dependency in either direction. This plugin reads Markdown and YAML and works on any LOKF bundle however it was produced - by hand, by the `lokf` CLI, or by the skills - and never loads or calls into a skill, an agent, or another plugin; the skills, in turn, rely on `lokf validate`, not on this plugin. All they share is the LOKF specification. The skills are agent tooling for a *code repository* - deriving a bundle from source and having a person confirm it; this plugin is the in-editor counterpart of the schema check, run as you write. LOKF Curator sits one tier above, equally independent - neither plugin detects whether the other is installed.

### Philosophy: warnings, not errors, almost everywhere

LOKF's own rules stay permissive by design: missing optional fields, an unknown `type`, and broken cross-links must never cause rejection. This plugin reserves **errors** for genuinely structural problems - a `base_iri` that isn't a syntactically valid IRI, doesn't end in `/` or `#`, or lives in a namespace the project doesn't own; a `Field`/`Distribution` given as a bare string instead of a structured object; and the OKF v0.2 rules the *authoritative* spec itself marks REQUIRED or MUST - a concept with no `type`, an `Attested Computation` with no `runtime`, a non-root `index.md` that carries frontmatter, a `log.md` date heading that isn't ISO 8601, a `generated` block with no `by` actor, or a `sources` entry with no `resource`. Those OKF ones are errors because the spec (and the LOKF schema that mirrors it) says the field or structure is required, not by this plugin's preference; where OKF says a field is optional or merely superseded, it stays a warning - and, as a not-recommended break-glass measure, they can be **temporarily downgraded to warnings** (mid-migration, say) via *Settings → OKF v0.2 base layer → Enforce OKF conformance as errors*, without losing the finding. Everything else - an unrecognized type, a missing recommended field, an unresolved relative link, an `id` that doesn't match what it should mint - is a warning you can act on or ignore.

Auto-fix is offered only where the correction is mechanical and unambiguous. The **Fix safe issues in the active note** command appends a missing `base_iri` terminator (`/`), rewrites a known type alias to its canonical class (`runbook` → `Playbook`), and turns a bare-string relation into a one-item list - each a format-preserving edit, in one undo step. It never guesses a value the project owns: it will not pick a `base_iri`, move one into a namespace you control, or invent a publisher identity - those stay human decisions, flagged but not touched.

## Privacy

This plugin makes **no network requests** and has no telemetry, analytics, or external services of any kind. It reads Markdown files in the open vault and writes only when you explicitly run a command or report action that edits a note - the semantic-header, safe-fix, promote-relations, and Obsidian-affordance commands, and the report's *Fix this finding* / *Silence this note* actions (the affordance commands add a managed body block or a `diataxis.md` map; everything else edits frontmatter). It stores its settings in the vault's own plugin data. Nothing leaves your machine.

## For other plugins: a read-only API

A sibling plugin or agent (for example LOKF Curator) can read validation state without either plugin depending on the other, at `app.plugins.plugins["lokf-enforcer"].api`:

- `getReport()` - the latest vault scan's findings (a read-only snapshot).
- `validatePath(path)` - validate one note on demand; reads and validates only, never writes.
- `onValidated(callback)` - fires when a full scan or an incremental re-check finishes; returns an unsubscribe function.

The API is **offered, never required** - it writes nothing, and its `LokfFinding` shape is a stable contract (`src/public-api.ts`) independent of the plugin's internals.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). Source lives in `src/` and the build is esbuild, matching the upstream [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) layout; `npm run lint` runs Obsidian's own `eslint-plugin-obsidianmd` ruleset.

```text
src/
  main.ts           plugin lifecycle: commands, status bar, vault scan, bundle-root resolution
  validator.ts      the LOKF rule set - import-free, runs under plain Node
  report-view.ts    the side-panel conformance report
  settings.ts       declarative settings tab (Obsidian 1.13+)
scripts/
  smoke-test.ts     validator fixtures + whole-bundle golden fixtures (npm run smoke-test)
  fixtures/         frozen copy of the lokf-scaffolding template skeleton the smoke test validates
.lokf/              this repository's own LOKF knowledge bundle (a uv/Python sidecar)
```

`src/validator.ts` is deliberately import-free - no Obsidian, no YAML parser - and takes already-parsed frontmatter, so the whole rule set runs under plain Node via `npm run smoke-test` with no Obsidian install. Parsing happens in `src/main.ts` using Obsidian's own `parseYaml`.

## Alternatives

**OKF Enforcer** (or any other OKF v0.2 validator) is an *alternative*, not a companion: it checks the same OKF v0.2 base layer this plugin now checks itself, so you don't need it - that layer is covered here. If you'd rather use a dedicated validator, *Settings → Alternative OKF validator* opens it in Obsidian's community-plugin browser; this plugin still never loads or calls into it, and you can hand those checks back to it by turning the base layer off (same settings group).

Don't confuse it with [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator) - *that* is this plugin's **sibling** (forked from it, sharing its bundle-root plumbing), one tier up at the human-confirmed layer. Curator and Enforcer are complementary; a second OKF validator is an alternative.

## Credits

- [Nolan Nichols](https://lokf.nolan-nichols.com/), creator of [LOKF](https://lokf.nolan-nichols.com/specification/) (Linked Open Knowledge Format) and its [toolkit](https://github.com/nicholsn/lokf).
- The [LinkML Community](https://linkml.io/), creators of [LinkML](https://linkml.io/linkml/), the schema language LOKF is written in.
- [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin), whose build/lint/release layout this repository follows.
- [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills) - the agent skills whose trust model and plain-language labels this README shares, and whose bundle template the smoke test validates.
- [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator) - the plugin at the human-confirmed tier, forked from this one and sharing its bundle-root plumbing.

## About this repository's own knowledge bundle

This repository keeps a LOKF bundle of its own under `.lokf/knowledge/` - documentation about the plugin, in the format the plugin checks. It is maintained by the [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills), which a scheduled [workflow](.github/workflows/knowledge-librarian.yaml) installs at run time (they are never committed - `.agents/`, `.claude/`, and `skills-lock.json` are git-ignored). None of this is part of the plugin - you don't need any skill to use it. If you want to contribute to that bundle, [CONTRIBUTING.md](CONTRIBUTING.md#agent-skills-optional---only-for-editing-this-repos-own-lokf-bundle) says which skills that takes.

The plugin works the registrar's desk inside Obsidian; this repository staffs the same desk in CI, where the [`lokf`](https://pypi.org/project/lokf/) toolkit and [`knowledge-registrar.yaml`](.github/workflows/knowledge-registrar.yaml) keep the bundle's records well-formed on every pull request that touches `.lokf/**` - the same check, never a verdict on whether the content is true.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the dev setup and the pre-PR checklist; participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md), and [AI_COVENANT.md](AI_COVENANT.md) sets out how AI-assisted contributions are handled here.

## Security

Please review the repository security policy at [SECURITY.md](SECURITY.md) before using the agent-driven knowledge workflow or GitHub automation in this repo.

## License

Apache-2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE).
