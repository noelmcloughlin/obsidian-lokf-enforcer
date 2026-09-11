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

`main.js` is git-ignored (see "Do not commit `main.js`" below), so a fresh clone has no `main.js` at all - Obsidian will show "Failed to load plugin" with nothing in the console, since the loader has no entry file to require. Run `npm install && npm run dev` (or `npm run build` for a one-off) before the first reload, and after every `git pull` that touches `src/`.

### Agent skills (optional - only for editing this repo's own `.lokf/` bundle)

Nothing in the plugin depends on any agent skill, and no plugin user needs one. The skills below concern one thing only: this repository's own `.lokf/knowledge/` bundle, the documentation-about-this-repo that CI keeps in step with the source. Skip this section unless you are editing that.

The bundle is maintained with [lokf-agent-skills](https://github.com/noelmcloughlin/lokf-agent-skills), installed, never committed - `.agents/`, `.claude/`, and `skills-lock.json` are git-ignored - and CI installs the librarian skill itself at run time. To work on the bundle locally you need at most two, pinned to the release CI uses (GitHub CLI 2.90+):

```bash
for s in lokf-librarian lokf-curator; do   # derive / confirm concepts
  gh skill install noelmcloughlin/lokf-agent-skills
done
```

`lokf-scaffolding` is only for re-generating the `.lokf/` tooling and the two bundle workflows from their template (rare); `lokf-docent` only lets an agent answer questions from the bundle. Neither is needed to contribute.

## Layout

Source lives in `src/`, following the upstream [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) convention:

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Plugin lifecycle - commands, status bar, vault scanning, bundle-root resolution |
| `src/settings.ts` | The settings tab |
| `src/validator.ts` | The LOKF rule engine (import-free, plain-Node testable) |
| `src/report-view.ts` | The report pane |

For a realistic LOKF vault to test against, point a scratch vault directly at an existing `.lokf/knowledge/` directory from a project that has one - its root `index.md` should already carry a semantic header for this plugin to check.

## Before opening a pull request

- Run `npm run build` - this type-checks (`tsc -noEmit`) and then bundles, so it must complete without errors.
- Run `npm run lint` - ESLint runs `eslint-plugin-obsidianmd`, which encodes Obsidian's own plugin guidelines as rules. Treat its findings as review feedback from upstream, not as style noise. Two deliberate exceptions live in `eslint.config.mts`, both about vocabulary to ensure OKF/LOKF class names are treated as proper nouns (and `http_method` and `lokf:Concept` are spec compliant names), and `scripts/` is treated as Node tooling that never ships in the bundle. Prefer fixing the code over widening either list.
- The settings tab is **declarative**: it returns definitions from `getSettingDefinitions()` and never builds DOM, which is what puts every setting into Obsidian's settings search. That API is 1.13.0-only, which is why `manifest.json` sets `minAppVersion` to 1.13.0; the imperative `display()` is deprecated and must not come back. Settings backed by a list (the comma-separated ones) are joined and split in the tab's `getControlValue` / `setControlValue` overrides, so storage keeps real arrays while the UI shows text, and persistence goes through the plugin's `saveSettings()` rather than the inherited write, which would drop the sibling-notice flag stored alongside.
- Run `npm run smoke-test` - the pure `validator.ts` logic must pass its fixture checks (no Obsidian install needed for this one; it runs under plain Node). If you have another real bundle to hand, point the suite at it too - `LOKF_EXTRA_BUNDLE=<path-to-a-bundle>/knowledge npm run smoke-test` - to catch an over-strict rule the in-repo fixtures wouldn't; it's opt-in precisely so the default suite stays hermetic.
- **`npm run smoke-test` only covers `validator.ts`.** Anything that needs the Obsidian `App` - a vault scan's unreadable-file handling, bundle-root-folder resolution, the scaffold command's target-picking - has no automated test (there's no headless Obsidian to run one in) and must be checked by hand in a real vault first.
- **Do not commit `main.js`.** It is generated and git-ignored; the release workflow builds it and attaches it to the GitHub release. (This repo previously tracked it, following a sibling plugin's convention; upstream's `obsidian-sample-plugin` explicitly ignores it, and that is what we follow.)
- Keep changes focused; describe what and why in the PR.
- Follow the existing style: build DOM with `createEl`/`createDiv` (never `innerHTML`), put styling in `styles.css`, and register events via `registerEvent` so they unload.
- Keep `validator.ts` free of anything that duplicates an installed OKF v0.2 validator's own checks (required `type`, `Attested Computation`, `index.md`/`log.md` structure) - this plugin only covers the LOKF semantic layer on top of that, plus the *shape* (never the credibility depth) of the OKF v0.2 §5 trust/lifecycle fields.
- **Keep `validator.ts` import-free.** It takes already-parsed frontmatter and pulls in nothing - not Obsidian, not a YAML library - which is what lets the whole rule set run under plain Node in the smoke test. Parsing belongs in `main.ts`, which uses Obsidian's own `parseYaml`.
- CI runs two more gates that are easy to trip locally: `lint-and-docs.yaml` (ShellCheck, `actionlint`, markdownlint against `.markdownlint-cli2.jsonc`, link-checking, and codespell over every `*.md`) and, on any `.lokf/**` change, `knowledge-registrar.yaml` (`lokf validate` over the bundle - the registrar keeps records well-formed, it never judges whether their content is true). If you touched a workflow or a shell script, expect `actionlint`/ShellCheck to have an opinion.
- Pinned action SHAs and npm devDependencies are bumped by Dependabot (`.github/dependabot.yml`), not by hand - don't float a pin to a tag to get a newer version.
- The PR template's checklist is the short version of this section; fill it in rather than deleting it.

## Code of conduct

Participation here is covered by the [Contributor Covenant](CODE_OF_CONDUCT.md), the same one the sibling `lokf-agent-skills` repository uses.

## Using AI tools

AI assistance is welcome here - this repository's own `.lokf/` bundle is maintained by an agent, and the plugin exists to make agent-written knowledge checkable. What that requires of you is unchanged: you are the author of whatever you submit, you are responsible for understanding and defending it in review, and an agent may not participate in discussion on your behalf. The full rules, including how this repo's own scheduled `knowledge-librarian` agent is held to them, are in [AI_COVENANT.md](AI_COVENANT.md).

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
