# Publishing LOKF Enforcer to the Obsidian Community Store

**Current status: not yet submitted.** No release that Obsidian or the
`obsidian-releases` bot can find exists yet - see `MYPLAN.md`'s "Release state"
section. Start at **§1** below for the actual next step; the fresh-repo
bootstrap this repo already went through is kept at the foot, for forks only.

## 1. Submit to obsidianmd/obsidian-releases

First, cut a real release - follow [CONTRIBUTING.md](CONTRIBUTING.md)'s release
flow, not the manual `gh release create` this guide used to describe: a PR
carrying the version bump, then a bare tag (no leading `v`) on the merge
commit, which `release.yml` turns into a draft carrying `main.js`,
`manifest.json`, and `styles.css`. Publish that draft by hand.

Then:
1. Fork https://github.com/obsidianmd/obsidian-releases
2. Edit `community-plugins.json` and append your entry as the **last** array element
   (the contents are in `community-plugin-entry.json` in this repo - copy that object in,
   keeping the existing entries and adding a comma after the previous one).
3. Commit and open a Pull Request against `obsidianmd/obsidian-releases`.
4. The PR template asks you to confirm a checklist - tick the items (they match
   the "repo structure" checklist below).
5. An automated bot validates your repo/release; fix anything it flags. A human reviewer
   then reviews the code. Be responsive to comments - this can take days to weeks.

The bot checks for these at the repo root:
- [x] `manifest.json` (with `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `isDesktopOnly`)
- [x] `versions.json`
- [ ] `main.js` **attached to the release** (it is git-ignored, not committed - the
      release workflow builds it) - not yet, pending the release above
- [x] `README.md`
- [x] `LICENSE`
- [ ] A release tagged with the bare version, `main.js` + `manifest.json` + `styles.css` attached

### A note for reviewers on the soft OKF Enforcer dependency
LOKF Enforcer intentionally only validates the LOKF semantic layer (bundle-root
header, type vocabulary, typed relationships) and relies on a separately
installed OKF v0.2 validator (such as OKF Enforcer) for core OKF checks
(required `type`, provenance/trust/lifecycle, Attested Computation). This is a
**soft, runtime-detected** dependency, not a hard one: the plugin works standalone
with no other plugin installed - it just then only reports on the LOKF-specific
surface, with a one-time in-app notice recommending an OKF validator be added
for full coverage. It does not require, load, or call into any other plugin's
code.

## 2. After acceptance
Once merged, the plugin appears in **Settings -> Community plugins -> Browse** within a
few hours. Future updates follow the release flow in [CONTRIBUTING.md](CONTRIBUTING.md):
a PR carrying the version bump (`npm version ... --no-git-tag-version` updates
manifest.json + versions.json), then a bare tag on the merge commit, which the
release workflow turns into a draft release with the three assets attached.
You do NOT submit another PR to obsidian-releases for updates - Obsidian picks up
new releases automatically.

## Common rejection reasons to avoid
- Tag has a leading `v` (must be bare, e.g. `0.3.0` not `v0.3.0`).
- `main.js`/`manifest.json`/`styles.css` zipped instead of attached individually.
- `manifest.json` id doesn't match across repo, or contains `obsidian`/`plugin` in the name.
- Using `innerHTML`/`outerHTML` or inline styles instead of the DOM API + CSS classes
  (this plugin already uses `createEl`/`createDiv` and a `styles.css`).
- Hand-building a settings tab in `display()`, which is deprecated as of 1.13.0 and
  leaves your settings invisible to Obsidian's settings search. This plugin returns
  definitions from `getSettingDefinitions()` instead, with `group` headings rather
  than hand-styled `<h3>` elements; `minAppVersion` is 1.13.0 accordingly.
- **Detaching leaves in `onunload`.** The official guidelines call this out
  explicitly: on plugin update, any open leaves get reinitialized at their original
  position regardless of where the user moved them. This plugin deliberately has no
  `onunload` - Obsidian cleans up views, commands, and `registerEvent` handlers on
  its own.
- Including the plugin id in command ids (Obsidian already namespaces them as
  `lokf-enforcer:<id>`).

---

## Appendix: fresh-repo bootstrap (historical for this repo; forks only)

This repo already went through the steps below - identity is filled in, and
it's on GitHub at `noelmcloughlin/obsidian-lokf-enforcer`. Skip this section
unless you're forking LOKF Enforcer into a new plugin of your own.

### A. Prerequisites
- A public GitHub account.
- `git` and Node.js 20+ installed locally (CI builds on 20, 22, and 24).

### B. Fill in your identity
Search-and-replace these placeholders across the repo before committing:
- `Noel McLoughlin` -> your name (manifest.json `author`, LICENSE copyright line)
- `noelmcloughlin`   -> your GitHub username (manifest.json `authorUrl`, repo URLs)

Confirm none remain:
    grep -rn "noelmcloughlin\|Noel McLoughlin" .

### C. Create the GitHub repository
Pick your own repo name - the manifest `id`/`name` stay plain (no redundant
`obsidian`/`plugin` wording; Obsidian's naming guideline covers those, not the
repo name); the installer and community store match on `id`, never on repo name.

    # from inside this folder
    git init
    git add .
    git commit -m "Initial release: <your plugin name> v0.1.0"
    git branch -M main
    git remote add origin https://github.com/<you>/<your-repo>.git
    git push -u origin main

From here, follow §1 above for the first real release and submission.
