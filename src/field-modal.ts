// field-modal.ts - a keyboard-first, read-only reference for the LOKF
// frontmatter fields.
//
// Obsidian's Properties widget has no API for per-property descriptions, so this
// SuggestModal is the surface: search a field by name or meaning and read what
// it expects. Read-only by design - selecting a field just dismisses it, so the
// reference never writes into a note.
import { App, SuggestModal } from "obsidian";
import type { FieldDoc } from "./fields";

export class FieldReferenceModal extends SuggestModal<FieldDoc> {
  private items: readonly FieldDoc[];

  constructor(app: App, items: readonly FieldDoc[]) {
    super(app);
    this.items = items;
    this.setPlaceholder("Look up a LOKF field by name or meaning");
  }

  getSuggestions(query: string): FieldDoc[] {
    const q = query.toLowerCase().trim();
    const all = [...this.items];
    if (!q) return all;
    return all.filter((f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q));
  }

  renderSuggestion(f: FieldDoc, el: HTMLElement): void {
    el.createDiv({ cls: "lokf-suggest-title", text: f.name });
    el.createEl("small", { cls: "lokf-suggest-meta", text: f.description });
  }

  onChooseSuggestion(): void {
    // Read-only: a reference never writes into a note, so a selection just
    // dismisses the modal.
  }
}
