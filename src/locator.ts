// locator.ts - map a frontmatter key path to its position in the raw YAML.
//
// Deliberately import-free, like validator.ts: no Obsidian, no YAML parser. It
// scans the raw frontmatter block (the text between the `---` fences, fences
// excluded) as lines of text, so it runs unchanged under Obsidian and under
// plain Node (see scripts/smoke-test.ts). Obsidian's metadataCache exposes only
// the whole `frontmatterPosition`, never a per-key range, so this is the one
// piece of position logic the plugin has to add for inline diagnostics (A) and
// jump-to-line (F5) to know *where* a finding sits.

/**
 * A key's location inside the raw frontmatter block. Lines are 0-based and
 * relative to that block's first line (the line after the opening `---`), so a
 * caller adds 1 to reach the document line. Columns are 0-based character
 * offsets into the line.
 */
export interface FrontmatterKeyLocation {
  line: number;
  /** Column where the key token (or, for a list item, the `-`) begins. */
  keyStart: number;
  /** Column just past the key's colon (or the `-`), for underlining the key. */
  keyEnd: number;
  /** Column where an inline scalar value begins, or -1 when the value is a
   *  mapping/list spread over following lines (nothing to underline here). */
  valueStart: number;
  /** Column just past the inline scalar value (trailing spaces trimmed), or
   *  -1 when there is no inline value. */
  valueEnd: number;
}

type Segment = { kind: "key"; name: string } | { kind: "index"; index: number };

/** Splits `publisher.type`, `fields[0]`, `relations[2].target` into ordered
 *  segments. A bare top-level key (`base_iri`) yields a single key segment. */
function parsePath(keyPath: string): Segment[] {
  const segments: Segment[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(keyPath)) !== null) {
    if (m[2] !== undefined) segments.push({ kind: "index", index: Number(m[2]) });
    else if (m[1]) segments.push({ kind: "key", name: m[1] });
  }
  return segments;
}

/** Count of leading spaces (tabs counted as one each). YAML frontmatter is
 *  space-indented in practice; this only needs to compare relative depths. */
function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === " " || line[n] === "\t")) n++;
  return n;
}

function isBlankOrComment(line: string): boolean {
  const t = line.trim();
  return t === "" || t.startsWith("#");
}

/** Where a scalar value sits on a `key:` line, or a value-less location when
 *  the value carries onto following lines (a nested mapping or list). */
function scalarValueRange(line: string, afterColon: number): { start: number; end: number } {
  let start = afterColon;
  while (start < line.length && (line[start] === " " || line[start] === "\t")) start++;
  // Drop a trailing `#` comment only when it is clearly separated, so a `#`
  // inside a URL fragment or an unquoted value is never mistaken for one.
  let end = line.length;
  const hash = line.indexOf(" #", start);
  if (hash >= 0) end = hash;
  while (end > start && (line[end - 1] === " " || line[end - 1] === "\t")) end--;
  if (start >= end) return { start: -1, end: -1 };
  return { start, end };
}

/**
 * The location of `keyPath` in `raw`, or null when the top-level key is absent.
 *
 * Resolution is best-effort and degrades gracefully: it walks the path segment
 * by segment, narrowing the search window to each container's block, and
 * returns the deepest segment it could resolve. So `relations[2].target` still
 * lands on the `relations` list item when the inline `target:` can't be pinned
 * exactly - good enough to jump the editor to the right neighbourhood, which is
 * all the panel and the underline need.
 */
export function locateFrontmatterKey(raw: string, keyPath: string): FrontmatterKeyLocation | null {
  const segments = parsePath(keyPath);
  if (segments.length === 0) return null;
  const lines = raw.split("\n");

  let lo = 0;
  let hi = lines.length;
  let parentIndent = -1;
  let best: FrontmatterKeyLocation | null = null;

  for (const seg of segments) {
    if (seg.kind === "key") {
      const found = findKey(lines, lo, hi, parentIndent, seg.name);
      if (!found) return best;
      best = found.location;
      lo = found.blockLo;
      hi = found.blockHi;
      parentIndent = found.indent;
    } else {
      const found = findIndex(lines, lo, hi, parentIndent, seg.index);
      if (!found) return best;
      best = found.location;
      lo = found.blockLo;
      hi = found.blockHi;
      parentIndent = found.indent;
    }
  }
  return best;
}

