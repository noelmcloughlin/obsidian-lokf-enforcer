// main.ts - LOKF Enforcer plugin entry point
import { Notice, Plugin, TFile, TFolder, type TAbstractFile, type WorkspaceLeaf, debounce, parseYaml } from "obsidian";
import {
  type LokfSettings,
  type LokfIssue,
  DEFAULT_SETTINGS,
  validateLokfConcept,
  missingRootIndexIssues,
  readBaseIri,
  splitFrontmatter,
  isExcluded,
  hiddenRootSegment,
  normalizeBundleRoots,
  resolveBundleRoot,
  bundleRootIndexPath,
  toBundlePath,
  toVaultPath,
} from "./validator";
import { LokfReportView, LOKF_VIEW_TYPE, type FileResult } from "./report-view";
import { LokfSettingTab } from "./settings";

// Sibling-plugin detection (below, `detectOkfValidator`) is disabled: it read
// `app.plugins`, which is not public API and is a routine flag in community
// plugin review. Left commented rather than deleted since re-enabling it is a
// straightforward uncomment should a public "is plugin X installed" API
// ever appear.
// const SIBLING_PLUGIN_ID = "okf-enforcer";

/** Not a LOKF rule - a file the vault refused to hand over. Reported rather
 *  than dropped, so an unreadable note can never read as a clean one. */
function unreadableIssues(): LokfIssue[] {
  return [{ severity: "error", rule: "lokf/io-unreadable", message: "Could not be read - no LOKF rules ran." }];
}

/** Not a LOKF rule either - the configured bundle root is one Obsidian's file
 *  index will never expose, so every note under it is unreachable. Without
 *  this the scan would just report an empty, apparently healthy bundle. */
function hiddenRootIssues(root: string, segment: string): LokfIssue[] {
  return [
    {
      severity: "error",
      rule: "lokf/io-hidden-root",
      message: `Bundle root "${root}" sits inside "${segment}", and Obsidian's file index skips every folder whose name begins with a dot - no note under it is visible to this or any plugin, so nothing was scanned. Open that folder as its own vault instead (File → Open folder as vault), or move the bundle to a path with no dot-folder in it.`,
    },
  ];
}

/** The configured bundle root no longer exists - renamed, deleted, or mistyped
 *  - which would otherwise scan zero notes and look like a clean bundle. */
function missingBundleRootIssues(root: string): LokfIssue[] {
  return [
    {
      severity: "error",
      rule: "lokf/io-missing-root",
      message: `Bundle root folder "${root}" does not exist in this vault, so nothing under it was scanned. Fix or remove it under Settings → LOKF Enforcer → Bundle root folders (clear the list to treat the whole vault as one bundle).`,
    },
  ];
}

interface ParsedNote {
  hasFm: boolean;
  data: Record<string, unknown>;
}

export default class LokfPlugin extends Plugin {
  settings: LokfSettings = { ...DEFAULT_SETTINGS };
  statusEl!: HTMLElement;
  private siblingNoticeShown = false;
  private busy = false;
  private hasVerdict = false;
  private pendingResults: { results: FileResult[]; scanned: number } | null = null;
  private activeResult: { path: string; issues: LokfIssue[] } | null = null;
  /** One base_iri per configured bundle root, keyed by that root's normalized
   *  path ("" for the implicit whole-vault bundle). Re-reading a root index
   *  for every note opened in its bundle made two vault reads out of each
   *  file-open; absence of a key means "not loaded yet", not "no base_iri". */
  private baseIriCache = new Map<string, string | null>();
  private bundleRootsRaw: string[] | null = null;
  private bundleRootsResolved: string[] = [];

  private exists = (path: string): boolean => !!this.app.vault.getAbstractFileByPath(path);

