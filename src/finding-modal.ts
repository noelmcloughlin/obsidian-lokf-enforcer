// finding-modal.ts - a keyboard-first quick-switcher over every finding (F).
//
// Built on Obsidian's own SuggestModal (no custom popup), it lists the report's
// findings and, on choose, jumps to the offending frontmatter key - the same
// place clicking a report row lands. It narrows through the shared filter
// predicate, so `sev:error`, `rule:lokf/2`, and plain substrings all work here
// exactly as they do in the panel's filter box.
import { App, SuggestModal } from "obsidian";
import type { LokfIssue } from "./validator";
import { issueMatchesFilter } from "./report-filter";

export interface FindingItem {
  path: string;
  issue: LokfIssue;
}

export class FindingSuggestModal extends SuggestModal<FindingItem> {
  private items: FindingItem[];
  private onChoose: (item: FindingItem) => void;

  constructor(app: App, items: FindingItem[], onChoose: (item: FindingItem) => void) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
    this.setPlaceholder("Search findings (try sev:error or a rule ID)");
  }

  getSuggestions(query: string): FindingItem[] {
    return this.items.filter((it) => issueMatchesFilter(it.path, it.issue, query));
  }

  renderSuggestion(it: FindingItem, el: HTMLElement): void {
    el.createDiv({ cls: "lokf-suggest-title", text: it.issue.message });
    el.createEl("small", {
      cls: "lokf-suggest-meta",
      text: `${it.issue.severity} · ${it.issue.rule} · ${it.path}`,
    });
  }

  onChooseSuggestion(it: FindingItem): void {
    this.onChoose(it);
  }
}
