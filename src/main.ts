// main.ts - LOKF Enforcer plugin entry point
import { MarkdownView, Notice, Plugin, TFile, TFolder, type EditorPosition, type TAbstractFile, type WorkspaceLeaf, debounce, parseYaml } from "obsidian";
import {
  type LokfSettings,
  type LokfIssue,
  DEFAULT_SETTINGS,
  validateLokfConcept,
  missingRootIndexIssues,
  readBaseIri,
  splitFrontmatter,
  isExcluded,
  isReserved,
  hiddenRootSegment,
  normalizeBundleRoots,
  resolveBundleRoot,
  bundleRootIndexPath,
  toBundlePath,
  toVaultPath,
  resolveRelationTarget,
  RELATION_FIELDS,
  applyFieldAliases,
  applySeverityOverrides,
} from "./validator";
import { LokfReportView, LOKF_VIEW_TYPE, type FileResult } from "./report-view";
import { locateFrontmatterKey } from "./locator";
import { LokfSettingTab } from "./settings";
import { lokfInlineExtension } from "./inline";
import { pluginDefaultSettings, HARDCODED_VOCAB } from "./vocab";
import { buildConceptGraph, type ConceptGraph, type ConceptRecord } from "./graph";
import { ConceptSuggestModal } from "./concept-modal";
import { LokfSuggest, type SuggestVocabulary } from "./suggest";
import { computeFix, computeFixes } from "./fixes";
import { extractBodyLinks, buildProposals, type Proposal } from "./propose";
import { FindingSuggestModal, type FindingItem } from "./finding-modal";
import type { LokfEnforcerApi, LokfFileFindings, LokfFinding } from "./public-api";
import { ProposeModal } from "./propose-modal";

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

