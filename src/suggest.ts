// suggest.ts - LOKF-aware value completions while editing frontmatter (D).
//
// An EditorSuggest that fires only inside a concept's frontmatter block and
// offers the values LOKF knows: class names for `type`, the Diataxis `genre`
// values, lifecycle `status` values, relation predicates, and - highest value -
// the other concepts a relation can point at (from the graph index, C). It
// deliberately never suggests key names, to avoid a second popup next to
// Obsidian's own Properties autocomplete.
//
// The context detection lives in suggest-context.ts (pure, Node-tested); this
// file is the thin Obsidian adapter over an Editor.
import {
  App,
  EditorSuggest,
  TFile,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
} from "obsidian";
import { LOKF_VOCAB } from "./vocab";
import { detectSuggestContext, withinFrontmatter, type LineReader, type SuggestKind } from "./suggest-context";

export interface LokfSuggestion {
  value: string;
  detail?: string;
}

/** The lists a concept's frontmatter can complete against, from settings (so a
 *  user's customised vocabulary is honoured), or null when the file is not a
 *  concept in a configured bundle. */
export interface SuggestVocabulary {
  types: string[];
  genres: string[];
  statuses: string[];
  predicates: string[];
}

export interface SuggestHost {
  suggestEnabled(): boolean;
  suggestVocabularyFor(file: TFile): SuggestVocabulary | null;
  /** Bundle-relative paths (no extension) of the other concepts in this file's
   *  bundle - the resolvable targets a relation can name. */
  conceptTargets(file: TFile): string[];
}

// Manifest-sourced detail shown beside a suggestion (aliases for a class, the
// Diataxis note for a genre). Absent when the manifest is missing/malformed.
const CLASS_ALIASES = new Map<string, string[]>();
const GENRE_DETAIL = new Map<string, string>();
if (LOKF_VOCAB) {
  for (const c of LOKF_VOCAB.classes) {
    if (c.aliases && c.aliases.length) CLASS_ALIASES.set(c.name, c.aliases);
  }
  for (const g of LOKF_VOCAB.genres) {
    const parts = [g.aliases && g.aliases.length ? g.aliases.join(", ") : "", g.notes ?? ""].filter(Boolean);
    if (parts.length) GENRE_DETAIL.set(g.value, parts.join(" — "));
  }
}

function rank(value: string, query: string): number {
  return value.toLowerCase().startsWith(query) ? 0 : 1;
}

export class LokfSuggest extends EditorSuggest<LokfSuggestion> {
  private host: SuggestHost;
  private kind: SuggestKind = "type";

  constructor(app: App, host: SuggestHost) {
    super(app);
    this.host = host;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!file || !this.host.suggestEnabled()) return null;
    if (!this.host.suggestVocabularyFor(file)) return null;
    const getLine: LineReader = (i) => editor.getLine(i);
    if (!withinFrontmatter(getLine, editor.lineCount(), cursor.line)) return null;
    const ctx = detectSuggestContext(getLine, cursor.line, cursor.ch);
    if (!ctx) return null;
    this.kind = ctx.kind;
    return { start: { line: cursor.line, ch: ctx.startCh }, end: cursor, query: ctx.query };
  }

  getSuggestions(context: EditorSuggestContext): LokfSuggestion[] {
    const file = context.file;
    if (!file) return [];
    const vocab = this.host.suggestVocabularyFor(file);
    if (!vocab) return [];
    let items: LokfSuggestion[];
    switch (this.kind) {
      case "type":
        items = vocab.types.map((t) => ({ value: t, detail: CLASS_ALIASES.get(t)?.join(", ") }));
        break;
      case "genre":
        items = vocab.genres.map((g) => ({ value: g, detail: GENRE_DETAIL.get(g) }));
        break;
      case "status":
        items = vocab.statuses.map((s) => ({ value: s }));
        break;
      case "predicate":
        items = vocab.predicates.map((p) => ({ value: p }));
        break;
      case "target":
        items = this.host.conceptTargets(file).map((p) => ({ value: p }));
        break;
    }
    const q = context.query.toLowerCase();
    return items
      .filter((i) => i.value.toLowerCase().includes(q))
      .sort((a, b) => rank(a.value, q) - rank(b.value, q) || a.value.localeCompare(b.value))
      .slice(0, 50);
  }

  renderSuggestion(item: LokfSuggestion, el: HTMLElement): void {
    el.createDiv({ text: item.value });
    if (item.detail) el.createEl("small", { cls: "lokf-suggest-meta", text: item.detail });
  }

  selectSuggestion(item: LokfSuggestion): void {
    const ctx = this.context;
    if (!ctx) return;
    ctx.editor.replaceRange(item.value, ctx.start, ctx.end);
    ctx.editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + item.value.length });
    this.close();
  }
}
