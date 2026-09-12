# LOKF Registrar

> "We lasso the world with networks of silver-coloured Italian hemp,\
> We bind down the world into some sort of order;\
> We balance the earth in a pair of scales of our own devising."\
> — Amy Lowell, *The Congressional Library* (1922)

If you keep a structured knowledge base in Obsidian - a wiki, a team's shared brain, documentation for a project - this plugin quietly checks it stays well-formed as you write. No servers, no setup beyond installing it: open a vault, and a small status-bar icon tells you where things stand.

It speaks a particular dialect of structured notes called **LOKF** (Linked Open Knowledge Format, layered on the Open Knowledge Format, OKF v0.2 - more on both in [How the checking works](docs/for-the-curious.md)). A folder of notes written that way is a **knowledge bundle**: one concept per note, a little frontmatter on each, and an `index.md` at the folder's root that names the bundle. Two words this README keeps coming back to: the bundle is the **exhibition**, and each concept in it an exhibit - the checked, curated part of what you know, as against the workshop of ordinary notes around it. That is the whole unit this plugin works on, and it is just a folder of Markdown - which is why Obsidian can open it, and why nothing about your vault has to change to hold one.

If the [`lokf-agent-skills`](https://github.com/noelmcloughlin/lokf-agent-skills) are the library's staff - one lays the network, one binds it into order, one holds the scales, one guides the visitors - Obsidian is the desk where the one who holds the scales sits - and that one is always a person: the **curator** is a named human, never a tool. Two plugins work at that desk. **LOKF Registrar** - this one - is the **registrar**, and named for it: it checks that each record is well-formed as it is written. Its sibling [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator) is the curator's assistant, named for whom it serves: it puts the source beside the claim and writes down what the person decided. **Neither reaches a verdict of its own: the registrar keeps the paperwork straight, the assistant keeps the record of the decisions, and the judging stays with the person.**

*New to LOKF, with just a vault of ordinary notes? Start at [How this fits](#how-this-fits-the-sidecar-the-doorway-and-your-vault).*

> **Two ways in.** This README is one; the other is a docent. Install [`lokf-docent`](https://github.com/noelmcloughlin/lokf-agent-skills) into whatever agent you already use - `npx skills add noelmcloughlin/lokf-agent-skills --skill lokf-docent --yes` - and ask it anything about this project - *Where does it look for the bundle root?*, say. It answers from `.lokf/knowledge/`, the checked part of what the project knows, says how far each answer has been trusted (still a draft, checked by automation only, or confirmed by a named person), opens the source for exact values, and records what it couldn't answer so the gap gets filled. One door for a person at a prompt, an agent reading this file, or a chatbot that can load a skill. **Agents:** if `.lokf/knowledge/index.md` exists, read it first - `llms.txt` says how to weigh it.

## Why a vault needs a catalogue

The knowledge is already in the vault. What's missing is a way to tell, at a glance, which of it is still sound - and without that you end up re-checking everything yourself, which is the work the vault was supposed to save you, while the notes quietly go stale.

A catalogue is only worth keeping if its records hold their shape. That is this plugin's half of the job: the frontmatter is well-formed, the types are ones the vocabulary knows, the relationships point at notes that exist, and each id is the one this bundle's `base_iri` would give it. Who checked a claim, and when, is a separate question - recorded in the same files and shown in plain words by [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator). Well-formed is the floor all of that stands on: a record nobody can parse is one nobody can vouch for either.

## How this fits: the sidecar, the doorway, and your vault

The pattern every LOKF tool is built around is a **sidecar**: a folder of curated knowledge kept *beside* the raw material it was distilled from - beside the code in a repository, beside the notes in a vault, beside the documents in a shared drive - in the same folder tree and, almost always, the same git repository. The sidecar is `.lokf/`. The bundle inside it is `.lokf/knowledge/` - and, because a dot-folder is hidden from folder pickers, the bundle also goes by a visible name, `knowledge_bundle`. One of the two is the real folder and the other a link onto it; the host decides which ([below](#three-places-a-bundle-can-live)), and nothing else about the bundle changes. Obsidian users already live with this shape: `.obsidian/` is a sidecar too - configuration kept beside your notes, in a dot-folder the app manages and the file explorer never shows. `.lokf/` is a second one, holding the knowledge somebody is prepared to vouch for.

### Where Obsidian comes in

Obsidian is the **curator's desk** - the curator being a person: you. However the bundle was produced - by hand, or derived by the [`lokf-agent-skills`](https://github.com/noelmcloughlin/lokf-agent-skills) - the person who checks it works in Obsidian, and reaches the bundle one of two ways. Beside code, `knowledge_bundle` is a link: **File → Open folder as vault**, pick it, and the bundle opens as a small vault of its own, every note a concept, nothing to configure - Obsidian treats a linked folder like any other vault and keeps its workspace state inside it (the real `.lokf/knowledge/.obsidian/`, which the sidecar's gitignore expects); on Windows the link is a junction (`mklink /J knowledge_bundle .lokf\knowledge`, no administrator rights), and where a sync service has dropped it you open `.lokf/knowledge` by typing the path. Inside your own vault, `knowledge_bundle/` is a real folder among your notes and you open nothing new: this plugin finds it on its own. Same desk either way: this plugin, the registrar, keeps the records well-formed as you type; [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator), the assistant, records what you confirm.

The skills and the plugins never call each other. The skills run where an agent runs, in a terminal at the host; the plugins run in Obsidian; the bundle is the only thing they share. Role by role:

| Role | In a terminal, or in CI | In Obsidian |
| --- | --- | --- |
| Sets up the sidecar | `lokf-sidecar` skill, once | - (a hand-made bundle starts from **Insert the bundle's semantic header**) |
| **Librarian** - derives concepts from sources, keeps them fresh | `lokf-librarian` skill, on a schedule | - (deriving is an agent's job; **Promote body links to typed relations** is the one hand-authoring aid here) |
| **Registrar** - keeps every record well-formed and its provenance paperwork straight; clerical, so tools do it | `lokf validate`; the `knowledge-registrar.yaml` gate on each pull request | **LOKF Registrar**, as you type |
| **Curator** - always a person; confirms, corrects, retires, sends back | the `lokf-curator` skill's review session - the person's assistant in a terminal | **LOKF Curator** - the same assistant in Obsidian: the same session, the same five verbs, the same fields, specified by the same two reference files |
| **Docent** - answers readers from the bundle | `lokf-docent` skill; `lokf serve` for SPARQL queries and a graph view | - (readers open the vault; nothing in Obsidian writes on a reader's behalf) |

### Three places a bundle can live

**A code repository.** The librarian derives the bundle from code and docs; you review it through the doorway. Concepts cite sources that sit *above* the small vault you opened - `src/…`, `docs/…` - so a review shows those as paths to copy rather than pretending to open them.

**Your vault, kept in git.** Run the skills at the host and the sidecar is created beside your notes. If the host is a vault, `lokf-sidecar` sets the bundle up the visible way round: `knowledge_bundle/` is a real folder among your notes - explorer, graph, search and sync like any other, and inside the vault even when the vault is a subfolder of the repository - and `.lokf/knowledge` is the link the tools follow. This plugin recognises that folder with nothing to configure, and you can still open it on its own, as a smaller vault, when you want to focus. Prefer the hidden layout instead and your main vault simply never sees the sidecar: Obsidian indexes neither a dot-folder nor a link that resolves back inside the vault, so notes and bundle never index one file twice - the one hazard behind its caution about nested vaults - and you curate in a second vault opened through the doorway. Either way it is one repository, not two: the bundle travels with the notes it was distilled from, and splitting it into a repository of its own is a later choice for a team, never a starting one.

**A shared drive or a SharePoint library.** The sidecar is just files, and the visible layout is the natural fit: `knowledge_bundle/` syncs as an ordinary folder, and so does `.lokf/` (Microsoft's list of restricted OneDrive and SharePoint names has nothing against a leading dot). Only the tools' link is per-machine, because OneDrive syncs neither symbolic links nor junctions - `just lokf-link` recreates it.

**Many hosts, one vault.** Obsidian follows a link whose target lies *outside* the vault. Link each repository's `.lokf/knowledge` into a folder of your own vault (`projects/acme-knowledge → ~/git/acme/.lokf/knowledge`) and list those folders under *Bundle root folders*: every bundle you curate, in one vault, beside the notes you keep about them - and the sources now sit inside the vault, so LOKF Curator can open them beside the claim. Keep such links out of Obsidian Sync, which does not carry them.

### Am I supposed to migrate my vault into a bundle?

No - and it is never the goal. Your vault is the **workshop**: quick notes, half-thoughts, everything that makes Obsidian yours. The bundle is the **exhibition**: the part you would hand to a teammate, a new hire, a CI gate, or an agent answering questions on your behalf, because every record in it says what it is, what it relates to, where it came from, and who last checked it. Some vaults are exhibitions by nature - a team wiki, a handbook - and then the vault simply *is* the bundle: put the header on its root `index.md` and every note is a record. Most personal vaults instead keep a bundle as a folder among their folders, or grow one in a sidecar. What moves into a bundle is *curated* knowledge - what someone is willing to put on **exhibit** and keep standing behind, and no more.

### The short version

1. Make or keep your vault the Obsidian way.
2. Decide what hosts the bundle: a code repository, your vault, or a shared folder - and whether the whole vault is the bundle, or a folder in it, or the sidecar beside it.
3. Install this plugin, and LOKF Curator when you are ready to start confirming.
4. If you want an agent to build the bundle and keep it up to date: in a terminal at the host, install the [skills](https://github.com/noelmcloughlin/lokf-agent-skills), run `lokf-sidecar` once, then `lokf-librarian`.
5. Open the bundle - the `knowledge_bundle/` folder as its own vault, or as a folder inside yours - and check a few concepts at a sitting; the number to watch is *confirmed by a person*, and it is meant to rise slowly.

## What it looks like

Open a vault that holds a bundle ([Usage](#usage) says how one is recognised) and the status-bar item reads **LOKF ✓** when everything checks out, **LOKF ⚠ 3** for warnings, **LOKF ✖ 1** the moment something is structurally wrong - a malformed web address where the bundle's `base_iri` should be, a relationship that points nowhere. In a vault with no bundle it reads **LOKF: no bundle** and stays out of the way.

Click it, or run **Validate vault** from the command palette, and a side panel opens: notes grouped by folder, the one you're editing pinned at the top, each finding named in plain language with the file one click away. A filter box narrows the list as you type (`sev:error`, `rule:lokf/2`, or any text), and a **Go to a finding** quick-switcher (plus next/previous-finding commands) jumps straight to the offending line. Right-clicking a finding offers to copy its message, open it, apply its one safe fix, or silence the whole note; when a file's findings span several frontmatter keys they group under each. Nothing is ever silently rejected - see [Philosophy](docs/for-the-curious.md#philosophy-warnings-not-errors-almost-everywhere).

You don't have to open the panel to catch a problem. **As you type, the offending frontmatter value is underlined** - wavy red for an error, amber for a warning, the finding on hover - and editing a note re-checks just that note instead of rescanning the whole vault. **Autocomplete** offers the values a field expects - a `type`, `genre`, or `status`, a relation's predicate, or a relation target from elsewhere in the bundle. Both are on by default and switch off under *Settings → In-editor diagnostics*.

## Install

Not yet in the community store - the first release is in preparation. Until then, the options are:

- **From source** - `npm ci && npm run build`, then copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/lokf-registrar/` and enable the plugin under **Settings → Community plugins**.
- **From a GitHub release** - once one is published, the same three files are attached to it; copy them to the same place.
- **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** - add `noelmcloughlin/obsidian-lokf-registrar` as a beta plugin once a release exists, and BRAT keeps it updated.

Requires Obsidian **1.13.0** or later (declarative settings API).

## Usage

**With nothing configured, what is in the vault decides.**

1. If the root `index.md` carries a LOKF header, the whole vault is the bundle - the case whenever you open a `knowledge_bundle/` folder as its own vault, or for any vault that is a bundle outright - and the plugin checks all of it.
2. Otherwise, if there is a top-level `knowledge_bundle/` folder with its own `index.md`, that folder is the bundle, and every note outside it is left alone.
3. Otherwise the vault has **no bundle**: it is an ordinary notes vault, the workshop with no exhibition in it yet. Nothing is scanned, nothing is warned about, the status bar reads *LOKF: no bundle*, and every command says so instead of acting.

The plugin never treats a notes vault as a bundle on its own. If you want it to anyway - the whole vault really is one and its root `index.md` just has no LOKF header yet, or you would rather have every note checked - the switch under *Settings → Scope and performance → Treat the vault root as the bundle* does that.

**A bundle as a folder inside a larger vault, or several of them:** list the folders under *Settings → Scope and performance → Bundle root folders* (comma-separated, e.g. `bird-watching, projects/art-portfolio`). Each becomes an independent bundle: its own `<folder>/index.md` and `base_iri`, with ids and relations worked out and checked against that folder alone. A note outside every listed folder is ignored entirely - as if it didn't exist. A folder inside a dot-folder is accepted but only scanned if something has put it in Obsidian's index (the community plugin *Hidden Folders Access* does that for a folder you choose); otherwise the scan says so instead of reporting an empty bundle as clean.

**Insert the bundle's semantic header** targets whichever bundle the active note belongs to; with several roots configured and no note open in any of them, it asks you to open one first rather than guessing which bundle you meant. In a vault with no bundle it creates one - a `knowledge_bundle/` folder with a header in its `index.md`, the layout the sidecar uses inside a vault - rather than turning the vault root into one: the notes around it were never LOKF concepts, so a header on the root would describe an exhibition that does not exist. What goes *into* the new bundle is lokf-librarian's job, or yours.

Open the command palette and search for **LOKF**:

| Command | What it does |
| --- | --- |
| Validate vault (full LOKF report) | Scan everything and open the report panel |
| Validate active note | Check the current note |
| Insert the bundle's semantic header | Adds a starter header to the bundle's `index.md`, only if it has no frontmatter at all; in a vault with no bundle, creates `knowledge_bundle/` and puts the header there |
| Find a concept (by name, type, or relations) | Keyboard-first quick-switcher over every concept in the bundle |
| Find an orphan concept (nothing links to it) | Lists the concepts nothing else links to |
| Look up a LOKF field | Searchable reference of the LOKF frontmatter fields and what each one means |
| Go to a finding (search all findings) | Keyboard-first quick-switcher over every finding; opens the note on the offending line |
| Go to next / previous finding | Cycle through the report's findings, jumping to each |
| Fix safe issues in the active note | Applies the deterministic fixes (see [Philosophy](docs/for-the-curious.md#philosophy-warnings-not-errors-almost-everywhere)) in one undo step |
| Fix safe issues across the vault | Applies the same deterministic fixes to every note in one pass, after a confirmation |
| Promote body links to typed relations… | Guesses a typed relation for each body link and lets you confirm which to add - the hand-authoring aid for a bundle no agent maintains; a person confirms every guess, which is what keeps it on the registrar's side of the line |
| Add Obsidian affordances to the active note | Tags the note with its Diátaxis `genre` and lists its typed relations as `[[wikilinks]]`, in one managed block (tag pane + graph + backlinks) |
| Generate Obsidian affordances across the vault | Does that for every concept, plus a Diátaxis map per bundle, after a confirmation |
| Generate the Diátaxis map for this bundle | Builds or refreshes `diataxis.md`, grouping concepts by `genre` into the four Diátaxis quadrants - written as a `Document` record with its own header and `generated` provenance, so `lokf validate` and the CI gate accept the bundle it sits in |

Clicking the status-bar item validates the active note, or runs a vault scan if none is open.

## Settings

Configure under **Settings → LOKF Registrar**. Every setting can be found through Obsidian's settings search as well as in the tab itself.

- **This device** - a switch for this computer or phone only: it silences the plugin (status bar, underlines, autocomplete, and scanning) here and nowhere else. It is never synced, so a vault you also carry on your phone can have the plugin off there and on at your desk.
- **In-editor diagnostics** - the two live editor aids, both on by default and both raw-frontmatter (Source mode) only: underlining a finding's value as you type (wavy red for an error, amber for a warning, the finding on hover), and autocompleting the values a field expects - a `type`, `genre`, or `status`, a relation's predicate, or a relation target from the bundle.
- **Type vocabulary** - the known LOKF classes, whether an unrecognized `type` is worth a warning (never an error), and the accepted `genre` values.
- **Type-specific fields** - toggle the recommended-field warnings for `Metric`/`Service`/`GlossaryTerm` concepts.
- **Semantic header & base_iri** - the authority denylist (domains a `base_iri` must not live inside), the placeholder-domain list (treated as "pending", not a violation), and whether a missing header is worth a warning at all.
- **Relationships** - whether to check that a relationship target inside this bundle resolves to a real file (both full IRIs under `base_iri` and bare relative paths are checked; external IRIs never are). A broken link is always a warning, never an error - LOKF is deliberately permissive about cross-links. Also an off-by-default check of `relations[].predicate` against a configurable list, since the full RelationType vocabulary lives in the LOKF schema.
- **OKF v0.2 base layer** - whether to check the OKF v0.2 rules the LOKF schema already subsumes: a required `type`, the `Attested Computation` contract shape, reserved `index.md`/`log.md` structure, and v0.1→v0.2 migration hints. On by default so a bundle stays checkable on its own; turn it off if you run a [dedicated OKF validator](#alternative-plugins). Severity follows the spec: what OKF marks REQUIRED/MUST is an error, the rest a warning.
- **Enforce OKF conformance as errors** - on by default, and **not recommended to turn off**: it's a break-glass escape hatch. Turning it off downgrades the OKF-required errors (a missing `type`, an `Attested Computation` with no `runtime`, a non-root `index.md` with frontmatter, a non-ISO `log.md` date, a missing `generated.by` or source `resource`) to warnings, so a non-conformant bundle stops being flagged as broken - use it only to unblock temporarily (e.g. mid-migration) while you fix the data. LOKF's own structural errors are unaffected.
- **Trust & lifecycle (OKF v0.2 §5)** - whether to validate the *shape* of the `verified`/`generated` provenance, `status`, `stale_after`, and `sources` fields a bundle uses (never their credibility *depth* or trust-tier verdict), plus the accepted `status` values. The two fields OKF marks REQUIRED - a `generated.by` actor and each source's `resource` - are errors (relaxable via *Enforce OKF conformance*); the rest are warnings. Nothing fires on a bundle that carries no §5 fields.
- **Rule severity** - a list of rule ids whose warnings you want raised to errors (for a team that wants stricter gating). Escalation only: a finding that is already an error by default is never downgraded, so this can only make the check stricter, never invert the "warnings, not errors" contract.
- **Field aliasing (advanced)** - `user=canonical` pairs (e.g. `depends_on=dependsOn`) that rename a vault's own frontmatter keys onto the LOKF ones before checking, so a vault that never adopted the canonical spellings can still be validated. Off by default, because turning it on stops the plugin flagging the divergence - use it only when the alternative spelling is deliberate.
- **Scope & performance** - the [bundle root folders](#usage) for a vault holding several independent bundles as project folders (left empty, a root `index.md` with a LOKF header or a top-level `knowledge_bundle/` is detected on its own, and a vault with neither has no bundle), the break-glass **Treat the vault root as the bundle** switch for the whole-vault case with no header, excluded folders, a **per-note opt-out key** (a note with `lokf: ignore` in its frontmatter is silenced - no findings, underlines, or report rows - while still counting as a concept in the bundle graph), and the batch size used for large vaults.

## For the curious

The sections above are everything you need to use the plugin. The reasoning behind it - what LOKF adds over plain OKF, the OKF v0.2 rules checked underneath, what is deliberately left unchecked, where the plugin sits on the four-tier trust model, and why almost everything is a warning rather than an error - is in [docs/for-the-curious.md](docs/for-the-curious.md).

## Privacy

This plugin makes **no network requests** and has no telemetry, analytics, or external services of any kind. It reads Markdown files in the open vault and writes only when you explicitly run a command or report action that edits a note - the semantic-header, safe-fix, promote-relations, and Obsidian-affordance commands, and the report's *Fix this finding* / *Silence this note* actions (the affordance commands add a managed body block or a `diataxis.md` map; everything else edits frontmatter). It stores its settings in the vault's own plugin data. Nothing leaves your machine.

## For other plugins: a read-only API

A sibling plugin or agent (for example LOKF Curator) can read validation state without either plugin depending on the other, at `app.plugins.plugins["lokf-registrar"].api`:

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
  fixtures/         frozen copy of the lokf-sidecar template skeleton the smoke test validates
docs/               the reasoning behind the checks, moved out of this README
.lokf/              this repository's own LOKF knowledge bundle (a uv/Python sidecar)
```

`src/validator.ts` is deliberately import-free - no Obsidian, no YAML parser - and takes already-parsed frontmatter, so the whole rule set runs under plain Node via `npm run smoke-test` with no Obsidian install. Parsing happens in `src/main.ts` using Obsidian's own `parseYaml`.

## Credits

- [Nolan Nichols](https://lokf.nolan-nichols.com/), creator of [LOKF](https://lokf.nolan-nichols.com/specification/) (Linked Open Knowledge Format) and its [toolkit](https://github.com/nicholsn/lokf).
- The [LinkML Community](https://linkml.io/), creators of [LinkML](https://linkml.io/linkml/), the schema language LOKF is written in.
- [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin), whose build/lint/release layout this repository follows.
- [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills) - the registrar role this plugin fills in the editor, whose trust model and plain-language labels this README shares, and whose bundle template the smoke test validates.
- [LOKF Curator](https://github.com/noelmcloughlin/obsidian-lokf-curator) - the sibling plugin at the human-confirmed tier, forked from this one, and sharing the bundle-root plumbing in `src/bundle.ts`.

## Alternative plugins

Nothing else checks the LOKF semantic layer, as far as we know. For the plain OKF v0.2 layer beneath it, other validators exist - [OKF Enforcer](https://github.com/MartinForReal/okf-enforcer), for one; the same base rules are checked here, so none is required, but turn off *Settings → OKF v0.2 base layer* if you would rather a dedicated one took over.

## About this repository's own knowledge bundle

This repository keeps a LOKF bundle of its own under `.lokf/knowledge/` - documentation about the plugin, in the format the plugin checks. It is maintained by the [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills), which a scheduled [workflow](.github/workflows/knowledge-librarian.yaml) installs at run time (they are never committed - `.agents/`, `.claude/`, and `skills-lock.json` are git-ignored). None of this is part of the plugin - you don't need any skill to use it. It is also what the docent answers from: install `lokf-docent` and ask about this plugin instead of reading the whole README - the notice at the top says how. If you want to contribute to that bundle, [CONTRIBUTING.md](CONTRIBUTING.md#agent-skills-optional---only-for-editing-this-repos-own-lokf-bundle) says which skills that takes.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the dev setup and the pre-PR checklist; participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md), and [AI_COVENANT.md](AI_COVENANT.md) sets out how AI-assisted contributions are handled here.

## Security

Please review the repository security policy at [SECURITY.md](SECURITY.md) before using the agent-driven knowledge workflow or GitHub automation in this repo.

## License

Apache-2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE).
