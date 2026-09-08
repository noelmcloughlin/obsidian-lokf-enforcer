// report-view.ts - compact, collapsible LOKF conformance report pane
import { ItemView, TFile, type WorkspaceLeaf } from "obsidian";
import type LokfPlugin from "./main";
import type { LokfIssue } from "./validator";

export const LOKF_VIEW_TYPE = "lokf-report-view";

export interface FileResult {
  path: string;
  issues: LokfIssue[];
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
    this.progressBar.style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
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

  setActiveResult(active: { path: string; issues: LokfIssue[] } | null) {
    this.activePath = active?.path ?? null;
    this.activeIssues = active?.issues ?? [];
    this.renderActive();
  }

  private openFile(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
  }

  private renderSummary() {
    const el = this.summaryEl;
    if (!el) return;
    el.empty();
    const errFiles = this.results.filter(hasError).length;
    const warnFiles = this.results.length - errFiles;
    const cleanCount = Math.max(0, this.scanned - this.results.length);
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

    const byFolder = new Map<string, FileResult[]>();
    for (const r of this.results) {
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
      header.createSpan({ cls: "lokf-caret", text: isCollapsed ? "▸" : "▾" });
      header.createSpan({ text: folder || "/" });
      header.createSpan({ cls: "lokf-count", text: String(items.length) });
      header.addEventListener("click", () => {
        if (isCollapsed) this.collapsed.delete(folder);
        else this.collapsed.add(folder);
        this.renderList();
      });

      if (!isCollapsed) {
        const list = group.createDiv({ cls: "lokf-list" });
        for (const r of items) this.renderFileBlock(list, r, false);
      }
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
      caret.addEventListener("click", () => {
        if (isOpen) this.expanded.delete(r.path);
        else this.expanded.add(r.path);
        this.renderList();
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
      for (const issue of r.issues) {
        const row = issuesEl.createDiv({ cls: "lokf-issue" });
        row.createSpan({ cls: `lokf-sev lokf-sev-${issue.severity}`, text: issue.severity });
        row.createSpan({ cls: "lokf-rule", text: issue.rule });
        row.createSpan({ text: issue.message });
      }
    }
  }
}