function arraysEqual(a: string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export default class LokfPlugin extends Plugin {
  settings: LokfSettings = { ...DEFAULT_SETTINGS };
  statusEl!: HTMLElement;
  /** Read-only surface for the sibling Curator or an agent; see public-api.ts.
   *  Reachable as `app.plugins.plugins["lokf-enforcer"].api`. */
  api!: LokfEnforcerApi;
  private siblingNoticeShown = false;
  private busy = false;
  private hasVerdict = false;
  /** The most recent full scan, retained so reopening the report panel (or the
   *  ribbon) restores it without a rescan, and so the public API and the
   *  finding-navigation commands have a report to read when the panel is shut. */
  private lastReport: { results: FileResult[]; scanned: number } | null = null;
  /** Subscribers to the API's "validation finished" hook. */
  private validatedCallbacks = new Set<() => void>();
  private activeResult: { path: string; issues: LokfIssue[] } | null = null;
  /** One base_iri per configured bundle root, keyed by that root's normalized
   *  path ("" for the implicit whole-vault bundle). Re-reading a root index
   *  for every note opened in its bundle made two vault reads out of each
   *  file-open; absence of a key means "not loaded yet", not "no base_iri". */
  private baseIriCache = new Map<string, string | null>();
  private bundleRootsRaw: string[] | null = null;
  private bundleRootsResolved: string[] = [];
  /** Paths whose metadata changed since the last flush, coalesced so a burst
   *  of keystrokes re-validates each touched file once (the serializer's
   *  recentlyUpdatedFiles pattern). Drained by `processPendingMeta`. */
  private pendingMeta = new Set<string>();
  private metaFlush: () => void = () => {};
  /** Concept target candidates per bundle root, for autocomplete (D). Cleared
   *  when the set of files changes (create/delete/rename), not on every edit -
   *  a content change doesn't add or remove a target. */
  private targetsCache = new Map<string, string[]>();

  /** Position in the flat findings list for the next/previous-finding commands;
   *  recomputed against the current report each step, so it just wraps. Starts
   *  before the first item, so the first "next" lands on it. */
  private findingCursor = -1;

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
    // A device that has opted out starts quiet: no status bar, and the inline
    // and autocomplete surfaces already gate themselves on the same flag.
    if (this.isDisabledOnDevice()) this.statusEl.hide();

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
        if (this.blockedOnDevice()) return;
        void this.scaffoldRootHeader();
      },
    });
    this.addCommand({
      id: "find-concept",
      name: "Find a concept (by name, type, or relations)",
      callback: () => {
        if (this.blockedOnDevice()) return;
        const graph = this.buildConceptGraph();
        if (graph.records.length === 0) {
          new Notice("LOKF: no concepts found in the configured bundle(s).");
          return;
        }
        new ConceptSuggestModal(this.app, graph, graph.records, "Search concepts by name, type, or id…").open();
      },
    });
    this.addCommand({
      id: "find-orphan-concept",
      name: "Find an orphan concept (nothing links to it)",
      callback: () => {
        if (this.blockedOnDevice()) return;
        const graph = this.buildConceptGraph();
        if (graph.orphans.length === 0) {
          new Notice(
            graph.records.length === 0
              ? "LOKF: no concepts found in the configured bundle(s)."
              : "LOKF: no orphan concepts - every concept has at least one inbound relation."
          );
          return;
        }
        new ConceptSuggestModal(
          this.app,
          graph,
          graph.orphans,
          `${graph.orphans.length} orphan concept(s) nothing links to…`
        ).open();
      },
    });
    this.addCommand({
      id: "fix-active",
      name: "Fix safe issues in the active note",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file || view.file.extension !== "md") return false;
        if (!checking) void this.fixActiveNote(view);
        return true;
      },
    });
    this.addCommand({
      id: "propose-relations",
      name: "Promote body links to typed relations…",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file || view.file.extension !== "md") return false;
        if (!checking) void this.proposeRelations(view);
        return true;
      },
    });
    this.addCommand({
      id: "go-to-finding",
      name: "Go to a finding (search all findings)",
      callback: () => {
        if (this.blockedOnDevice()) return;
        const findings = this.allFindings();
        if (findings.length === 0) {
          new Notice("LOKF: no findings yet - run a vault scan first.");
          return;
        }
        new FindingSuggestModal(this.app, findings, (it) => void this.revealFinding(it.path, it.issue)).open();
      },
    });
    this.addCommand({
      id: "next-finding",
      name: "Go to next finding",
      callback: () => void this.gotoAdjacentFinding(1),
    });
    this.addCommand({
      id: "previous-finding",
      name: "Go to previous finding",
      callback: () => void this.gotoAdjacentFinding(-1),
    });
    this.addSettingTab(new LokfSettingTab(this.app, this));

    // A ribbon shortcut to bring up the conformance report.
    this.addRibbonIcon("shield-half", "LOKF conformance report", () => void this.activateView());

    // The read-only surface a sibling plugin or agent may read validation state
    // from, without either plugin depending on the other.
    this.api = {
      version: this.manifest.version,
      getReport: () => this.getReport(),
      validatePath: (path) => this.validatePath(path),
      onValidated: (callback) => {
        this.validatedCallbacks.add(callback);
        return () => {
          this.validatedCallbacks.delete(callback);
        };
      },
    };

    // The live, in-editor counterpart to the side report. Self-contained: the
    // extension reads its file from `editorInfoField` and pulls findings back
    // through `inlineIssuesFor`, so it needs no per-editor wiring and tears
    // down with the plugin on unload.
    this.registerEditorExtension(lokfInlineExtension(this));

    // LOKF-aware value completions inside a concept's frontmatter.
    this.registerEditorSuggest(new LokfSuggest(this.app, this));

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
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.invalidateBaseIri(file.path);
        this.targetsCache.clear();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.invalidateBaseIri(file.path);
        this.targetsCache.clear();
        this.getReportView()?.removeFileResult(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.invalidateBaseIri(file.path);
        this.invalidateBaseIri(oldPath);
        this.targetsCache.clear();
        // The old path's row is stale (the note now lives elsewhere); the new
        // path re-validates through the metadata "changed" that follows a move.
        this.getReportView()?.removeFileResult(oldPath);
        if (file instanceof TFile && file.extension === "md") this.queueMeta(file.path);
      })
    );

    // Incremental re-validation (B): when Obsidian finishes re-parsing a note's
    // frontmatter, re-check just that note from the cache instead of rescanning
    // the vault. Fires for the note being edited, so the status bar and the
    // Active-note panel section stay live alongside the inline underlines.
    this.metaFlush = debounce(() => void this.processPendingMeta(), 400, true);
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.queueMeta(file.path)));

    this.app.workspace.onLayoutReady(() => this.maybeShowSiblingNotice());
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Record<string, unknown> | null;
    const defaults = pluginDefaultSettings();
    Object.assign(this.settings, defaults);
    if (!saved) return;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof LokfSettings)[]) {
      if (saved[key] !== undefined) {
        (this.settings as unknown as Record<string, unknown>)[key] = saved[key];
      }
    }
    // Refresh a vocabulary list still at the previous built-in default to the
    // pinned schema's (so an upgrade picks up Role and the wider predicates),
    // without clobbering a list the user actually customised.
    for (const key of ["knownTypes", "knownPredicates", "genreValues", "conceptStatuses"] as const) {
      const savedVal = saved[key];
      if (Array.isArray(savedVal) && arraysEqual(savedVal as string[], HARDCODED_VOCAB[key])) {
        (this.settings as unknown as Record<string, unknown>)[key] = defaults[key];
      }
    }
    if (typeof saved["siblingNoticeShown"] === "boolean") {
      this.siblingNoticeShown = saved["siblingNoticeShown"];
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, siblingNoticeShown: this.siblingNoticeShown });
  }

  // ---- Device-local disable (H) ----

  /** Stored via app.loadLocalStorage/saveLocalStorage, which are per-vault and
   *  per-device and never synced - so a vault shared to a phone can silence the
   *  plugin there without changing its behaviour on the desktop. */
  private static readonly DEVICE_DISABLED_KEY = "lokf-enforcer:disabled-on-device";

  isDisabledOnDevice(): boolean {
    return this.app.loadLocalStorage(LokfPlugin.DEVICE_DISABLED_KEY) === true;
  }

  setDisabledOnDevice(disabled: boolean): void {
    // Clearing to null (not false) removes the entry rather than leaving a
    // per-device flag behind once the plugin is re-enabled.
    this.app.saveLocalStorage(LokfPlugin.DEVICE_DISABLED_KEY, disabled ? true : null);
    this.applyDeviceState();
  }

  /** Bring the reactive surfaces (status bar, inline underlines, active
   *  verdict) into line with the current device-local state. */
  private applyDeviceState(): void {
    if (this.isDisabledOnDevice()) {
      this.statusEl.hide();
      this.setActiveResult(null);
    } else {
      this.statusEl.show();
      const active = this.app.workspace.getActiveFile();
      if (active && active.extension === "md") void this.validateActive(active, false);
      else this.refreshStatus();
    }
    // Repaint open editors so inline underlines appear or clear at once.
    this.app.workspace.updateOptions();
  }

  /** True (with a notice) when the plugin is off on this device, so an
   *  explicitly-invoked command does nothing - "off" means off everywhere, not
   *  just for the passive surfaces. */
  private blockedOnDevice(): boolean {
    if (!this.isDisabledOnDevice()) return false;
    new Notice("LOKF: disabled on this device - re-enable it in the plugin's settings.");
    return true;
  }

  /** Frontmatter parsing lives here, not in validator.ts, so the rule engine
   *  stays dependency-free and testable outside Obsidian. Null = unparseable,
   *  which is the installed OKF validator's error to report, not ours. */
  private parseNote(content: string): ParsedNote | null {
    const { hasFm, raw } = splitFrontmatter(content);
    if (!hasFm) return { hasFm: false, data: {} };
    try {
      const parsed: unknown = parseYaml(raw);
      const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      return { hasFm: true, data: applyFieldAliases(data, this.settings.fieldAliases) };
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
    return this.issuesForParsed(vaultPath, parsed, root, isRoot, baseIri);
  }

  /** Validates already-parsed frontmatter, whether it came from a fresh read
   *  (the scan) or straight from the metadata cache (the incremental path). */
  private issuesForParsed(
    vaultPath: string,
    parsed: ParsedNote,
    root: string,
    isRoot: boolean,
    baseIri: string | null
  ): LokfIssue[] {
    const bundlePath = toBundlePath(vaultPath, root);
    const existsInBundle = (p: string): boolean => this.exists(toVaultPath(p, root));
    return validateLokfConcept(bundlePath, parsed.hasFm, parsed.data, isRoot, baseIri, this.settings, existsInBundle);
  }

  /** Already-parsed frontmatter from Obsidian's own metadata cache - the same
   *  parse the rest of Obsidian (and the sibling Curator) sees, at no cost,
   *  since the cache produced it. `frontmatter` carries an extra `position`
   *  marker the rules simply never read. Absent frontmatter (or a not-yet-
   *  indexed file) reads as none. */
  private parsedFromCache(file: TFile): ParsedNote {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm ? { hasFm: true, data: applyFieldAliases(fm, this.settings.fieldAliases) } : { hasFm: false, data: {} };
  }

  /** A bundle's base_iri read synchronously from the metadata cache, for the
   *  inline editor path that can't await a vault read. Prefers the async
   *  path's warmed cache when present; otherwise reads the root index.md's
   *  cached frontmatter (no vault I/O), so the first paint after opening a note
   *  still resolves minted ids and relation targets. Deliberately does not
   *  populate `baseIriCache`, which the async path owns. */
  private cachedBaseIriFor(root: string): string | null {
    if (this.baseIriCache.has(root)) return this.baseIriCache.get(root) ?? null;
    const rootIndex = this.app.vault.getAbstractFileByPath(this.rootIndexPathFor(root));
    if (!(rootIndex instanceof TFile)) return null;
    const fm = this.app.metadataCache.getFileCache(rootIndex)?.frontmatter;
    return fm ? readBaseIri(fm) : null;
  }

  // ---- InlineHost: the surface the CodeMirror extension (inline.ts) pulls ----

  inlineDiagnosticsEnabled(): boolean {
    return !this.isDisabledOnDevice() && this.settings.inlineDiagnostics;
  }

  /** Synchronous findings for the note in the editor, or null when it is
   *  outside every configured bundle (so the extension marks nothing). Mirrors
   *  the panel's `validateActive` path, minus the async base_iri read. */
  inlineIssuesFor(file: TFile, doc: string): LokfIssue[] | null {
    if (!this.isConcept(file)) return null;
    const root = this.resolveRoot(file.path) ?? "";
    const baseIri = this.cachedBaseIriFor(root);
    return this.issuesFor(file.path, doc, root, this.isRoot(file, root), baseIri);
  }

  // ---- Incremental re-validation (B) ----

  private queueMeta(path: string): void {
    if (this.isDisabledOnDevice()) return;
    this.pendingMeta.add(path);
    this.metaFlush();
  }

  /** Re-validate the notes whose metadata changed since the last flush, from
   *  the cache, patching the open report and the active-note verdict in place.
   *  A root index.md whose base_iri actually changed re-mints and re-resolves
   *  the whole bundle, so that one case falls back to a single silent rescan. */
  private async processPendingMeta(): Promise<void> {
    const paths = [...this.pendingMeta];
    this.pendingMeta.clear();
    const view = this.getReportView();
    const active = this.app.workspace.getActiveFile();
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      if (!this.isConcept(file)) continue;
      const root = this.resolveRoot(file.path) ?? "";
      if (file.path === this.rootIndexPathFor(root)) {
        const prev = this.cachedBaseIriFor(root);
        this.invalidateBaseIri(file.path);
        if (this.cachedBaseIriFor(root) !== prev) {
          await this.scanVault(false, true);
          return;
        }
      }
      const baseIri = this.cachedBaseIriFor(root);
      const issues = this.issuesForParsed(
        file.path,
        this.parsedFromCache(file),
        root,
        this.isRoot(file, root),
        baseIri
      );
      view?.patchFileResult(file.path, issues);
      if (active && active.path === file.path) this.setActiveResult({ path: file.path, issues });
    }
    if (paths.length) this.emitValidated();
  }

  // ---- Concept graph / index (C) ----

  /** Build the whole-vault concept graph fresh from the metadata cache: every
   *  concept (a bundled note that isn't a reserved index.md/log.md) with its
   *  type, id, and the concepts its typed relations resolve to. Built on demand
   *  rather than kept live, so a query is always accurate; the resolution reuses
   *  the rules' own target logic so an edge here means exactly what a relation
   *  check means. */
  buildConceptGraph(): ConceptGraph {
    const configDir = this.app.vault.configDir;
    const conceptFiles = this.app.vault
      .getMarkdownFiles()
      .filter(
        (f) =>
          !f.path.startsWith(configDir + "/") &&
          !isExcluded(f.path, this.settings) &&
          this.isInBundle(f.path) &&
          !isReserved(f.path)
      );
    const conceptPaths = new Set(conceptFiles.map((f) => f.path));
    const records: ConceptRecord[] = [];
    for (const f of conceptFiles) {
      const parsed = this.parsedFromCache(f);
      if (!parsed.hasFm) continue;
      const data = parsed.data;
      const root = this.resolveRoot(f.path) ?? "";
      const baseIri = this.cachedBaseIriFor(root);
      const type = typeof data["type"] === "string" ? data["type"].trim() || null : null;
      const id = typeof data["id"] === "string" ? data["id"] : null;
      records.push({
        path: f.path,
        type,
        id,
        targets: this.outgoingConceptTargets(data, baseIri, root, f.path, conceptPaths),
      });
    }
    return buildConceptGraph(records);
  }

  /** The vault paths of the concepts a note's typed relations point at, using
   *  the same resolution the relation check does (external IRIs and targets that
   *  don't name a real concept are dropped, so each is a genuine edge). */
  private outgoingConceptTargets(
    data: Record<string, unknown>,
    baseIri: string | null,
    root: string,
    selfVaultPath: string,
    conceptPaths: Set<string>
  ): string[] {
    const bundleSelf = toBundlePath(selfVaultPath, root);
    const cut = bundleSelf.lastIndexOf("/");
    const conceptDir = cut > 0 ? bundleSelf.slice(0, cut) : "";
    const out = new Set<string>();
    const consider = (rawTarget: unknown) => {
      if (typeof rawTarget !== "string") return;
      const resolved = resolveRelationTarget(rawTarget, baseIri);
      if (resolved.kind === "external-iri" || resolved.kind === "malformed") return;
      const siblingDir = resolved.kind === "internal-relative" ? conceptDir : "";
      const match = this.matchConcept(resolved.resolvedPath ?? "", siblingDir, root, conceptPaths);
      if (match && match !== selfVaultPath) out.add(match);
    };
    for (const field of RELATION_FIELDS) {
      const v = data[field];
      if (typeof v === "string") consider(v);
      else if (Array.isArray(v)) for (const x of v) consider(x);
    }
    const relations = data["relations"];
    if (Array.isArray(relations)) {
      for (const entry of relations) {
        if (entry && typeof entry === "object") consider((entry as { target?: unknown }).target);
      }
    }
    return [...out];
  }

  /** The vault path of the concept a resolved (bundle-relative) target names, or
   *  null. Mirrors validator.ts's `targetExists`: tries the id and `.md`
   *  spellings, a percent-decoded form, and - for a bare relative target - the
   *  note's own directory. */
  private matchConcept(bundleRelPath: string, siblingDir: string, root: string, conceptPaths: Set<string>): string | null {
    if (!bundleRelPath) return null;
    const bases = new Set([bundleRelPath]);
    try {
      bases.add(decodeURIComponent(bundleRelPath));
    } catch {
      // A malformed escape just means there is nothing extra to try.
    }
    if (siblingDir) for (const b of [...bases]) bases.add(`${siblingDir}/${b}`);
    for (const b of bases) {
      for (const candidate of [b, b + ".md"]) {
        const vaultPath = toVaultPath(candidate, root);
        if (conceptPaths.has(vaultPath)) return vaultPath;
      }
    }
    return null;
  }

  // ---- SuggestHost: value completions inside frontmatter (D) ----

  suggestEnabled(): boolean {
    return !this.isDisabledOnDevice() && this.settings.autocomplete;
  }

  /** The vocabulary a concept's frontmatter completes against, from settings,
   *  or null when the file isn't a concept in a configured bundle. */
  suggestVocabularyFor(file: TFile): SuggestVocabulary | null {
    if (!this.isConcept(file)) return null;
    return {
      types: this.settings.knownTypes,
      genres: this.settings.genreValues,
      statuses: this.settings.conceptStatuses,
      predicates: this.settings.knownPredicates,
    };
  }

  /** The other concepts in this file's bundle, as bundle-relative paths without
   *  the `.md` extension - the resolvable targets a relation can name. Cached
   *  per bundle root; the active file itself is excluded at call time. */
  conceptTargets(file: TFile): string[] {
    const root = this.resolveRoot(file.path);
    if (root === null) return [];
    let list = this.targetsCache.get(root);
    if (!list) {
      const configDir = this.app.vault.configDir;
      list = this.app.vault
        .getMarkdownFiles()
        .filter(
          (f) =>
            !f.path.startsWith(configDir + "/") &&
            !isExcluded(f.path, this.settings) &&
            this.resolveRoot(f.path) === root &&
            !isReserved(f.path)
        )
        .map((f) => toBundlePath(f.path, root).replace(/\.md$/i, ""))
        .sort();
      this.targetsCache.set(root, list);
    }
    const self = toBundlePath(file.path, root).replace(/\.md$/i, "");
    return list.filter((p) => p !== self);
  }

  // ---- Safe quick-fixes (E) ----

  /** Apply every deterministic fix for the active note's findings, as
   *  format-preserving text edits through the editor (so it's one undo step and
   *  no file reload). Owned values (base_iri authority, publisher identity) are
   *  never guessed - only unambiguous corrections. */
  private async fixActiveNote(view: MarkdownView): Promise<void> {
    if (this.blockedOnDevice()) return;
    const file = view.file;
    if (!file || !this.isConcept(file)) {
      new Notice("LOKF: the active note is not a concept in a configured bundle.");
      return;
    }
    const editor = view.editor;
    const doc = editor.getValue();
    const parsed = this.parseNote(doc);
    if (!parsed) return;
    const root = this.resolveRoot(file.path) ?? "";
    const baseIri = this.cachedBaseIriFor(root);
    const issues = this.issuesForParsed(file.path, parsed, root, this.isRoot(file, root), baseIri);
    const edits = computeFixes(issues, doc, parsed.data);
    if (edits.length === 0) {
      new Notice("LOKF: no safe fixes available in this note.");
      return;
    }
    // computeFixes returns edits last-first, so applying in order never shifts a
    // still-pending edit's offsets.
    for (const edit of edits) {
      editor.replaceRange(edit.text, editor.offsetToPos(edit.from), editor.offsetToPos(edit.to));
    }
    new Notice(`LOKF: applied ${edits.length} safe fix(es).`);
  }

  // ---- Promote body links to typed relations (§9.4) ----

  /** Extract the note body's markdown links, resolve each to a bundle concept,
   *  guess a typed relation from the surrounding sentence, and let the owner
   *  choose which to add. A guess is never written unprompted - the modal is the
   *  human confirmation the heuristic requires. */
  private async proposeRelations(view: MarkdownView): Promise<void> {
    if (this.blockedOnDevice()) return;
    const file = view.file;
    if (!file || !this.isConcept(file)) {
      new Notice("LOKF: the active note is not a concept in a configured bundle.");
      return;
    }
    const doc = view.editor.getValue();
    const parsed = this.parseNote(doc);
    if (!parsed || !parsed.hasFm) {
      new Notice("LOKF: this note has no LOKF frontmatter to add relations to.");
      return;
    }
    const { body } = splitFrontmatter(doc);
    const root = this.resolveRoot(file.path) ?? "";
    const baseIri = this.cachedBaseIriFor(root);
    const conceptPaths = new Set(this.candidateFiles().filter((f) => !isReserved(f.path)).map((f) => f.path));
    const bundleSelf = toBundlePath(file.path, root);
    const cut = bundleSelf.lastIndexOf("/");
    const conceptDir = cut > 0 ? bundleSelf.slice(0, cut) : "";
    // Targets any relation already points at - a proposal for one is redundant.
    const asserted = new Set(this.outgoingConceptTargets(parsed.data, baseIri, root, file.path, conceptPaths));
    const resolve = (raw: string): { path: string; bundle: string } | null => {
      const r = resolveRelationTarget(raw, baseIri);
      if (r.kind === "external-iri" || r.kind === "malformed") return null;
      const siblingDir = r.kind === "internal-relative" ? conceptDir : "";
      const path = this.matchConcept(r.resolvedPath ?? "", siblingDir, root, conceptPaths);
      if (!path || path === file.path) return null;
      return { path, bundle: toBundlePath(path, root).replace(/\.md$/i, "") };
    };
    const proposals = buildProposals(extractBodyLinks(body), resolve, (p) => asserted.has(p));
    if (proposals.length === 0) {
      new Notice("LOKF: no new typed relations to propose from this note's links.");
      return;
    }
    new ProposeModal(this.app, proposals, (chosen) => void this.applyProposals(file, chosen)).open();
  }

  /** Write accepted proposals into frontmatter, preserving everything else:
   *  a named slot relation appends its bundle-relative target, any other
   *  predicate appends a `{predicate, target}` entry to `relations`. */
  private async applyProposals(file: TFile, proposals: Proposal[]): Promise<void> {
    if (proposals.length === 0) return;
    const slots = new Set<string>(RELATION_FIELDS);
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      for (const p of proposals) {
        if (slots.has(p.predicate)) {
          const cur = fm[p.predicate];
          const list: unknown[] = Array.isArray(cur) ? cur : cur === undefined ? [] : [cur];
          if (!list.includes(p.targetBundle)) list.push(p.targetBundle);
          fm[p.predicate] = list;
        } else {
          const relations: unknown[] = Array.isArray(fm["relations"]) ? fm["relations"] : [];
          const dup = relations.some((r) => {
            if (!r || typeof r !== "object") return false;
            const entry = r as { predicate?: unknown; target?: unknown };
            return entry.predicate === p.predicate && entry.target === p.targetBundle;
          });
          if (!dup) relations.push({ predicate: p.predicate, target: p.targetBundle });
          fm["relations"] = relations;
        }
      }
    });
    new Notice(`LOKF: added ${proposals.length} typed relation(s).`);
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
    if (this.isDisabledOnDevice()) {
      if (!silent) new Notice("LOKF: disabled on this device - re-enable it in the plugin's settings.");
      return;
    }
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
      // Rule-severity escalation also covers the synthetic bundle-level findings,
      // which are assembled here rather than by validateLokfConcept; it is
      // idempotent on the per-file results, which were escalated already.
      for (const r of results) r.issues = applySeverityOverrides(r.issues, this.settings);
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
      this.emitValidated();
    } finally {
      this.busy = false;
    }
  }

  private renderResults(results: FileResult[], scanned: number): void {
    // Retain the latest scan so the ribbon, a reopened panel, the public API,
    // and the finding-navigation commands can all read it even when the panel
    // is closed; the open view (if any) is refreshed in step.
    this.lastReport = { results, scanned };
    this.getReportView()?.setResults(results, scanned);
  }

  // ---- Read-only public API (I) ----

  /** The most recent scan as the public API's shape (structurally the internal
   *  findings, exposed under the stable `LokfFileFindings` contract). Cloned, so
   *  a consumer holding the snapshot can never mutate the plugin's own state. */
  private getReport(): LokfFileFindings[] {
    const results = this.getReportView()?.results ?? this.lastReport?.results ?? [];
    return results.map((r) => ({ path: r.path, findings: r.issues.map((issue) => ({ ...issue })) }));
  }

  /** Validate one note on demand for the public API: read-only, writes nothing;
   *  a non-concept or unreadable note returns no findings. */
  private async validatePath(path: string): Promise<LokfFinding[]> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md" || !this.isConcept(file)) return [];
    const root = this.resolveRoot(file.path) ?? "";
    const baseIri = await this.findBaseIriFor(root);
    const content = await this.readOrNull(file);
    if (content === null) return [];
    return this.issuesFor(file.path, content, root, this.isRoot(file, root), baseIri);
  }

  /** Notify API subscribers that a validation finished. A subscriber's callback
   *  must never break validation, so each is isolated. */
  private emitValidated(): void {
    for (const callback of this.validatedCallbacks) {
      try {
        callback();
      } catch {
        // A consumer's callback throwing is its own bug, not ours to surface.
      }
    }
  }

  private setActiveResult(active: { path: string; issues: LokfIssue[] } | null): void {
    this.activeResult = active;
    this.hasVerdict = active !== null;
    this.getReportView()?.setActiveResult(active);
    this.refreshStatus();
  }

  // ---- Finding navigation (F) ----

  /** Every finding in the current report as a flat, path-then-report-order
   *  list - the source both the quick-switcher and the next/previous commands
   *  walk. Reads whatever the panel last showed (or the pending scan if it is
   *  closed); synthetic bundle-level findings are included, they just don't
   *  jump to a key. */
  allFindings(): FindingItem[] {
    const results = this.getReportView()?.results ?? this.lastReport?.results ?? [];
    const items: FindingItem[] = [];
    for (const r of results) for (const issue of r.issues) items.push({ path: r.path, issue });
    return items;
  }

  private async gotoAdjacentFinding(delta: number): Promise<void> {
    if (this.blockedOnDevice()) return;
    const findings = this.allFindings();
    if (findings.length === 0) {
      new Notice("LOKF: no findings yet - run a vault scan first.");
      return;
    }
    this.findingCursor = ((this.findingCursor + delta) % findings.length + findings.length) % findings.length;
    const item = findings[this.findingCursor];
    if (item) await this.revealFinding(item.path, item.issue);
  }

  /** Open the note and put the cursor on the offending frontmatter key,
   *  selecting its value. Falls back to just opening when the finding names no
   *  key (a whole-note finding) or its file doesn't exist (a synthetic
   *  bundle-level finding). Shared by the report rows, the quick-switcher, and
   *  the next/previous commands. */
  async revealFinding(path: string, issue: LokfIssue): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const view = leaf.view;
    if (!issue.key || !(view instanceof MarkdownView)) return;
    const { hasFm, raw } = splitFrontmatter(view.editor.getValue());
    if (!hasFm) return;
    const loc = locateFrontmatterKey(raw, issue.key);
    if (!loc) return;
    // The raw block starts on document line 1 - line 0 is the opening `---`.
    const line = loc.line + 1;
    const from: EditorPosition = { line, ch: loc.valueStart >= 0 ? loc.valueStart : loc.keyStart };
    const to: EditorPosition = { line, ch: loc.valueEnd >= 0 ? loc.valueEnd : loc.keyEnd };
    view.editor.setSelection(from, to);
    view.editor.scrollIntoView({ from, to }, true);
  }

  /** Apply the one deterministic fix a single finding warrants (from the report
   *  row's context menu), writing through `vault.process` so the rest of the
   *  note - and any open editor - is left untouched. Recomputes against the
   *  freshest content so the edit offsets are valid even if the note changed. */
  async fixFinding(path: string, issue: LokfIssue): Promise<void> {
    if (this.blockedOnDevice()) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    let applied = false;
    await this.app.vault.process(file, (data) => {
      const parsed = this.parseNote(data);
      const edit = parsed ? computeFix(issue, data, parsed.data) : null;
      if (!edit) return data;
      applied = true;
      return data.slice(0, edit.from) + edit.text + data.slice(edit.to);
    });
    new Notice(applied ? "LOKF: applied 1 safe fix." : "LOKF: no safe fix for this finding.");
  }

  /** Silence a whole note from the report by writing the opt-out flag into its
   *  frontmatter (the same key the rule engine reads). The metadata change then
   *  re-validates it to clean through the incremental path. */
  async silenceNote(path: string): Promise<void> {
    if (this.blockedOnDevice()) return;
    const key = this.settings.ignoreFrontmatterKey.trim();
    if (!key) {
      new Notice("LOKF: no per-note opt-out key is configured in settings.");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm[key] = "ignore";
    });
    new Notice(`LOKF: silenced this note (${key}: ignore).`);
  }

  async validateActive(file: TFile, notify: boolean): Promise<void> {
    if (this.isDisabledOnDevice()) {
      this.setActiveResult(null);
      if (notify) new Notice("LOKF: disabled on this device - re-enable it in the plugin's settings.");
      return;
    }
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
      this.setActiveResult({ path: file.path, issues: applySeverityOverrides(unreadableIssues(), this.settings) });
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
      // Restore the retained report (kept, not consumed, so a later reopen still
      // shows it); incremental edits while it was closed are picked up by the
      // next scan.
      if (this.lastReport) {
        leaf.view.setResults(this.lastReport.results, this.lastReport.scanned);
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
