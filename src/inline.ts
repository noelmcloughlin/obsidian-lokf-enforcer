// inline.ts - CodeMirror 6 editor extension that underlines offending
// frontmatter inline, with the finding text on hover. This is the live,
// in-editor counterpart to the side report: the value the rules objected to is
// marked where the author is actually typing, instead of only in a panel they
// have to remember to open.
//
// The rule engine (validator.ts) and the key locator (locator.ts) stay
// import-free and Node-tested; this file is the thin editor layer that maps
// their findings onto CodeMirror decorations.
import { TFile, editorInfoField } from "obsidian";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { splitFrontmatter, type LokfIssue, type LokfSeverity } from "./validator";
import { locateFrontmatterKey, locationToDocRange } from "./locator";

/** The narrow slice of the plugin the editor extension needs, so this file
 *  never reaches into the whole plugin object. */
export interface InlineHost {
  inlineDiagnosticsEnabled(): boolean;
  /** Synchronous LOKF findings for `file` given the editor's current text, or
   *  null when the file is outside every configured bundle (nothing to mark). */
  inlineIssuesFor(file: TFile, doc: string): LokfIssue[] | null;
}

interface Span {
  from: number;
  to: number;
  severity: LokfSeverity;
  message: string;
}

/** Maps findings that name a key onto document ranges, merging any that land on
 *  the exact same range into one marker (two rules objecting to one value read
 *  as one underline with both messages), and returns them in the ascending
 *  order a RangeSetBuilder requires. */
function buildSpans(doc: string, issues: readonly LokfIssue[]): Span[] {
  const { hasFm, raw } = splitFrontmatter(doc);
  if (!hasFm) return [];
  const merged = new Map<string, Span>();
  for (const issue of issues) {
    if (!issue.key) continue;
    const loc = locateFrontmatterKey(raw, issue.key);
    if (!loc) continue;
    const { from, to } = locationToDocRange(doc, loc);
    if (to <= from) continue;
    const id = `${from}:${to}`;
    const existing = merged.get(id);
    if (existing) {
      existing.message += `\n${issue.message}`;
      if (issue.severity === "error") existing.severity = "error";
    } else {
      merged.set(id, { from, to, severity: issue.severity, message: issue.message });
    }
  }
  return [...merged.values()].sort((a, b) => a.from - b.from || a.to - b.to);
}

export function lokfInlineExtension(host: InlineHost) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.compute(view);
      }

      update(update: ViewUpdate) {
        // Decorations depend only on the document and which file it is, so a
        // plain cursor move doesn't rebuild them - just an edit, or switching
        // the note shown in this same editor.
        const before = update.startState.field(editorInfoField, false)?.file ?? null;
        const after = update.state.field(editorInfoField, false)?.file ?? null;
        if (update.docChanged || before !== after) {
          this.decorations = this.compute(update.view);
        }
      }

      private compute(view: EditorView): DecorationSet {
        if (!host.inlineDiagnosticsEnabled()) return Decoration.none;
        const file = view.state.field(editorInfoField, false)?.file ?? null;
        if (!(file instanceof TFile)) return Decoration.none;
        const doc = view.state.doc.toString();
        const issues = host.inlineIssuesFor(file, doc);
        if (!issues || issues.length === 0) return Decoration.none;
        const builder = new RangeSetBuilder<Decoration>();
        for (const span of buildSpans(doc, issues)) {
          builder.add(
            span.from,
            span.to,
            Decoration.mark({
              class: `lokf-diag lokf-diag-${span.severity}`,
              attributes: { title: span.message },
            })
          );
        }
        return builder.finish();
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
}
