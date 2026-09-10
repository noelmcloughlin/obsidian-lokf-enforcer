# Contributing to LOKF Enforcer

Thanks for your interest in improving LOKF Enforcer!

## Development setup

Node 20+ is required (CI builds on 20, 22, and 24).

```bash
git clone https://github.com/noelmcloughlin/obsidian-lokf-enforcer.git
cd obsidian-lokf-enforcer
npm install
npm run dev      # esbuild watch mode, rebuilding src/main.ts -> main.js
```

`npm run dev` watches and rebuilds; `npm run build` type-checks and produces a minified production bundle.

To test in a real vault, clone into `<your-vault>/.obsidian/plugins/lokf-enforcer/` directly, or symlink/copy `main.js`, `manifest.json`, and `styles.css` there, then reload Obsidian. The [Hot Reload](https://github.com/pjeby/hot-reload) plugin speeds up iteration.

### Agent skills (optional - only for editing this repo's own `.lokf/` bundle)

Nothing in the plugin depends on any agent skill, and no plugin user needs
one. The skills below concern one thing only: this repository's own
`.lokf/knowledge/` bundle, the documentation-about-this-repo that CI keeps
in step with the source. Skip this section unless you are editing that.

The bundle is maintained with [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills),
installed, never committed - `.agents/`, `.claude/`, and `skills-lock.json`
are git-ignored - and CI installs the librarian skill itself at run time. To
work on the bundle locally you need at most two, pinned to the release CI
uses (GitHub CLI 2.90+):

```bash
for s in lokf-librarian lokf-curator; do   # derive / confirm concepts
  gh skill install noelmcloughlin/lokf-agent-skills "$s@v0.9.0"
done
```

`lokf-scaffolding` is only for re-generating the `.lokf/` tooling and the
two bundle workflows from their template (rare); `lokf-docent` only lets an
agent answer questions from the bundle. Neither is needed to contribute.

## Layout

Source lives in `src/`, following the upstream [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) convention:

| File | Responsibility |
|---|---|
| `src/main.ts` | Plugin lifecycle - commands, status bar, scanning, sibling detection |
| `src/settings.ts` | The settings tab |
| `src/validator.ts` | The LOKF rule engine (import-free, plain-Node testable) |
| `src/report-view.ts` | The report pane |

For a realistic LOKF vault to test against, point a scratch vault directly at an existing `.lokf/knowledge/` directory from a project that has one - its root `index.md` should already carry a semantic header for this plugin to check.

## Before opening a pull request

- Run `npm run build` - this type-checks (`tsc -noEmit`) and then bundles, so it must complete without errors.
- Run `npm run lint` - ESLint runs `eslint-plugin-obsidianmd`, which encodes bsidian's own plugin guidelines as rules. Treat its findings as review feedback from upstream, not as style noise. Two deliberate exceptions live in `eslint.config.mts`, both about vocabulary to ensure OKF/LOKF class names are treated as proper nouns (and `http_method` and `lokf:Concept` are spec compliant names), and `scripts/` is treated as Node tooling that never ships in the bundle. Prefer fixing the code over widening either list.
- The settings tab is **declarative**: it returns definitions from `getSettingDefinitions()` and never builds DOM, which is what puts every setting into Obsidian's settings search. That API is 1.13.0-only, which is why `manifest.json` sets `minAppVersion` to 1.13.0; the imperative `display()` is deprecated and must not come back. Settings backed by a list (the comma-separated ones) are joined and split in the tab's `getControlValue` / `setControlValue` overrides, so storage keeps real arrays while the UI shows text, and persistence goes through the plugin's `saveSettings()` rather than the inherited write, which would drop the sibling-notice flag stored alongside.
- Run `npm run smoke-test` - the pure `validator.ts` logic must pass its fixture checks (no Obsidian install needed for this one; it runs under plain Node). bundle you have access to `LOKF_EXTRA_BUNDLE=<path-to-a-bundle>/knowledge npm run smoke-test` - to catch an over-strict rule the in-repo fixtures wouldn't; it's opt-in precisely so default suite stays hermetic.
- **`npm run smoke-test` only covers `validator.ts`.** Anything that needs the Obsidian `App` - a vault scan's unreadable-file handling, bundle-root-folder resolution, the scaffold command's target-picking - has no automated test (there's no headless Obsidian to run one in) and must be checked by hand in a real vault first.
- **Do not commit `main.js`.** It is generated and git-ignored; the release workflow builds it and attaches it to the GitHub release. (This repo previously tracked it, following a sibling plugin's convention; upstream's `obsidian-sample-plugin` explicitly ignores it, and that is what we follow.)
- Keep changes focused; describe what and why in the PR.
- Follow the existing style: build DOM with `createEl`/`createDiv` (never `innerHTML`), put styling in `styles.css`, and register events via `registerEvent` so they unload.
- Keep `validator.ts` free of anything that duplicates an installed OKF v0.2 validator's own checks (required `type`, provenance/trust/lifecycle, Attested Computation, `index.md`/`log.md` structure) - this plugin only covers the LOKF semantic layer on top of that.
- **Keep `validator.ts` import-free.** It takes already-parsed frontmatter and pulls in nothing - not Obsidian, not a YAML library - which is what lets the whole rule set run under plain Node in the smoke test. Parsing belongs in `main.ts`, which uses Obsidian's own `parseYaml`.

## Reporting bugs

Open an issue with your Obsidian version, OS, plugin version, and steps to reproduce.

## Releasing (maintainers)

Releases go through a PR like any other change, so the version bump is reviewable and the tag lands on `main`:

```bash
git switch -c release/0.2.0 origin/main
npm version minor --no-git-tag-version   # updates package.json + manifest.json + versions.json
```

`.npmrc` sets `tag-version-prefix=""`, so a tag created by `npm version` is a bare `0.2.0` with no leading `v` - which is what Obsidian requires.

Then date the `## [Unreleased]` heading in `CHANGELOG.md`, open the PR, and once it's merged, tag the merge commit:

```bash
git switch main && git pull
git tag 0.2.0 && git push origin 0.2.0
```

Pushing the tag triggers the release workflow, which builds, attests provenance, and opens the release as a **draft** carrying `main.js`, `manifest.json`, and `styles.css`. Review the draft and publish it by hand - that is also when the release notes get written.
