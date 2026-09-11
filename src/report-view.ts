// report-view.ts - compact, collapsible LOKF conformance report pane
import { ItemView, Menu, TFile, setIcon, debounce, type WorkspaceLeaf } from "obsidian";
import type LokfPlugin from "./main";
import { type LokfIssue } from "./validator";
import { issueMatchesFilter, topLevelKey } from "./report-filter";

export const LOKF_VIEW_TYPE = "lokf-report-view";

// Ceilings so a first scan of a very large or very messy bundle can't paint
// thousands of DOM nodes at once; the filter box narrows past either of them.
const MAX_FILES = 300;
const MAX_ISSUES_PER_FILE = 100;

export interface FileResult {
  path: string;
  issues: LokfIssue[];
  /** True for a bundle-level finding (no root index.md, a hidden or missing
   *  bundle-root folder) that isn't one of the files actually scanned - its
   *  `path` names where to hang the finding, not a file `scanned` counted.
   *  Lets the clean-count below subtract only real per-file results. */
  synthetic?: boolean;
}

/** The folder a vault-relative path sits in; "" for a note at the vault root. */
function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(0, cut) : "";
}

function hasError(r: FileResult): boolean {
  return r.issues.some((i) => i.severity === "error");
}

export class LokfReportView extends ItemView {
  plugin: LokfPlugin;
  results: FileResult[] = [];
  scanned = 0;
  private expanded = new Set<string>();
  private collapsed = new Set<string>();
  private activePath: string | null = null;
  private activeIssues: LokfIssue[] = [];
  private filter = "";

