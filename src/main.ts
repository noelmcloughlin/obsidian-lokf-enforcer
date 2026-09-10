// main.ts - LOKF Enforcer plugin entry point
import { Notice, Plugin, TFile, type TAbstractFile, type WorkspaceLeaf, debounce, parseYaml } from "obsidian";
import {
  type LokfSettings,
  type LokfIssue,
  DEFAULT_SETTINGS,
  validateLokfConcept,
  missingRootIndexIssues,
  readBaseIri,
  splitFrontmatter,
  isExcluded,
} from "./validator";
import { LokfReportView, LOKF_VIEW_TYPE, type FileResult } from "./report-view";
import { LokfSettingTab } from "./settings";

const SIBLING_PLUGIN_ID = "okf-enforcer";
const ROOT_INDEX = "index.md";

/** Not a LOKF rule - a file the vault refused to hand over. Reported rather
 *  than dropped, so an unreadable note can never read as a clean one. */
function unreadableIssues(): LokfIssue[] {
  return [{ severity: "error", rule: "lokf/io-unreadable", message: "Could not be read - no LOKF rules ran." }];
}

interface ParsedNote {
  hasFm: boolean;
  data: Record<string, unknown>;
}

export default class LokfPlugin extends Plugin {
  settings: LokfSettings = { ...DEFAULT_SETTINGS };
  statusEl!: HTMLElement;
  private siblingNoticeShown = false;
  private siblingDetected = false;
  private busy = false;
  private hasVerdict = false;
  private pendingResults: { results: FileResult[]; scanned: number } | null = null;
  private activeResult: { path: string; issues: LokfIssue[] } | null = null;
  /** base_iri is one value for the whole bundle; re-reading the root index for
   *  every note opened made two vault reads out of each file-open. */
  private baseIri: string | null = null;
  private baseIriLoaded = false;

