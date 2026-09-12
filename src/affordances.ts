// affordances.ts - project a bundle's LOKF facts into Obsidian-native
// conventions (opt-in, reversible). Import-free and Node-tested: callers hand in
// already-resolved inputs (the Obsidian link text is computed in main.ts) and
// this returns the managed-block content and the document to write. This is a
// one-way PROJECTION - it never touches LOKF frontmatter, only adds Obsidian
// affordances a non-Obsidian consumer can ignore: a per-concept block carrying a
// Diátaxis `#genre` tag and a "Related" wikilink list (so `genre` groups in the
// tag pane and typed relations light up the graph and backlinks), and a bundle
// Diátaxis map (so the `genre` facet becomes a Map of Content). Each block is
// marker-delimited, so a re-run regenerates it in place rather than appending,
// and human prose around it is never disturbed.

export interface RelatedLink {
  predicate: string;
  /** Obsidian shortest link text for the target concept (from main.ts). */
  linktext: string;
}

export interface DiataxisEntry {
  /** Canonical LOKF genre: tutorial | how-to | reference | explanation. */
  genre: string;
  linktext: string;
}

const RELATED_START = "<!-- lokf:related -->";
const RELATED_END = "<!-- /lokf:related -->";
const DIATAXIS_START = "<!-- lokf:diataxis -->";
const DIATAXIS_END = "<!-- /lokf:diataxis -->";

// The Diátaxis quadrants in canonical reading order, each paired with the
// heading it maps to. `genre` values are the LOKF schema's own.
const DIATAXIS_SECTIONS: readonly (readonly [string, string])[] = [
  ["tutorial", "Tutorials"],
  ["how-to", "How-to guides"],
  ["reference", "Reference"],
  ["explanation", "Explanation"],
];

// Only a canonical Diátaxis genre earns a `#genre` tag; a non-canonical value is
// left untagged (the validator already warns on it) so a typo never mints a tag.
const DIATAXIS_GENRES = new Set(["tutorial", "how-to", "reference", "explanation"]);

function dedupeSort<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  out.sort((a, b) => key(a).localeCompare(key(b)));
  return out;
}

/** The managed per-concept block (markers included): an optional Diátaxis
 *  `#genre` tag then a "Related" wikilink list. Null when the concept has
 *  neither a canonical genre nor a resolvable relation to project. */
export function buildConceptBlock(links: RelatedLink[], genre: string | null): string | null {
  const unique = dedupeSort(links, (l) => `${l.predicate}\u0000${l.linktext}`);
  const tag = genre && DIATAXIS_GENRES.has(genre) ? `#${genre}` : null;
  if (unique.length === 0 && !tag) return null;
  const middle: string[] = [];
  if (tag) middle.push(tag);
  if (unique.length > 0) {
    middle.push(`## Related\n\n${unique.map((l) => `- [[${l.linktext}]] (${l.predicate})`).join("\n")}`);
  }
  return `${RELATED_START}\n${middle.join("\n\n")}\n${RELATED_END}`;
}

/** The managed Diátaxis map block (markers included). Always lists all four
 *  quadrants so the gaps are visible; an empty one reads "_No concepts yet._". */
export function buildDiataxisBlock(entries: DiataxisEntry[]): string {
  const sections = DIATAXIS_SECTIONS.map(([genre, heading]) => {
    const here = dedupeSort(
      entries.filter((e) => e.genre === genre),
      (e) => e.linktext
    );
    const body = here.length === 0 ? "_No concepts yet._" : here.map((e) => `- [[${e.linktext}]]`).join("\n");
    return `## ${heading}\n\n${body}`;
  });
  return `${DIATAXIS_START}\n${sections.join("\n\n")}\n${DIATAXIS_END}`;
}

/** Replace a marker-delimited block in place, append it, or (when `block` is
 *  null) remove an existing one. Returns the new document, or null when nothing
 *  would change. Marker lookup is plain string search - no regex, so a stray
 *  bracket in a target name can never break it. */
function spliceBlock(doc: string, start: string, end: string, block: string | null): string | null {
  const s = doc.indexOf(start);
  if (s !== -1) {
    const e = doc.indexOf(end, s + start.length);
    if (e !== -1) {
      const endPos = e + end.length;
      if (block === null) {
        const before = doc.slice(0, s).replace(/\s+$/, "");
        const after = doc.slice(endPos).replace(/^\s+/, "");
        const joined = !before ? after : !after ? before : `${before}\n\n${after}`;
        return joined === doc ? null : joined;
      }
      const next = doc.slice(0, s) + block + doc.slice(endPos);
      return next === doc ? null : next;
    }
  }
  if (block === null) return null;
  const trimmed = doc.replace(/\s+$/, "");
  const next = trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
  return next === doc ? null : next;
}

/** Update a concept's managed block from its Diátaxis genre and typed relations.
 *  Returns the new document, or null when it already matches (idempotent). */
export function applyConceptBlock(doc: string, links: RelatedLink[], genre: string | null): string | null {
  return spliceBlock(doc, RELATED_START, RELATED_END, buildConceptBlock(links, genre));
}

/** Update a note's managed Diátaxis map block. Returns the new document, or null
 *  when it already matches. */
export function applyDiataxisBlock(doc: string, entries: DiataxisEntry[]): string | null {
  return spliceBlock(doc, DIATAXIS_START, DIATAXIS_END, buildDiataxisBlock(entries));
}

/** The full body of a freshly created Diátaxis map note - a human-owned title
 *  above the managed block, so a later re-run refreshes only the block. */
export function newDiataxisNote(entries: DiataxisEntry[]): string {
  return `# Diátaxis map\n\n${buildDiataxisBlock(entries)}\n`;
}
