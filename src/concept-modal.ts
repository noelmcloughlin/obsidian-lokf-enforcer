// concept-modal.ts - a keyboard-first quick-switcher over a bundle's concepts.
//
// Built on Obsidian's own SuggestModal (no custom popup), it lists concepts from
// the graph index (C) - by name, type, or id - and opens the chosen one. The
// same modal serves both "find any concept" and "find an orphan", differing only
// in the list it is handed.
import { App, SuggestModal, TFile } from "obsidian";
import type { ConceptGraph, ConceptRecord } from "./graph";

export class ConceptSuggestModal extends SuggestModal<ConceptRecord> {
  private graph: ConceptGraph;
  private items: ConceptRecord[];

  constructor(app: App, graph: ConceptGraph, items: ConceptRecord[], placeholder: string) {
    super(app);
    this.graph = graph;
    this.items = items;
    this.setPlaceholder(placeholder);
  }

  getSuggestions(query: string): ConceptRecord[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.items;
    return this.items.filter(
      (r) =>
        r.path.toLowerCase().includes(q) ||
        (r.type ?? "").toLowerCase().includes(q) ||
        (r.id ?? "").toLowerCase().includes(q)
    );
  }

  renderSuggestion(r: ConceptRecord, el: HTMLElement): void {
    el.createDiv({ cls: "lokf-suggest-title", text: r.path.split("/").pop() ?? r.path });
    const inbound = (this.graph.inbound.get(r.path) ?? []).length;
    const outbound = (this.graph.outbound.get(r.path) ?? []).length;
    el.createEl("small", {
      cls: "lokf-suggest-meta",
      text: `${r.type ?? "untyped"} · ${r.path} · in ${inbound} / out ${outbound}`,
    });
  }

  onChooseSuggestion(r: ConceptRecord): void {
    const file = this.app.vault.getAbstractFileByPath(r.path);
    if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
  }
}