interface Resolved {
  location: FrontmatterKeyLocation;
  indent: number;
  blockLo: number;
  blockHi: number;
}

/** First line in [lo, hi) declaring `name:` at an indent deeper than the
 *  container, plus the block that key owns (until the next line at its indent
 *  or shallower). */
function findKey(lines: string[], lo: number, hi: number, parentIndent: number, name: string): Resolved | null {
  for (let i = lo; i < hi; i++) {
    const line = lines[i] ?? "";
    if (isBlankOrComment(line)) continue;
    const indent = indentOf(line);
    if (indent <= parentIndent) continue;
    const rest = line.slice(indent);
    // Accept `name:` and `name: value`, but not `namespace:` for `name`.
    if (!(rest === `${name}:` || rest.startsWith(`${name}:`) && rest[name.length] === ":")) continue;
    const afterColon = indent + name.length + 1;
    const value = scalarValueRange(line, afterColon);
    const blockHi = blockEnd(lines, i + 1, hi, indent);
    return {
      location: { line: i, keyStart: indent, keyEnd: afterColon, valueStart: value.start, valueEnd: value.end },
      indent,
      blockLo: i + 1,
      blockHi,
    };
  }
  return null;
}

/** The nth (0-based) list item `- ` in [lo, hi) at the shallowest item indent,
 *  plus the block that item owns. The child search that may follow starts *at*
 *  the item line so an inline `- key: value` is still reachable. */
function findIndex(lines: string[], lo: number, hi: number, parentIndent: number, index: number): Resolved | null {
  let itemIndent = -1;
  let count = -1;
  for (let i = lo; i < hi; i++) {
    const line = lines[i] ?? "";
    if (isBlankOrComment(line)) continue;
    const indent = indentOf(line);
    const rest = line.slice(indent);
    const isItem = rest === "-" || rest.startsWith("- ");
    if (!isItem) continue;
    if (itemIndent === -1) {
      if (indent < parentIndent) return null;
      itemIndent = indent;
    }
    if (indent !== itemIndent) continue;
    count++;
    if (count === index) {
      const blockHi = itemEnd(lines, i + 1, hi, itemIndent);
      return {
        location: { line: i, keyStart: indent, keyEnd: indent + 1, valueStart: -1, valueEnd: -1 },
        // Children of the item may sit on this very line (`- target: x`), so
        // the next segment searches from `i`, not `i + 1`.
        indent: itemIndent,
        blockLo: i,
        blockHi,
      };
    }
  }
  return null;
}

/** End (exclusive) of the block a key at `keyIndent` owns: the first later
 *  non-blank line indented no deeper than the key itself. */
function blockEnd(lines: string[], from: number, hi: number, keyIndent: number): number {
  for (let i = from; i < hi; i++) {
    const line = lines[i] ?? "";
    if (isBlankOrComment(line)) continue;
    if (indentOf(line) <= keyIndent) return i;
  }
  return hi;
}

/** End (exclusive) of a list item's block: the next item (or shallower line)
 *  at the item's own indent. */
function itemEnd(lines: string[], from: number, hi: number, itemIndent: number): number {
  for (let i = from; i < hi; i++) {
    const line = lines[i] ?? "";
    if (isBlankOrComment(line)) continue;
    if (indentOf(line) <= itemIndent) return i;
  }
  return hi;
}

/**
 * Absolute character offsets in the full document for a located key: the inline
 * scalar value when there is one, otherwise the key token itself. The raw
 * frontmatter block begins on document line 1 (line 0 is the opening `---`), so
 * the block-relative line is offset by one here. Offsets are clamped to the
 * document length so a caller can hand them straight to an editor range.
 */
export function locationToDocRange(doc: string, loc: FrontmatterKeyLocation): { from: number; to: number } {
  const lineStarts = [0];
  for (let i = 0; i < doc.length; i++) if (doc[i] === "\n") lineStarts.push(i + 1);
  const docLine = loc.line + 1;
  const base = lineStarts[docLine] ?? doc.length;
  const from = base + (loc.valueStart >= 0 ? loc.valueStart : loc.keyStart);
  const to = base + (loc.valueEnd >= 0 ? loc.valueEnd : loc.keyEnd);
  return { from: Math.min(from, doc.length), to: Math.min(to, doc.length) };
}