  // Persistent hosts, so re-rendering one section leaves the others alone.
  private progressWrap: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private progressLabel: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private activeEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LokfPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return LOKF_VIEW_TYPE;
  }
  getDisplayText() {
    return "LOKF conformance";
  }
  getIcon() {
    return "shield-half";
  }

  async onOpen() {
    this.buildSkeleton();
    this.renderSummary();
    this.renderActive();
    this.renderList();
  }

  private buildSkeleton() {
    const c = this.contentEl;
    c.empty();
    c.addClass("lokf-report");

    const toolbar = c.createDiv({ cls: "lokf-toolbar" });
    const rescan = toolbar.createEl("button", { text: "Rescan" });
    rescan.addEventListener("click", () => void this.plugin.scanVault());

    const filterInput = toolbar.createEl("input", {
      cls: "lokf-filter",
      attr: { type: "search", placeholder: "Filter findings (try sev:error)", "aria-label": "Filter findings" },
    });
    filterInput.value = this.filter;
    // Debounced so typing doesn't re-render the whole list on every keystroke.
    const onFilter = debounce((value: string) => {
      this.filter = value;
      this.renderList();
    }, 150);
    filterInput.addEventListener("input", () => onFilter(filterInput.value));

    this.progressWrap = c.createDiv({ cls: "lokf-progress-wrap" });
    this.progressWrap.hide();
    this.progressLabel = this.progressWrap.createDiv({ cls: "lokf-progress-label" });
    const track = this.progressWrap.createDiv({ cls: "lokf-progress-track" });
    this.progressBar = track.createDiv({ cls: "lokf-progress-bar" });

    this.summaryEl = c.createDiv({ cls: "lokf-summary" });
    this.activeEl = c.createDiv();
    this.listEl = c.createDiv({ cls: "lokf-body" });
  }

  showProgress(label: string) {
    if (!this.progressWrap) return;
    this.progressWrap.show();
    this.setProgress(0, label);
  }

  setProgress(frac: number, label?: string) {
    if (!this.progressBar || !this.progressLabel) return;
    this.progressBar.setCssStyles({ width: `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%` });
    if (label) this.progressLabel.setText(label);
  }

  hideProgress() {
    this.progressWrap?.hide();
  }

  setResults(results: FileResult[], scanned: number) {
    this.results = results;
    this.scanned = scanned;
    this.renderSummary();
    this.renderList();
  }

  /** Incrementally replace, insert (kept path-sorted), or drop one file's row
   *  in response to a single metadata change, so an edit doesn't force a full
   *  vault rescan (B). No-op until a scan has populated the panel, so a stray
   *  edit never paints a partial report. `scanned` is left alone - one edit
   *  didn't rescan the vault - so the clean count stays an approximation
   *  between full scans, which is the honest thing to show. */
  patchFileResult(path: string, issues: LokfIssue[]) {
    if (this.scanned === 0 && this.results.length === 0) return;
    const idx = this.results.findIndex((r) => r.path === path && !r.synthetic);
    if (issues.length === 0) {
      if (idx < 0) return;
      this.results.splice(idx, 1);
    } else if (idx >= 0) {
      this.results[idx] = { path, issues };
    } else {
      this.results.push({ path, issues });
      this.results.sort((a, b) => a.path.localeCompare(b.path));
    }
    this.renderSummary();
    this.renderList();
  }

  /** Drop a file's row outright when it is deleted or renamed away. */
  removeFileResult(path: string) {
    const before = this.results.length;
    this.results = this.results.filter((r) => !(r.path === path && !r.synthetic));
    if (this.results.length !== before) {
      this.renderSummary();
      this.renderList();
    }
  }

  setActiveResult(active: { path: string; issues: LokfIssue[] } | null) {
    this.activePath = active?.path ?? null;
    this.activeIssues = active?.issues ?? [];
    this.renderActive();
  }

  private openFile(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
  }

  /** Opens the note and puts the cursor on the offending frontmatter key. The
   *  shared implementation lives on the plugin, so the report rows, the
   *  findings quick-switcher, and the next/previous commands all land the same
   *  way. */
  private async jumpToIssue(path: string, issue: LokfIssue) {
    await this.plugin.revealFinding(path, issue);
  }

  private renderSummary() {
    const el = this.summaryEl;
    if (!el) return;
    el.empty();
    const errFiles = this.results.filter(hasError).length;
    const warnFiles = this.results.length - errFiles;
    // Subtract only real per-file results - a synthetic bundle-level finding
    // (missing root index.md, a hidden root, ...) has a path that was never
    // part of `scanned`, so counting it here would undercount "clean".
    const fileResults = this.results.filter((r) => !r.synthetic).length;
    const cleanCount = Math.max(0, this.scanned - fileResults);
    el.createSpan({ cls: "lokf-chip lokf-chip-ok", text: `${cleanCount} clean` });
    el.createSpan({ cls: "lokf-chip lokf-chip-warn", text: `${warnFiles} warnings` });
    el.createSpan({ cls: "lokf-chip lokf-chip-err", text: `${errFiles} errors` });
  }

  private renderActive() {
    const el = this.activeEl;
    if (!el) return;
    el.empty();
    if (!this.activePath) {
      // Otherwise the section's border-bottom lingers as a stray rule.
      el.removeClass("lokf-active");
      return;
    }
    el.addClass("lokf-active");
    el.createEl("h4", { text: "Active note" });
    if (this.activeIssues.length === 0) {
      el.createDiv({ cls: "lokf-active-ok", text: `${this.activePath} - clean.` });
      return;
    }
    this.renderFileBlock(el, { path: this.activePath, issues: this.activeIssues }, true);
  }

  private renderList() {
    const el = this.listEl;
    if (!el) return;
    el.empty();

    if (this.results.length === 0) {
      el.createDiv({
        cls: "lokf-empty",
        text: this.scanned === 0 ? "Run “Rescan” to check this vault." : "No LOKF findings.",
      });
      return;
    }

    // Keep only the findings matching the filter box, dropping files left with
    // none; an empty filter passes everything through untouched.
    const results = this.filter.trim()
      ? this.results
          .map((r) => ({ ...r, issues: r.issues.filter((i) => issueMatchesFilter(r.path, i, this.filter)) }))
          .filter((r) => r.issues.length > 0)
      : this.results;

    if (results.length === 0) {
      el.createDiv({ cls: "lokf-empty", text: `No findings match “${this.filter.trim()}”.` });
      return;
    }

    // Cap the number of file blocks so a huge report can't blow up the DOM; the
    // filter box is the way to see past the cap.
    const truncated = results.length > MAX_FILES;
    const shown = truncated ? results.slice(0, MAX_FILES) : results;

    const byFolder = new Map<string, FileResult[]>();
    for (const r of shown) {
      const dir = dirOf(r.path);
      if (!byFolder.has(dir)) byFolder.set(dir, []);
      byFolder.get(dir)!.push(r);
    }

    const folders = [...byFolder.keys()].sort((a, b) => a.localeCompare(b));
    for (const folder of folders) {
      const items = byFolder.get(folder)!.sort((a, b) => a.path.localeCompare(b.path));
      const isCollapsed = this.collapsed.has(folder);

      const group = el.createDiv({ cls: "lokf-group" });
      const header = group.createDiv({ cls: "lokf-group-header" });
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", String(!isCollapsed));
      header.setAttribute("aria-label", `${folder || "/"} (${items.length}) - ${isCollapsed ? "expand" : "collapse"}`);
      header.createSpan({ cls: "lokf-caret", text: isCollapsed ? "▸" : "▾" });
      header.createSpan({ text: folder || "/" });
      header.createSpan({ cls: "lokf-count", text: String(items.length) });
      const toggleFolder = () => {
        if (isCollapsed) this.collapsed.delete(folder);
        else this.collapsed.add(folder);
        this.renderList();
      };
      header.addEventListener("click", toggleFolder);
      header.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          toggleFolder();
        }
      });

      if (!isCollapsed) {
        const list = group.createDiv({ cls: "lokf-list" });
        for (const r of items) this.renderFileBlock(list, r, false);
      }
    }

    if (truncated) {
      el.createDiv({
        cls: "lokf-empty",
        text: `+${results.length - MAX_FILES} more file(s) hidden - use the filter to narrow the list.`,
      });
    }
  }

  private renderFileBlock(parent: HTMLElement, r: FileResult, alwaysOpen: boolean) {
    const isOpen = alwaysOpen || this.expanded.has(r.path);
    const block = parent.createDiv({ cls: "lokf-file-block" });
    const head = block.createDiv({ cls: "lokf-file-head" });

    // The active block has nothing to collapse, but still reserves the caret's
    // width so its name lines up with the rows in the list below.
    const caret = head.createSpan({ cls: "lokf-caret", text: alwaysOpen ? "" : isOpen ? "▾" : "▸" });
    if (!alwaysOpen) {
      caret.setAttribute("role", "button");
      caret.setAttribute("tabindex", "0");
      caret.setAttribute("aria-expanded", String(isOpen));
      caret.setAttribute("aria-label", `${isOpen ? "Collapse" : "Expand"} ${r.path}`);
      const toggleFile = () => {
        if (isOpen) this.expanded.delete(r.path);
        else this.expanded.add(r.path);
        this.renderList();
      };
      caret.addEventListener("click", toggleFile);
      caret.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          toggleFile();
        }
      });
    }

    head.createSpan({ cls: `lokf-dot ${hasError(r) ? "lokf-dot-err" : "lokf-dot-warn"}` });

    const name = head.createSpan({
      cls: "lokf-file-name",
      text: r.path.split("/").pop() || r.path,
    });
    name.setAttribute("aria-label", `Open ${r.path}`);
    name.addEventListener("click", (evt) => {
      evt.stopPropagation();
      this.openFile(r.path);
    });

    head.createSpan({ cls: "lokf-count", text: String(r.issues.length) });

    if (isOpen) {
      const issuesEl = block.createDiv({ cls: "lokf-issues" });
      const fileExists = this.app.vault.getAbstractFileByPath(r.path) instanceof TFile;
      const shown = r.issues.slice(0, MAX_ISSUES_PER_FILE);
      // Group a file's findings by their top-level key (base_iri, publisher,
      // relations, …) only when they span more than one - otherwise the flat
      // list reads better than a tree of one-item groups.
      const keys = new Set(shown.map((i) => topLevelKey(i.key)));
      if (keys.size >= 2) {
        const byKey = new Map<string, LokfIssue[]>();
        for (const issue of shown) {
          const k = topLevelKey(issue.key);
          if (!byKey.has(k)) byKey.set(k, []);
          byKey.get(k)!.push(issue);
        }
        for (const [k, groupIssues] of byKey) {
          const keyGroup = issuesEl.createDiv({ cls: "lokf-key-group" });
          keyGroup.createDiv({ cls: "lokf-key-label", text: k || "(note)" });
          for (const issue of groupIssues) this.renderIssueRow(keyGroup, r, issue, fileExists);
        }
      } else {
        for (const issue of shown) this.renderIssueRow(issuesEl, r, issue, fileExists);
      }
      if (r.issues.length > shown.length) {
        issuesEl.createDiv({
          cls: "lokf-empty",
          text: `+${r.issues.length - shown.length} more finding(s) - use the filter to narrow.`,
        });
      }
    }
  }

  private renderIssueRow(container: HTMLElement, r: FileResult, issue: LokfIssue, fileExists: boolean) {
    const row = container.createDiv({ cls: "lokf-issue" });
    const sev = row.createSpan({ cls: `lokf-sev lokf-sev-${issue.severity}` });
    setIcon(sev, issue.severity === "error" ? "alert-circle" : "alert-triangle");
    sev.setAttribute("aria-label", issue.severity);
    row.createSpan({ cls: "lokf-rule", text: issue.rule });
    row.createSpan({ text: issue.message });

    // Copy is useful even for a synthetic bundle-level finding (no file to
    // open); the file-bound actions are added only when the file exists.
    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      const menu = new Menu();
      menu.addItem((i) => i.setTitle("Copy message").setIcon("copy").onClick(() => void navigator.clipboard.writeText(issue.message)));
      if (fileExists) {
        menu.addItem((i) => i.setTitle("Open").setIcon("go-to-file").onClick(() => void this.jumpToIssue(r.path, issue)));
        menu.addItem((i) => i.setTitle("Fix this finding").setIcon("wrench").onClick(() => void this.plugin.fixFinding(r.path, issue)));
        if (this.plugin.settings.ignoreFrontmatterKey.trim()) {
          menu.addItem((i) => i.setTitle("Silence this note").setIcon("eye-off").onClick(() => void this.plugin.silenceNote(r.path)));
        }
      }
      menu.showAtMouseEvent(evt);
    });

    // A synthetic bundle-level finding names a file that doesn't exist, so
    // there is nothing to open; leave the rest of the row inert.
    if (!fileExists) return;
    row.addClass("lokf-issue-clickable");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", issue.key ? `Jump to ${issue.key} in ${r.path}` : `Open ${r.path}`);
    const go = () => void this.jumpToIssue(r.path, issue);
    row.addEventListener("click", go);
    row.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        go();
      }
    });
  }
}
