# Publishing LOKF Enforcer to the Obsidian Community Store

This guide walks through everything from a fresh GitHub repo to an accepted listing.
Replace `noelmcloughlin` everywhere it appears (manifest.json, LICENSE,
community-plugin-entry.json) with your real GitHub handle and display name first,
if forking this for your own plugin.

## 0. One-time prerequisites
- A public GitHub account.
- `git` and Node.js 18+ installed locally.

## 1. Fill in your identity
Search-and-replace these placeholders across the repo before committing (if forking):
- `Noel McLoughlin` -> your name (manifest.json `author`, LICENSE copyright line)
- `noelmcloughlin`   -> your GitHub username (manifest.json `authorUrl`, repo URLs)

Confirm none remain:
    grep -rn "noelmcloughlin\|Noel McLoughlin" .

## 2. Create the GitHub repository
The repo is named `obsidian-lokf-enforcer` - the manifest `id`/`name` stay plain
`lokf-enforcer` (Obsidian's naming guideline against redundant "obsidian"/"plugin"
wording applies to those, not to the repo name; Obsidian's installer and the
community store match on `id`, never on the repo name).

    # from inside this folder
    git init
    git add .
    git commit -m "Initial release: LOKF Enforcer v0.1.0"
    git branch -M main
    git remote add origin https://github.com/noelmcloughlin/obsidian-lokf-enforcer.git
    git push -u origin main

## 3. Create the GitHub release
Obsidian installs plugins from a GitHub *release* whose tag is the exact version
number - **no leading `v`** (tag must be `0.1.0`, not `v0.1.0`).

Attach these three files as individual release assets (NOT zipped):
- `main.js`
- `manifest.json`
- `styles.css`

Using the GitHub CLI:

    gh release create 0.1.0 main.js manifest.json styles.css \
      --title "0.1.0" --notes "First release."

Or via the web UI: Releases -> Draft a new release -> tag `0.1.0` ->
upload the three files -> Publish.

## 4. Verify the repo structure
The submission bot checks for these at the repo root:
- [x] `manifest.json` (with `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `isDesktopOnly`)
- [x] `versions.json`
- [x] `main.js` **attached to the release** (it is git-ignored, not committed - the
      release workflow builds it)
- [x] `README.md`
- [x] `LICENSE`
- [x] A release tagged `0.1.0` with main.js + manifest.json + styles.css attached

## 5. Submit to obsidianmd/obsidian-releases
1. Fork https://github.com/obsidianmd/obsidian-releases
2. Edit `community-plugins.json` and append your entry as the **last** array element
   (the contents are in `community-plugin-entry.json` in this repo - copy that object in,
   keeping the existing entries and adding a comma after the previous one).
3. Commit and open a Pull Request against `obsidianmd/obsidian-releases`.
4. The PR template asks you to confirm a checklist - tick the items (they match section 4).
5. An automated bot validates your repo/release; fix anything it flags. A human reviewer
   then reviews the code. Be responsive to comments - this can take days to weeks.

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

## 6. After acceptance
Once merged, the plugin appears in **Settings -> Community plugins -> Browse** within a
few hours. Future updates: bump the version with `npm version patch|minor|major`
(this runs `version-bump.mjs` to update manifest.json + versions.json), commit, then
create a new GitHub release tagged with the new version and the three assets attached.
You do NOT submit another PR for updates - Obsidian picks up new releases automatically.

## Common rejection reasons to avoid
- Tag has a leading `v` (must be bare `0.1.0`).
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
