# LOKF Curator — Obsidian plugin implementation plan

Plugin id `lokf-curator`, repo `obsidian-lokf-curator`, forked from
`obsidian-lokf-enforcer`. Implements the `lokf-curator` skill's three steps
as an in-editor workflow: a read-only trust report, a one-concept-at-a-time
review session that writes verdicts into frontmatter, and the two opt-in
extras (curation policy, "something is missing"). Spec of record:
`lokf-agent-skills/skills/lokf-curator/SKILL.md` and its `references/`
(`trust-fields.md` for the label rules, `review-session.md` for the exact
YAML each verb writes). Where this plan deviates from the skill because a
plugin is not an agent, it says so and why.

## 1. Scope and non-goals

**It is** the human curator's assistant, in the museum sense: it computes
trust labels from frontmatter, ranks what deserves a look, puts the source
next to the claim, and records exactly what the person decides. It has no
AI, no network, no dependency on `lokf-enforcer`, on any skill, or on any
other plugin - the same interoperability stance as the enforcer. Everything
it computes is arithmetic over YAML; everything it writes is one of five
verbs the person chose for one concept.

**It is not** a validator (that's `lokf-enforcer`, schema-valid tier), a
deriver of concepts (the librarian), or a verifier of anything. It decides
nothing. The guardrails in §6.6 are the product.

**Deliberately out of scope:** the pull-request handoff (Obsidian Git or the
person's own git flow does that - the plugin's job ends at the changed
files); `just lokf-validate` (no `uv`, no shell - point at `lokf-enforcer`
for in-editor checking instead); SPARQL/`lokf serve` queries; domain-schema
authoring.

## 2. What the fork carries over

The enforcer's value to this plugin is its plumbing, not its rules. File by
file:

| Enforcer file | Curator | Why |
| --- | --- | --- |
| `src/validator.ts` - bundle-root functions (`normalizeBundleRoot(s)`, `hiddenRootSegment`, `resolveBundleRoot`, `bundleRootIndexPath`, `toBundlePath`, `toVaultPath`), `splitFrontmatter`, `readBaseIri`, `isReserved`, `isExcluded`, `parseCsv`/`joinCsv`, `KNOWN_LOKF_TYPES`, `normalizeTypeKey`, `RELATION_FIELDS`, `resolveRelationTarget`, `mintExpectedId`, `asScalar` | **keep**, moved to `src/bundle.ts` | Multi-bundle-root resolution, relation-target resolution (needed for "N other concepts rely on this"), the 14-class check, and the scalar/shape hygiene are all reused as-is. |
| `src/validator.ts` - `validateRootHeader`, `validateTypeVocabulary`, `validateRelationships`, `validateConceptId`, `missingRootIndexIssues`, `LokfIssue`/severity types | **delete** | Rules are the enforcer's job. Duplicating them here is the thing both READMEs promise not to do. |
| `src/main.ts` - plugin lifecycle, `bundleRoots()` memo, `resolveRoot`, `baseIriCache`/`findBaseIriFor`/`invalidateBaseIri` (folder-aware), `candidateFiles`, `readOrNull`, `processQueue`, `hiddenRootIssues`/`missingBundleRootIssues`, `resolveScaffoldTarget` | **keep** the scaffolding; **rewrite** the scan body | Same scan skeleton over the same notion of "which bundle does this note belong to". The per-file work becomes "compute this concept's trust record" instead of "run rules". The three misconfigured-root findings stay - an empty report must still blame the right thing. |
| `src/main.ts` - `scaffoldRootHeader`, sibling-notice, `validateActive` | **delete** | Not this plugin's concern (the notice becomes "install lokf-enforcer for schema checks"? No - no cross-promotion; drop it). |
| `src/report-view.ts` - `ItemView` skeleton, progress bar, folder grouping, click-to-open, expand/collapse state | **keep**, renamed `src/curator-view.ts`, content rewritten | Same panel mechanics; different content (§5.3). |
| `src/settings.ts` - declarative tab, CSV keys, `validate` hooks, `bundleRoots` control | **keep**; swap the rule settings for §7's | The `bundleRoots` control and its dot-folder rejection carry over verbatim. |
| `scripts/smoke-test.ts` - harness, `expect`/`section`, bundle walker, golden-fixture runner | **keep**; fixtures change | The pure modules get the same plain-Node treatment (§8). |
| `.github/workflows/build.yml`, `release.yml`, `.npmrc`, `version-bump.mjs`, `esbuild.config.mjs`, `eslint.config.mts`, `tsconfig.json` | **keep** | Identical build/release flow. |
| `.github/workflows/knowledge-{librarian,validate}.yaml`, `.lokf/` | **re-scaffold** with `lokf-scaffolding` in the fork, don't copy | The bundle describes *this* plugin; the enforcer's would be wrong. The workflows are the template's; copying the enforcer's just carries its pins. |
| `README.md`, `CHANGELOG.md`, `versions.json`, `manifest.json`, `package.json`, `community-plugin-entry.json` | **rewrite** (§11) | |
| `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `NOTICE`, `llms.txt` | **keep**, names swapped | |

## 3. Architecture

Same split as the enforcer, which is what makes it testable: pure modules
that run under plain Node, and one Obsidian-facing orchestrator.

```text
src/
  bundle.ts        pure - bundle-root resolution, frontmatter split, relation
                   target resolution, 14-class check   (copied from enforcer)
  trust.ts         pure - one concept's trust record from its frontmatter
                   + headings; the health counts; the ranked queue;
                   stale_after derivation; all label rules from trust-fields.md
  edits.ts         pure - string transforms for every write: append a
                   `verified` event, normalize a bare mapping, add/remove
                   `## Open questions`, append a note bullet, upsert today's
                   Curation/Deprecation lines in log.md, render the policy
                   and placeholder templates
  main.ts          Obsidian - scan bundles via metadataCache, cache trust
                   records, own the review session, perform writes through
                   processFrontMatter / vault.process, commands
  curator-view.ts  Obsidian - the side panel: report + review card
  settings.ts      Obsidian - declarative settings tab
scripts/
  smoke-test.ts    plain Node - trust.ts / edits.ts / bundle.ts against a
                   frozen fixture bundle with a fixed "today"
  fixtures/curation-bundle/   every label state, on purpose (§8)
```

Two rules that keep it honest:

- **Pure modules take `today` as a parameter.** Never `Date.now()` below
  `main.ts`. Every label involving a date is then reproducible in a test.
- **Pure modules take already-parsed frontmatter plus a heading list.**
  Parsing stays in `main.ts`, exactly as in the enforcer, so `trust.ts`
  needs no YAML dependency and no Obsidian.

## 4. Data model - the trust record

`trust.ts` turns one concept into this, from its frontmatter and the exact
list of heading lines in its body:

```ts
interface TrustRecord {
  path: string;            // vault path
  bundleRoot: string;      // "" or the configured root it resolved to
  id: string;              // frontmatter id, else mintExpectedId(bundlePath, base_iri)
  title: string; type: string; cls: "known" | "unknown" | "invalid-status";
  status: "stable" | "draft" | "deprecated";   // absent -> stable
  humanConfirmed: boolean;     // any verified[].by starts with "human:"
  automationOnly: boolean;     // verified present, no human: actor
  unchecked: boolean;          // no verified key at all
  editedSinceConfirmed: boolean | null;  // null = can't tell (no generated.at / timestamp)
  pastReview: boolean; dueSoon: boolean; // from stale_after vs today, 30-day window
  hasOpenQuestions: boolean;   // an exact "## Open questions" heading exists
  firstOpenQuestion: string | null;      // first bullet under it (read lazily, §5.2)
  reliedOnBy: number;          // filled in a second pass over all records
  generatedAt: string | null;  // ISO, for "newest" tie-breaks
  source: string | null;       // resource, else sources[0].resource, else null
}
```

Rules are `trust-fields.md`'s, verbatim - the plan does not restate them.
The parsing notes there that bite a plugin specifically:

- **YAML dates become `Date` objects.** Obsidian's `parseYaml` (and js-yaml
  in the smoke test) turn an unquoted `stale_after: 2027-03-08` into a
  `Date`, and the same for unquoted `at:` timestamps. Every date reader
  accepts `string | Date` and normalizes to `YYYY-MM-DD` before the
  string comparison the spec prescribes. **Verify on day one** whether
  `metadataCache`'s `frontmatter` does the same or keeps strings - the
  answer decides whether §5.1's zero-read scan is safe or needs a fallback
  read for date fields.
- **Bare `verified` mapping** is a one-element list on read; it is
  rewritten as a list on the first write that touches it (`edits.ts`).
- **`status`** outside `draft|stable|deprecated` -> the concept counts under
  "doesn't fit the vocabulary", not as stable.
- **`## Open questions` is a heading, not a substring.** With
  `metadataCache.getFileCache(file).headings` this is free and exact - match
  `level === 2 && heading === "Open questions"`. Never grep the body.
- **Retired** (`deprecated`) is counted once and excluded from every other
  label and from the queue.
- **Reliance count** needs every concept's `id` resolved first (full IRI or
  bundle-relative, against that bundle's `base_iri`), then one pass over
  every concept's ten relation fields plus `relations[].target`. Cross-bundle
  targets (a concept in bundle A pointing at bundle B's IRI) count for B -
  the map is keyed by IRI, not by bundle.

## 5. Step 1 - the report (read-only, always available)

### 5.1 Scan

Reuses the enforcer's `candidateFiles()` (configDir excluded, `excludeFolders`,
`isInBundle`) and its per-root misconfiguration findings. The per-file work
reads **no file contents**: `metadataCache.getFileCache(file)` gives
`frontmatter` and `headings`, which is everything `trust.ts` needs (subject
to the date-type check in §4). A bundle of hundreds of concepts computes in
milliseconds and needs no progress bar; keep `processQueue` anyway for the
one case it helps - the cache-miss fallback that reads a file the cache
hasn't indexed yet.

Refresh: on `metadataCache.on("changed")` for any file in a bundle, and on
`vault.on("delete"|"rename")`, debounced (300 ms) - recompute the whole
report (it's cheap) rather than patching one record, because the reliance
counts are global.

### 5.2 Computation

Per bundle root (several bundles = several reports, each with its own `N`):

1. Health line - the seven counts. Not a partition; only `N` is a total.
2. Queue - at most `queueSize` (default 5), ranked exactly as
   `trust-fields.md` §Ranking: (past review OR edited-since-confirmed) →
   (draft WITH open questions) → (nobody has checked) → (draft without open
   questions, automation-only); within a group most-relied-upon, then newest
   `generated.at`. Never by class.
3. Open questions the librarian left - title + first bullet. The first
   bullet needs the body: read lazily, only for concepts that have the
   heading (typically a handful), via `vault.cachedRead`.
4. Feedback - see §10, it is usually unreachable; say so rather than "none".
5. Vocabulary fit - types outside the 14 classes, and invalid `status`
   values.
6. `<remaining> more not yet checked.`

### 5.3 The panel (`curator-view.ts`)

A right-leaf `ItemView`, "Curate", opened by a ribbon icon, a command, or a
status-bar item showing `Confirmed a/N` for the active note's bundle. Top to
bottom, mirroring the skill's report order and *nothing more*:

- Bundle selector (only rendered when more than one root is configured).
- The health line as seven chips; the first (`a of N`) visually dominant -
  it is the one number meant to rise.
- "Worth ten minutes today" - up to five cards: title (class) · why it's
  here · source. Click the title to open the note; click the card to start
  reviewing it (§6).
- "Open questions the librarian left" - collapsible list.
- Feedback line, vocabulary line, remaining line.
- One button: "Go through these now" - starts the session at card 1.

The active note, if it is a concept in a bundle, is pinned above the queue
with its own labels and a "Review this note" button - the enforcer's
active-note pattern, so a person reading a concept can judge it without
hunting for it in the queue.

## 6. Step 2 - the review session

### 6.1 Who is recording

No `gh`, no `git` from inside Obsidian (and `no-nodejs-modules` forbids
reaching for `child_process`; it wouldn't exist on mobile anyway). The actor
is a setting, `curatorId`, validated as a slug (`^[a-z0-9][a-z0-9-]*$`; an
`@` is refused with "never an email - the bundle may be public"). The first
verb pressed while it's empty opens a modal asking for it, with the
skill's confirmation wording ("Record your answers as `human:<id>`?").
Written as the literal `human:<id>`, never a link.

### 6.2 Evidence first

The review card shows, in this order and with the question last:

1. **Source.** `resource` (and each `sources[].resource`). Resolution, in
   order: as a vault path; as a path relative to the concept's bundle root;
   else "outside this vault". Reachable → an "Open source" button that opens
   it in a split leaf beside the concept (`workspace.getLeaf("split")`), so
   source and claim are literally side by side; a `#fragment` or `:line`
   suffix is stripped for opening and shown as a hint. Unreachable → the
   path in monospace with a copy button and the plain sentence "This source
   is outside the vault - open it in your editor." Never pretend to have
   checked it.

   This is the main place the skill's assumptions and a vault's reality
   part ways: a bundle opened as its own vault (`knowledge/` - the only
   working shape for a `.lokf/knowledge` bundle, since dot-folders are
   invisible) can *never* reach `src/…` paths. Say so in the README; don't
   soften it.
2. **Claim.** Title, description, and the type-specific facts (`endpoint`/
   `http_method` for a Service, `unit`/`formula` for a Metric, `definition`
   for a GlossaryTerm, `fields`/`distribution` counts for a Table) - the
   things a source would contradict.
3. **Current trust** - its labels, in the plain words, plus "N other
   concepts rely on this".
4. **The question**, verbatim: *Does the source still say this?* - and the
   plugin never answers it.

Source text is displayed, never interpreted - there is no agent to inject
into, but the README still says the plugin treats it as text, because the
skill does.

### 6.3 The verbs

Five buttons, **Send back** focused by default (the skill's default), each
doing exactly `review-session.md`'s write and nothing else. Frontmatter goes
through `app.fileManager.processFrontMatter(file, fm => …)` - public,
atomic, preserves the rest of the block. Body edits (`## Open questions`)
go through `vault.process(file, text => …)` - atomic read-modify-write.
The transforms themselves are pure functions in `edits.ts`.

| Verb | Frontmatter (via `processFrontMatter`) | Body (via `vault.process`) | Then |
| --- | --- | --- | --- |
| **Confirm** | append `{by: human:<id>, at: now}` to `verified` (bare mapping → list first; existing events untouched); delete `status` if `draft`; set `stale_after` to the proposed date **after** the person accepts or edits it (inline date field, pre-filled from §6.4) | if an `## Open questions` section exists, ask "Are these answered?" - yes deletes the section, no leaves it | log |
| **Wrong - send back** | `status: draft` | append `## Open questions` (create the heading if absent) with `- <today>, human:<id>: <note>`; the note is required, plain prose | log |
| **Wrong - I corrected it** | `generated: {by: human:<id>, at: now}` (replaced, not appended); append a `verified` event; delete `status: draft` | none - the person already edited the note in the editor | log |
| **Retire** | `status: deprecated` | none | log a Deprecation line; the card asks for the one-line reason it needs ("replaced by …") |
| **Later** | keep or set `status: draft`; `stale_after` only if they type a date | none | nothing logged |

"Correct now" is where a plugin differs most from the skill. The skill makes
the minimal edit the person dictates; here the person *is* in the editor and
makes it themselves, then presses the verb. Two guards make that honest: the
card records the file's `stat.mtime` when it opens, and if the file is
unchanged when the verb is pressed it asks "The note hasn't changed - did you
mean Confirm?"; and the verb is disabled until the card has been open at
least once for that file in this session. It still never proposes the
correction.

### 6.4 Proposing `stale_after`

Confirmation date + the interval for the concept's kind, from the curation
policy: three groups exactly as the skill's default table (services/datasets/
tables/metrics/attested computations 6 months; policies/playbooks/tutorials/
references/documents/people/organizations 12; glossary terms/explanations
24). Settings hold those three numbers as the fallback. If
`policies/knowledge-curation.md` exists in the bundle, its table is read -
tolerantly: any row whose first cell mentions a class name and whose second
cell matches `(\d+)\s*months` overrides that class; anything unparseable
leaves the setting in force. The proposed date is always shown before it is
written.

### 6.5 The log

The skill writes one `**Curation**` line per session, and none for a
session that changed nothing. A plugin has no natural session boundary - the
person may press one verb and close the laptop - so the log is
**upserted**: on each verb, find (or create) today's `## YYYY-MM-DD` heading
at the top of the bundle's `log.md` and update the single
`* **Curation**: human:<id> confirmed a, sent back b, corrected c, retired d.`
line for this curator under it (a second curator the same day gets their own
line). Retire adds its own `* **Deprecation**: [Title](../path.md) retired -
<reason>.` line immediately. Net effect matches the skill's convention -
newest first, one Curation line per person per day, nothing logged for
nothing - without a "session end" the person would forget to press.

The repeated-mistake hint ("the same send-back came up more than once") is
worth keeping: if two send-backs in one day share the same first four words
of their note, the Curation line ends with "- <n> similar send-backs;
check the librarian's instructions."

### 6.6 Guardrails, as code

- One verb, one concept, one person's answer. No multi-select, no "confirm
  all", no keyboard shortcut that fires a verb on the next card.
- Never write `index.md` or `log.md` except the log upsert; refuse (and
  say why) if a concept path is a reserved file.
- Never modify or remove an existing `verified` event - `edits.ts` only
  appends, and the smoke test asserts the prior events survive byte-for-
  byte in order.
- Never touch `type`, any relation field, or body text - except the
  `## Open questions` section and nothing else. `processFrontMatter`
  callbacks only assign the keys in §6.3's table; the smoke test diffs the
  before/after frontmatter and fails on any other key changing.
- Never invent or tidy a fact: no autocorrect, no "fix formatting", no
  proposed corrections.
- Stop when they stop: closing the panel or the note ends the session with
  nothing pending; the frontmatter is the progress record.

## 7. Settings

- **Who** - `curatorId` (text, validated slug).
- **Scope** - `bundleRoots` (verbatim from the enforcer, dot-folder
  rejection included), `excludeFolders`.
- **Review intervals** - three numbers (months) for the three groups;
  toggle "prefer `policies/knowledge-curation.md` when present" (default
  on).
- **Queue** - `queueSize` (1–10, default 5), `dueSoonDays` (default 30).
- **Feedback** - `feedbackFile`, a vault-relative path, optional (§10).
- No "sibling plugin" group. Nothing to detect, nothing to recommend.

## 8. Testing

Same harness, same principle: everything below `main.ts` runs under plain
Node against a frozen fixture, with `today` injected.

`scripts/fixtures/curation-bundle/` - a small bundle whose concepts each
exist to hit one state: human-confirmed; automation-only; unchecked; draft
with open questions; draft without; edited since confirmed (`generated.at`
after the human event); past review date; due soon; retired; a bare
`verified` mapping; an unknown `type`; an invalid `status`; a concept that
*mentions* "Open questions" in prose but has no such heading; four concepts
relying on one glossary term. Plus a `policies/knowledge-curation.md` with
one overridden row and one malformed row.

Assertions:

- `trust.ts`: every label per concept; the health line's seven numbers
  exactly; the queue's order exactly (including the glossary term
  outranking an unreferenced service); the same fixture with `today` moved
  forward flips "due soon" to "past review".
- `edits.ts`: each verb's transform on the `review-session.md` example
  frontmatter reproduces its expected YAML shape; existing `verified` events
  preserved in order; bare-mapping normalization; `## Open questions`
  created/appended/deleted correctly and *only* when it is an exact
  heading; log upsert creates today's heading, updates rather than
  duplicates the Curation line, keeps a second curator's line, prepends
  above older dates.
- `bundle.ts`: carried over unchanged from the enforcer's suite.

Manual (real vault, listed in the fork's plan the way the enforcer's are):
the split-leaf source opening; `processFrontMatter` output formatting of
`stale_after` (quoted vs bare - accept either, prefer whatever Obsidian
writes); the `metadataCache` date-type answer; mobile.

## 9. Implementation order

Each phase ends green (`build`, `lint`, `smoke-test`) and usable on its own.

1. **Fork and strip.** New ids everywhere (§11); delete the rule code and
   the scaffold/sibling features; `validator.ts` → `bundle.ts`; suite
   passes on the carried-over functions alone.
2. **`trust.ts` + fixture bundle + tests.** No UI yet. This is most of the
   real logic and all of the spec's rules; get it exactly right in
   isolation.
3. **Step 1 end-to-end.** Scan via `metadataCache`, per-bundle report in
   the panel, status-bar `a/N`, live refresh, misconfigured-root findings.
   Ship-able as a read-only "trust dashboard".
4. **`edits.ts` + tests.** All transforms, still no writes from the UI.
5. **Step 2.** Identity modal, review card, evidence resolution, five
   verbs, log upsert, guardrails. The `stat.mtime` guard on "corrected".
6. **Step 3.** "Create curation policy" and "Record something missing"
   commands with their templates; interval table read from the policy.
7. **README, CHANGELOG, own `.lokf/` bundle via the skills, release.**

## 10. Risks and decisions to take early

- **`feedback.md` is almost never reachable.** It lives at `.lokf/feedback.md`
  - beside `knowledge/`, not inside it. Vault = `knowledge/` puts it one
  level *above* the vault; vault = repo root puts it in a dot-folder. Either
  way the Vault API can't see it. Decision: an optional `feedbackFile`
  setting for the rare layout where it's reachable; otherwise the report
  line reads "Feedback file not reachable from this vault", never "none".
  Reading it through `vault.adapter` is possible but the same read-only-
  audit-of-invisible-files objection applies as in the enforcer's plan.
- **Sources outside the vault** (§6.2) - the common case for a code repo's
  bundle. Accept it, state it, make the copy-path path smooth. Do not
  reach outside the vault.
- **`metadataCache` date types** - verify first thing in phase 3; the
  fallback (a `cachedRead` for concepts with `stale_after`/`verified`) costs
  little.
- **Log per-session vs upsert** (§6.5) - decided: upsert. Confirm the
  librarian's log parser (the skill, and any tooling that reads `log.md`)
  is fine with one line being edited in place across a day. It reads lines,
  not diffs, so it should be.
- **Two curators, one file, sync.** `processFrontMatter` is atomic locally;
  concurrent edits across devices are Obsidian Sync's/git's problem, as for
  any note. Append-only `verified` makes a merge conflict here recoverable.
- **Mobile.** Every API used (`metadataCache`, `processFrontMatter`,
  `vault.process`, `ItemView`, declarative settings) is mobile-safe;
  `isDesktopOnly: false` holds. No Node modules anywhere.
- **Performance.** Reliance counting is O(concepts × relations) per refresh;
  trivial at bundle scale (hundreds), and the refresh is debounced. Revisit
  only if someone shows up with thousands.
- **No enforcer detection, no skill detection.** Consistent with the
  enforcer's decision to drop `app.plugins`. The README places the two
  plugins as companions on different tiers; neither knows the other exists.

## 11. Fork bootstrap checklist

- `manifest.json`: `id: lokf-curator`, `name: LOKF Curator`, `version:
  0.1.0`, `minAppVersion: 1.13.0` (declarative settings), `isDesktopOnly:
  false`, description: "Help a person judge what a LOKF knowledge bundle
  claims: a trust report computed from frontmatter, and a review session
  that records your confirm / send back / retire verdicts in the bundle
  itself. Decides nothing; verifies nothing; writes only what you say."
- `package.json` name `@noelmcloughlin/lokf-curator`; `versions.json` reset
  to `{"0.1.0": "1.13.0"}`; `CHANGELOG.md` restarted at `[Unreleased]`;
  `community-plugin-entry.json` regenerated.
- README in the same house style as the enforcer's (the epigraph, the
  library framing - this plugin is *the curator's desk*; the "For AI
  agents" block; Install; Usage with the vault-shape caveats from §6.2 and
  §10; Settings; "Where this fits" placing it at the **human-confirmed**
  tier, explicitly a companion to `lokf-enforcer` (schema-valid) with no
  dependency either way; Privacy: no network, writes only the five verbs'
  fields; Credits including `lokf-agent-skills`, whose curator skill this
  implements, and OKF Enforcer).
- Scaffold the fork's own `.lokf/` with `lokf-scaffolding`, run the
  librarian once, and - fittingly - curate it with the plugin itself before
  the first release. "Confirmed by a person: n of N" on the plugin's own
  bundle is the honest demo.
- Delete the stale enforcer tags in the fork before the first release
  (`git tag -l` will carry `v0.2.0` over); the release guard would reject it
  anyway, but `git describe` shouldn't lie.
- Note in both READMEs that the enforcer's plan proposed this plugin and
  where the shared pure code came from - one sentence, not a dependency.
