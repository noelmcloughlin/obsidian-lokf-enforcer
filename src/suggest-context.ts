// suggest-context.ts - pure frontmatter-completion context detection (D).
//
// Import-free (no Obsidian), like validator.ts/locator.ts/graph.ts, so the
// fiddly YAML-context logic runs and is tested under plain Node
// (scripts/smoke-test.ts). suggest.ts is the Obsidian adapter that wraps these
// around an Editor.
import { RELATION_FIELDS } from "./validator";

export type SuggestKind = "type" | "genre" | "status" | "predicate" | "target";

export type LineReader = (i: number) => string;

export interface SuggestContext {
  kind: SuggestKind;
  query: string;
  startCh: number;
}

const RELATION_FIELD_SET = new Set<string>(RELATION_FIELDS);

/** Which completion, if any, a frontmatter key's value takes. A relation field
 *  (or a `relations` item's `target`) completes concept targets; `predicate`
 *  completes the RelationType vocabulary. */
export function kindForKey(key: string): SuggestKind | null {
  if (key === "type") return "type";
  if (key === "genre") return "genre";
  if (key === "status") return "status";
  if (key === "predicate") return "predicate";
  if (key === "target") return "target";
  return RELATION_FIELD_SET.has(key) ? "target" : null;
}

/** True when `line` sits inside the note's opening `---` … `---` frontmatter
 *  block (fences excluded). Raw-text editing only - in Live Preview the
 *  frontmatter is a Properties widget, not editable lines. */
export function withinFrontmatter(getLine: LineReader, lineCount: number, line: number): boolean {
  if (line <= 0 || getLine(0) !== "---") return false;
  for (let i = 1; i < lineCount; i++) {
    if (getLine(i) === "---") return line < i;
  }
  return false;
}

/** The key a list item belongs to: the nearest line above it that is shallower
 *  and declares a `key:`. */
function enclosingKey(getLine: LineReader, fromLine: number, childIndent: number): string | null {
  for (let i = fromLine - 1; i >= 1; i--) {
    const line = getLine(i);
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent >= childIndent) continue;
    const m = line.match(/^\s*([A-Za-z_][\w-]*)\s*:/);
    return m ? (m[1] ?? null) : null;
  }
  return null;
}

/** What (if anything) the cursor is completing on its current line: an inline
 *  `key: value`, or a `- value` list item whose parent key is a relation
 *  field. Returns null when the position is not a LOKF value slot. */
export function detectSuggestContext(getLine: LineReader, line: number, ch: number): SuggestContext | null {
  const before = getLine(line).slice(0, ch);

  const inline = before.match(/^(\s*)([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
  if (inline) {
    const kind = kindForKey(inline[2] ?? "");
    if (!kind) return null;
    const query = inline[3] ?? "";
    return { kind, query, startCh: ch - query.length };
  }

  const item = before.match(/^(\s*)-\s+(.*)$/);
  if (item) {
    const parent = enclosingKey(getLine, line, (item[1] ?? "").length);
    if (!parent || kindForKey(parent) !== "target") return null;
    const query = item[2] ?? "";
    return { kind: "target", query, startCh: ch - query.length };
  }

  return null;
}