  /** The configured bundle roots, normalized/deduped/sorted via
   *  validator.ts's `normalizeBundleRoots` (pure, unit-tested under plain
   *  Node in scripts/smoke-test.ts). Memoized on the raw array's *identity*,
   *  which is sound because a settings list is always REPLACED, never
   *  mutated in place (settings.ts assigns a fresh parseCsv() array on every
   *  edit; validator.ts's `isKnownType` cache relies on the same invariant).
   *  Not keyed on a joined string: folder names may contain the joiner, so
   *  `["My Notes"]` and `["My", "Notes"]` would collide. */
  private bundleRoots(): string[] {
    const raw = this.settings.bundleRoots;
    if (raw !== this.bundleRootsRaw) {
      this.bundleRootsRaw = raw;
      this.bundleRootsResolved = normalizeBundleRoots(raw);
    }
    return this.bundleRootsResolved;
  }

  private resolveRoot(vaultPath: string): string | null {
    return resolveBundleRoot(vaultPath, this.bundleRoots());
  }

  private rootIndexPathFor(root: string): string {
    return bundleRootIndexPath(root);
  }

  /** True for any path inside some configured bundle (or every path, when no
   *  roots are configured and the bundle is the vault itself). Notes outside
   *  every bundle are never scanned - matching an Obsidian-native vault where
   *  each bundle is one project folder among several siblings. */
  private isInBundle(vaultPath: string): boolean {
    return this.resolveRoot(vaultPath) !== null;
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(LOKF_VIEW_TYPE, (leaf) => new LokfReportView(leaf, this));

    this.statusEl = this.addStatusBarItem();
    this.statusEl.setText("LOKF: —");
    this.statusEl.addClass("mod-clickable");
    this.statusEl.setAttribute("aria-label", "LOKF - click to validate");
    this.statusEl.onClickEvent(() => {
      void this.onStatusClick();
    });

    this.addCommand({
      id: "validate-vault",
      name: "Validate vault (full LOKF report)",
      callback: () => {
        void this.scanVault();
      },
    });
    this.addCommand({
      id: "validate-active",
      name: "Validate active note",
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) void this.validateActive(f, true);
        return true;
      },
    });
    this.addCommand({
      id: "scaffold-root-header",
      name: "Insert semantic header template into root index.md",
      callback: () => {
        void this.scaffoldRootHeader();
      },
    });
    this.addSettingTab(new LokfSettingTab(this.app, this));

    // Debounced so that arrowing through a file list doesn't read and parse a
    // note per keystroke.
    const validateOpened = debounce((file: TFile) => void this.validateActive(file, false), 150, true);
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file && file.extension === "md") validateOpened(file);
        else this.setActiveResult(null);
      }),
    );

    const forget = (file: TAbstractFile) => this.invalidateBaseIri(file.path);
    this.registerEvent(this.app.vault.on("modify", forget));
    this.registerEvent(this.app.vault.on("create", forget));
    this.registerEvent(this.app.vault.on("delete", forget));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.invalidateBaseIri(file.path);
        this.invalidateBaseIri(oldPath);
      })
    );

    this.app.workspace.onLayoutReady(() => this.maybeShowSiblingNotice());
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Record<string, unknown> | null;
    Object.assign(this.settings, DEFAULT_SETTINGS);
    if (!saved) return;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof LokfSettings)[]) {
      if (saved[key] !== undefined) {
        (this.settings as unknown as Record<string, unknown>)[key] = saved[key];
      }
    }
    if (typeof saved["siblingNoticeShown"] === "boolean") {
      this.siblingNoticeShown = saved["siblingNoticeShown"];
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, siblingNoticeShown: this.siblingNoticeShown });
  }

  /** Frontmatter parsing lives here, not in validator.ts, so the rule engine
   *  stays dependency-free and testable outside Obsidian. Null = unparseable,
   *  which is the installed OKF validator's error to report, not ours. */
  private parseNote(content: string): ParsedNote | null {
    const { hasFm, raw } = splitFrontmatter(content);
    if (!hasFm) return { hasFm: false, data: {} };
    try {
      const parsed: unknown = parseYaml(raw);
      return {
        hasFm: true,
        data: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {},
      };
    } catch {
      return null;
    }
  }

  /** `path` is whatever a vault event named: a root index.md itself, or a
   *  folder that contains one (a bundle root folder being renamed or deleted
   *  fires for the folder path, not for each file inside it). Both drop the
   *  cached base_iri for every root whose index sits at or under `path`.
   *  Checks the current roots and whatever is already cached, so a root just
   *  edited out of settings doesn't leave a stale entry behind either. */
  private invalidateBaseIri(path: string): void {
    const roots = new Set(this.baseIriCache.keys());
    for (const r of this.bundleRoots()) roots.add(r);
    if (roots.size === 0) roots.add("");
    for (const root of roots) {
      const index = this.rootIndexPathFor(root);
      if (index === path || index.startsWith(path + "/")) this.baseIriCache.delete(root);
    }
  }

  /** Called from the settings tab when the set of bundle roots itself
   *  changes, since a cached base_iri may now belong to a root that no
   *  longer exists in that shape - simplest to drop the whole cache. */
  invalidateBaseIriCache(): void {
    this.baseIriCache.clear();
  }

  /** Null = the vault could not hand the file over. For the single-file paths,
   *  where an escaping throw would surface only as an unhandled rejection. The
   *  vault scan deliberately does NOT use this - it lets the read throw so
   *  processQueue can attribute the failure to that file. */
  private async readOrNull(file: TFile): Promise<string | null> {
    try {
      return await this.app.vault.read(file);
    } catch {
      return null;
    }
  }

  private async findBaseIriFor(root: string): Promise<string | null> {
    if (this.baseIriCache.has(root)) return this.baseIriCache.get(root) ?? null;
    const rootIndex = this.app.vault.getAbstractFileByPath(this.rootIndexPathFor(root));
    let baseIri: string | null = null;
    if (rootIndex instanceof TFile) {
      // An unreadable root index reads as "no base_iri" rather than taking the
      // scan down with it; the scan then reports it like any other bad file.
      const content = await this.readOrNull(rootIndex);
      const parsed = content === null ? null : this.parseNote(content);
      baseIri = parsed ? readBaseIri(parsed.data) : null;
    }
    this.baseIriCache.set(root, baseIri);
    return baseIri;
  }

  private isConcept(file: TFile): boolean {
    return file.extension === "md" && !isExcluded(file.path, this.settings) && this.isInBundle(file.path);
  }

  private isRoot(file: TFile, root: string): boolean {
    return !toBundlePath(file.path, root).includes("/");
  }

  private candidateFiles(): TFile[] {
    const configDir = this.app.vault.configDir;
    return this.app.vault
      .getMarkdownFiles()
      .filter(
        (f) => !f.path.startsWith(configDir + "/") && !isExcluded(f.path, this.settings) && this.isInBundle(f.path)
      );
  }

  private getReportView(): LokfReportView | null {
    const leaf = this.app.workspace.getLeavesOfType(LOKF_VIEW_TYPE).at(0);
    return leaf && leaf.view instanceof LokfReportView ? leaf.view : null;
  }

  /** `vaultPath` is translated to a path relative to `root` before reaching
   *  validator.ts, which knows nothing about bundle roots - it always
   *  validates as if the bundle it's given were the vault root. */
  private issuesFor(
    vaultPath: string,
    content: string,
    root: string,
    isRoot: boolean,
    baseIri: string | null
  ): LokfIssue[] {
    const parsed = this.parseNote(content);
    if (!parsed) return [];
    const bundlePath = toBundlePath(vaultPath, root);
    const existsInBundle = (p: string): boolean => this.exists(toVaultPath(p, root));
    return validateLokfConcept(bundlePath, parsed.hasFm, parsed.data, isRoot, baseIri, this.settings, existsInBundle);
  }

  /** Returns the items whose worker call threw, so a dropped file is reported
   *  as unreadable rather than silently missing from "scanned N notes". */
  private async processQueue<T>(items: T[], worker: (item: T) => Promise<void>, label?: string): Promise<T[]> {
    const size = Math.max(1, this.settings.batchSize | 0);
    const showBar = !!label && items.length > size;
    const view = showBar ? this.getReportView() : null;
    if (showBar && label) view?.showProgress(label);
    const baseStatus = this.statusEl.getText();
    const failed: T[] = [];

    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);
      await Promise.all(
        batch.map((it) =>
          worker(it).catch(() => {
            failed.push(it);
          })
        )
      );
      if (showBar) {
        const done = Math.min(i + size, items.length);
        const frac = done / items.length;
        view?.setProgress(frac, label);
        this.statusEl.setText(`LOKF ${Math.round(frac * 100)}%`);
      }
      await new Promise((r) => window.setTimeout(r, 0));
    }
    if (showBar) {
      view?.hideProgress();
      this.statusEl.setText(baseStatus);
    }
    return failed;
  }

  async scanVault(reveal = true, silent = false): Promise<void> {
    if (this.busy) {
      if (!silent) new Notice("LOKF: a scan is already running…");
      return;
    }
    this.busy = true;
    try {
      const files = this.candidateFiles();
      // Pre-fetch each bundle's base_iri once, before the parallel batches
      // below, so files sharing a root don't all miss an unwarmed cache at
      // once and each trigger their own read of the same index.md.
      const roots = [...new Set(files.map((f) => this.resolveRoot(f.path) ?? ""))];
      await Promise.all(roots.map((r) => this.findBaseIriFor(r)));

      const results: FileResult[] = [];
      const unreadable = await this.processQueue(
        files,
        async (f) => {
          const root = this.resolveRoot(f.path) ?? "";
          const baseIri = await this.findBaseIriFor(root);
          const content = await this.app.vault.read(f);
          const issues = this.issuesFor(f.path, content, root, this.isRoot(f, root), baseIri);
          if (issues.length) results.push({ path: f.path, issues });
        },
        silent ? undefined : "LOKF: scanning"
      );
      for (const f of unreadable) results.push({ path: f.path, issues: unreadableIssues() });

      // Findings no single note can carry, ordered by what actually went wrong:
      // an unreachable bundle root already explains an empty scan, so adding
      // "no index.md" on top of it would only blame the wrong thing. Runs once
      // per configured root, or once for the implicit whole-vault root when
      // none are configured.
      const configuredRoots = this.bundleRoots().length ? this.bundleRoots() : [""];
      for (const root of configuredRoots) {
        const rootIndexPath = this.rootIndexPathFor(root);
        const hiddenSegment = hiddenRootSegment(root);
        // synthetic: true on all three - none of these paths were part of
        // `files`, so the report view must not count them against "clean".
        if (hiddenSegment) {
          results.push({ path: rootIndexPath, issues: hiddenRootIssues(root, hiddenSegment), synthetic: true });
        } else if (root && !(this.app.vault.getAbstractFileByPath(root) instanceof TFolder)) {
          results.push({ path: rootIndexPath, issues: missingBundleRootIssues(root), synthetic: true });
        } else if (!(this.app.vault.getAbstractFileByPath(rootIndexPath) instanceof TFile)) {
          const issues = missingRootIndexIssues(this.settings, rootIndexPath);
          if (issues.length) results.push({ path: rootIndexPath, issues, synthetic: true });
        }
      }

      results.sort((a, b) => a.path.localeCompare(b.path));
      this.renderResults(results, files.length);

      const active = this.app.workspace.getActiveFile();
      if (active && files.some((f) => f.path === active.path)) {
        const hit = results.find((r) => r.path === active.path);
        this.setActiveResult({ path: active.path, issues: hit ? hit.issues : [] });
      }

      const errFiles = results.filter((r) => r.issues.some((i) => i.severity === "error")).length;
      const warnFiles = results.length - errFiles;

      if (reveal && !silent) await this.activateView();
      if (!silent) {
        // The unreadable files are part of errFiles - the parenthetical says
        // how many of those failed to be read rather than failing a rule.
        const unreadableNote = unreadable.length ? ` (${unreadable.length} unreadable)` : "";
        new Notice(
          `LOKF: scanned ${files.length} notes - ${errFiles} with errors${unreadableNote}, ${warnFiles} with warnings only.`
        );
      }
    } finally {
      this.busy = false;
    }
  }

  private renderResults(results: FileResult[], scanned: number): void {
    const view = this.getReportView();
    // If the view is closed and a second scan lands before it reopens, this
    // overwrites the earlier pending result - intentional, since only the
    // latest scan is ever worth showing.
    if (view) view.setResults(results, scanned);
    else this.pendingResults = { results, scanned };
  }

  private setActiveResult(active: { path: string; issues: LokfIssue[] } | null): void {
    this.activeResult = active;
    this.hasVerdict = active !== null;
    this.getReportView()?.setActiveResult(active);
    this.refreshStatus();
  }

  async validateActive(file: TFile, notify: boolean): Promise<void> {
    if (!this.isConcept(file)) {
      // Leaving the previous note's findings up would attribute them to this one.
      this.setActiveResult(null);
      // The debounced file-open path calls this too, with notify=false - that
      // one fires on every navigation, so silence there is deliberate. Only
      // an explicit ask (the command, or the status-bar click) gets told why
      // nothing happened; both callers already require a .md file, so the
      // only two reasons left are exclusion and being outside every bundle.
      if (notify) {
        const reason = isExcluded(file.path, this.settings)
          ? "it is in an excluded folder"
          : "it is outside every configured bundle root";
        new Notice(`LOKF: not validated - ${reason}.`);
      }
      return;
    }
    const root = this.resolveRoot(file.path) ?? "";
    const baseIri = await this.findBaseIriFor(root);
    const content = await this.readOrNull(file);
    if (content === null) {
      this.setActiveResult({ path: file.path, issues: unreadableIssues() });
      if (notify) new Notice("LOKF: could not read this note.");
      return;
    }
    const issues = this.issuesFor(file.path, content, root, this.isRoot(file, root), baseIri);
    this.setActiveResult({ path: file.path, issues });
    if (notify) {
      const errs = issues.filter((i) => i.severity === "error").length;
      const warns = issues.length - errs;
      new Notice(issues.length === 0 ? "LOKF: clean." : `LOKF: ${errs} error(s), ${warns} warning(s).`);
    }
  }

  private refreshStatus(): void {
    if (!this.hasVerdict) {
      this.statusEl.setText("LOKF: —");
      this.statusEl.setAttribute("aria-label", "LOKF - click to validate");
      return;
    }
    const issues = this.activeResult?.issues ?? [];
    const errs = issues.filter((i) => i.severity === "error").length;
    const warns = issues.length - errs;
    this.statusEl.setText(errs > 0 ? `LOKF ✖ ${errs}` : warns > 0 ? `LOKF ⚠ ${warns}` : "LOKF ✓");
    const lines = issues.slice(0, 8).map((i) => `${i.severity}: ${i.message}`);
    this.statusEl.setAttribute("aria-label", lines.join("\n"));
  }

  private async onStatusClick(): Promise<void> {
    const active = this.app.workspace.getActiveFile();
    if (active && active.extension === "md") await this.validateActive(active, true);
    else await this.scanVault();
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(LOKF_VIEW_TYPE);
    let leaf: WorkspaceLeaf | null;
    if (existing.length) {
      leaf = existing[0] ?? null;
    } else {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: LOKF_VIEW_TYPE, active: true });
    }
    if (!leaf) return;
    void this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof LokfReportView) {
      if (this.pendingResults) {
        leaf.view.setResults(this.pendingResults.results, this.pendingResults.scanned);
        this.pendingResults = null;
      }
      leaf.view.setActiveResult(this.activeResult);
    }
  }

  // private detectOkfValidator(): boolean {
  //   const plugins = (
  //     this.app as unknown as {
  //       plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, unknown> };
  //     }
  //   ).plugins;
  //   try {
  //     return !!plugins?.enabledPlugins?.has(SIBLING_PLUGIN_ID) || !!plugins?.plugins?.[SIBLING_PLUGIN_ID];
  //   } catch {
  //     return false;
  //   }
  // }

  /** Shown once, if enabled - there is no reliable, public way to tell whether
   *  an OKF validator is already installed (see the commented-out
   *  `detectOkfValidator` above), so this fires unconditionally rather than
   *  only when "not detected". */
  private maybeShowSiblingNotice(): void {
    if (!this.settings.recommendSiblingPlugin || this.siblingNoticeShown) return;
    new Notice(
      "LOKF Enforcer only checks the LOKF semantic layer. Install an OKF v0.2 validator (e.g. OKF Enforcer) alongside it for full coverage.",
      10000
    );
    this.siblingNoticeShown = true;
    void this.saveSettings();
  }

  /** Which bundle the scaffold command should target: the active note's own
   *  bundle if it has one, else the sole configured root, else the implicit
   *  whole-vault root when none are configured. Null only when several roots
   *  are configured and no open note picks one out - there is no default to
   *  fall back to that wouldn't silently scaffold the wrong bundle. */
  private resolveScaffoldTarget(): string | null {
    const active = this.app.workspace.getActiveFile();
    if (active) {
      const r = this.resolveRoot(active.path);
      if (r !== null) return r;
    }
    const roots = this.bundleRoots();
    if (roots.length === 0) return "";
    if (roots.length === 1) return roots[0] ?? "";
    return null;
  }

  private async scaffoldRootHeader(): Promise<void> {
    const root = this.resolveScaffoldTarget();
    if (root === null) {
      new Notice(
        "LOKF: several bundle roots are configured - open a note inside the bundle you want to scaffold first."
      );
      return;
    }
    const rootIndexPath = this.rootIndexPathFor(root);
    const rootIndex = this.app.vault.getAbstractFileByPath(rootIndexPath);
    let content = "";
    if (rootIndex instanceof TFile) {
      // Treating an unreadable index.md as empty would prepend the template to
      // "" and write that back, destroying whatever the file actually held.
      const read = await this.readOrNull(rootIndex);
      if (read === null) {
        new Notice(`LOKF: could not read ${rootIndexPath} - leaving it untouched.`);
        return;
      }
      content = read;
    }
    const { hasFm } = splitFrontmatter(content);
    if (hasFm) {
      new Notice(`LOKF: ${rootIndexPath} already has frontmatter - add the LOKF header fields manually to avoid clobbering it.`);
      return;
    }
    // A bundle confined to a subfolder of a larger vault is named for that
    // folder, not the whole vault - the vault name would describe every other
    // sibling folder just as well as this one.
    const bundleName = root ? (root.split("/").pop() ?? root) : this.app.vault.getName();
    const template = `---
lokf_version: "0.2"
okf_version: "0.2"
base_iri: https://your-domain.example/knowledge/
context: https://w3id.org/lokf/context.jsonld
title: ${bundleName} Knowledge Bundle
description: TODO
license: https://creativecommons.org/licenses/by/4.0/
publisher:
  type: Person
  id: https://your-domain.example/knowledge/person/you
  name: TODO
---

`;
    const newContent = template + content;
    try {
      if (rootIndex instanceof TFile) {
        await this.app.vault.modify(rootIndex, newContent);
      } else {
        // A bundle root configured as a subfolder may not exist yet - create()
        // fails outright if its parent folder is missing.
        if (root && !this.app.vault.getAbstractFileByPath(root)) await this.app.vault.createFolder(root);
        await this.app.vault.create(rootIndexPath, newContent);
      }
    } catch {
      // The command is fired with `void`, so without this a failed write would
      // report nothing to the user and surface only as an unhandled rejection.
      new Notice(`LOKF: could not write ${rootIndexPath} - the semantic header was not inserted.`);
      return;
    }
    this.invalidateBaseIri(rootIndexPath);
    new Notice(`LOKF: inserted a semantic header template into ${rootIndexPath} - replace the placeholder base_iri before publishing.`);
  }
}