  private exists = (path: string): boolean => !!this.app.vault.getAbstractFileByPath(path);

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
    this.addCommand({
      id: "check-sibling-plugin",
      name: "Re-check for an installed OKF validator",
      callback: () => this.checkSiblingPlugin(true),
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

    this.app.workspace.onLayoutReady(() => this.checkSiblingPlugin(false));
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

  private invalidateBaseIri(path: string): void {
    if (path === ROOT_INDEX) this.baseIriLoaded = false;
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

  private async findRootBaseIri(): Promise<string | null> {
    if (this.baseIriLoaded) return this.baseIri;
    const rootIndex = this.app.vault.getAbstractFileByPath(ROOT_INDEX);
    if (rootIndex instanceof TFile) {
      // An unreadable root index reads as "no base_iri" rather than taking the
      // scan down with it; the scan then reports it like any other bad file.
      const content = await this.readOrNull(rootIndex);
      const parsed = content === null ? null : this.parseNote(content);
      this.baseIri = parsed ? readBaseIri(parsed.data) : null;
    } else {
      this.baseIri = null;
    }
    this.baseIriLoaded = true;
    return this.baseIri;
  }

  private isConcept(file: TFile): boolean {
    return file.extension === "md" && !isExcluded(file.path, this.settings);
  }

  private isRoot(file: TFile): boolean {
    return !file.path.includes("/");
  }

  private candidateFiles(): TFile[] {
    const configDir = this.app.vault.configDir;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => !f.path.startsWith(configDir + "/") && !isExcluded(f.path, this.settings));
  }

  private getReportView(): LokfReportView | null {
    const leaf = this.app.workspace.getLeavesOfType(LOKF_VIEW_TYPE).at(0);
    return leaf && leaf.view instanceof LokfReportView ? leaf.view : null;
  }

  private issuesFor(path: string, content: string, isRoot: boolean, baseIri: string | null): LokfIssue[] {
    const parsed = this.parseNote(content);
    if (!parsed) return [];
    return validateLokfConcept(path, parsed.hasFm, parsed.data, isRoot, baseIri, this.settings, this.exists);
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
      const baseIri = await this.findRootBaseIri();
      const files = this.candidateFiles();
      const results: FileResult[] = [];
      const unreadable = await this.processQueue(
        files,
        async (f) => {
          const content = await this.app.vault.read(f);
          const issues = this.issuesFor(f.path, content, this.isRoot(f), baseIri);
          if (issues.length) results.push({ path: f.path, issues });
        },
        silent ? undefined : "LOKF: scanning"
      );
      for (const f of unreadable) results.push({ path: f.path, issues: unreadableIssues() });

      // A bundle with no root index.md declares no header at all, so there is no
      // file for that finding to land on - without this it would be the one
      // vault shape that reports nothing.
      if (!(this.app.vault.getAbstractFileByPath(ROOT_INDEX) instanceof TFile)) {
        const issues = missingRootIndexIssues(this.settings);
        if (issues.length) results.push({ path: ROOT_INDEX, issues });
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
      return;
    }
    const baseIri = await this.findRootBaseIri();
    const content = await this.readOrNull(file);
    if (content === null) {
      this.setActiveResult({ path: file.path, issues: unreadableIssues() });
      if (notify) new Notice("LOKF: could not read this note.");
      return;
    }
    const issues = this.issuesFor(file.path, content, this.isRoot(file), baseIri);
    this.setActiveResult({ path: file.path, issues });
    if (notify) {
      const errs = issues.filter((i) => i.severity === "error").length;
      const warns = issues.length - errs;
      new Notice(issues.length === 0 ? "LOKF: clean." : `LOKF: ${errs} error(s), ${warns} warning(s).`);
    }
  }

  private refreshStatus(): void {
    const sibling = `Sibling: OKF validator ${this.siblingDetected ? "detected" : "not detected"}`;
    if (!this.hasVerdict) {
      this.statusEl.setText("LOKF: —");
      this.statusEl.setAttribute("aria-label", `LOKF - click to validate\n${sibling}`);
      return;
    }
    const issues = this.activeResult?.issues ?? [];
    const errs = issues.filter((i) => i.severity === "error").length;
    const warns = issues.length - errs;
    this.statusEl.setText(errs > 0 ? `LOKF ✖ ${errs}` : warns > 0 ? `LOKF ⚠ ${warns}` : "LOKF ✓");
    const lines = issues.slice(0, 8).map((i) => `${i.severity}: ${i.message}`);
    lines.push(sibling);
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

  private detectOkfValidator(): boolean {
    const plugins = (
      this.app as unknown as {
        plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, unknown> };
      }
    ).plugins;
    try {
      return !!plugins?.enabledPlugins?.has(SIBLING_PLUGIN_ID) || !!plugins?.plugins?.[SIBLING_PLUGIN_ID];
    } catch {
      return false;
    }
  }

  siblingStatusText(): string {
    return this.siblingDetected ? "Detected" : "Not detected";
  }

  checkSiblingPlugin(manual: boolean): void {
    this.siblingDetected = this.detectOkfValidator();
    this.refreshStatus();
    if (manual) {
      new Notice(
        this.siblingDetected
          ? "LOKF: OKF validator detected."
          : "LOKF: no OKF validator detected - install one (e.g. OKF Enforcer) for full OKF v0.2 coverage."
      );
      return;
    }
    if (!this.siblingDetected && this.settings.recommendSiblingPlugin && !this.siblingNoticeShown) {
      new Notice(
        "LOKF Enforcer only checks the LOKF semantic layer. Install an OKF v0.2 validator (e.g. OKF Enforcer) alongside it for full coverage.",
        10000
      );
      this.siblingNoticeShown = true;
      void this.saveSettings();
    }
  }

  private async scaffoldRootHeader(): Promise<void> {
    const rootIndex = this.app.vault.getAbstractFileByPath(ROOT_INDEX);
    let content = "";
    if (rootIndex instanceof TFile) {
      // Treating an unreadable index.md as empty would prepend the template to
      // "" and write that back, destroying whatever the file actually held.
      const read = await this.readOrNull(rootIndex);
      if (read === null) {
        new Notice("LOKF: could not read index.md - leaving it untouched.");
        return;
      }
      content = read;
    }
    const { hasFm } = splitFrontmatter(content);
    if (hasFm) {
      new Notice("LOKF: root index.md already has frontmatter - add the LOKF header fields manually to avoid clobbering it.");
      return;
    }
    const template = `---
lokf_version: "0.2"
okf_version: "0.2"
base_iri: https://your-domain.example/knowledge/
context: https://w3id.org/lokf/context.jsonld
title: ${this.app.vault.getName()} Knowledge Bundle
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
      if (rootIndex instanceof TFile) await this.app.vault.modify(rootIndex, newContent);
      else await this.app.vault.create(ROOT_INDEX, newContent);
    } catch {
      // The command is fired with `void`, so without this a failed write would
      // report nothing to the user and surface only as an unhandled rejection.
      new Notice("LOKF: could not write index.md - the semantic header was not inserted.");
      return;
    }
    this.invalidateBaseIri(ROOT_INDEX);
    new Notice("LOKF: inserted a semantic header template into index.md - replace the placeholder base_iri before publishing.");
  }
}
