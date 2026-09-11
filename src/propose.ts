// propose.ts - infer typed relations from a concept's body links (§9.4),
// modelled on lokf's `lokf propose` (src/lokf/propose.py). Concept prose often
// links to other concepts without asserting the relationship in frontmatter;
// this extracts those links, classifies each against a cue-phrase table, and
// returns proposals for the note's owner to accept. Import-free (no Obsidian),
// so the heuristic is Node-tested - link resolution and the frontmatter write
// live in main.ts / propose-modal.ts, exactly where an owned decision belongs.

export interface BodyLink {
  text: string;
  targetRaw: string;
  sentence: string;
}

export interface Proposal {
  text: string;
  targetRaw: string;
  targetPath: string; // resolved concept vault path (dedup + write)
  targetBundle: string; // bundle-relative, no extension - the value written to frontmatter
  predicate: string;
  confidence: number;
  rationale: string;
}

// Markdown inline link [text](target); group 1 captures a leading `!` so images
// can be skipped in code (a lookbehind would be simpler but isn't allowed on
// older iOS). The target is angle-bracketed (group 3, may contain spaces) or
// bare (group 4); an optional quoted title is matched but excluded.
const LINK_PATTERN =
  "(!?)\\[([^\\]]+)\\]\\(\\s*(?:<([^<>\\n]*)>|([^)\\s]+))(?:\\s+(?:\"[^\"]*\"|'[^']*'))?\\s*\\)";
const SENTENCE_SPLIT_RE = /[.!?]\s+/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;

// Cue-phrase heuristics, in match-priority order: [regex, relation, base
// confidence]. The first row whose regex matches the link's sentence wins;
// adjacency of the cue to the link text adds ADJACENCY_BOOST.
const CUE_TABLE: readonly (readonly [RegExp, string, number])[] = [
  [/\bsame as\b|\balias(?:es)?\b/i, "sameAs", 0.8],
  [/\bderived\b|\bcomputed\b|\bbuilt from\b/i, "derivedFrom", 0.75],
  [/\bpart of\b|\bwithin\b/i, "isPartOf", 0.75],
  [/\bcontains?\b|\bincludes?\b|\bincluding\b/i, "hasPart", 0.7],
  [/\bdepends?\b|\brequires?\b|\bneeds?\b/i, "dependsOn", 0.7],
  [/\bdefined by\b|\bdefinitions?\b/i, "definedBy", 0.7],
  [/\bmeasures?\b|\bcounts?\b/i, "measures", 0.7],
  [/\bjoins? with\b|\bjoined (?:on|with)\b/i, "joinsWith", 0.7],
  [/\battributed to\b|\bauthored by\b|\bwritten by\b|\bmaintained by\b/i, "wasAttributedTo", 0.7],
  [/\babout\b|\bcovers?\b|\bdescribes?\b/i, "about", 0.6],
  [/\bsee\b|\brefer(?:s|ence)?\b|\bused by\b/i, "references", 0.55],
  [/\bsource\b|\bfrom\b/i, "source", 0.5],
];
const FALLBACK: readonly [string, number] = ["relatedTo", 0.25];
const ADJACENCY_BOOST = 0.15;
const ADJACENCY_GAP = 24; // max chars between cue and link text to count as adjacent
const CONFIDENCE_CAP = 0.95;

function blank(line: string): string {
  return " ".repeat(line.length);
}

/** Blank out fenced code blocks and inline code spans, preserving every offset
 *  so link and sentence positions still line up with the original body. */
function maskCode(text: string): string {
  const lines = text.split("\n");
  let fence: string | null = null;
  const out: string[] = [];
  for (const line of lines) {
    const stripped = line.replace(/^[ \t]+/, "");
    const marker = stripped.slice(0, 3);
    if (fence === null && (marker === "```" || marker === "~~~")) {
      fence = marker;
      out.push(blank(line));
      continue;
    } else if (fence !== null) {
      if (stripped.startsWith(fence)) fence = null;
      out.push(blank(line));
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(INLINE_CODE_RE, (m) => " ".repeat(m.length));
}

/** The prose sentence (link markup flattened to its text) around offset `pos`. */
function sentenceAt(text: string, pos: number): string {
  const prevBreak = text.slice(0, pos).lastIndexOf("\n\n");
  const paraStart = prevBreak !== -1 ? prevBreak + 2 : 0;
  let paraEnd = text.indexOf("\n\n", pos);
  if (paraEnd === -1) paraEnd = text.length;
  let start = paraStart;
  let end = paraEnd;
  const rel = pos - paraStart;
  const para = text.slice(paraStart, paraEnd);
  const splitter = new RegExp(SENTENCE_SPLIT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = splitter.exec(para)) !== null) {
    const wsStart = m.index + 1; // right after the . ! ?
    const wsEnd = m.index + m[0].length; // end of the whitespace run
    if (wsEnd <= rel) start = paraStart + wsEnd;
    else if (wsStart >= rel) {
      end = paraStart + wsStart;
      break;
    }
  }
  const flattened = text
    .slice(start, end)
    .replace(new RegExp(LINK_PATTERN, "g"), (full: string, bang: string, txt: string) => (bang === "!" ? full : txt));
  return flattened.split(/\s+/).filter(Boolean).join(" ");
}

function linkTarget(m: RegExpExecArray): string {
  return m[3] === undefined ? m[4] ?? "" : m[3];
}

/** Every markdown prose link in a concept body, with the sentence around it.
 *  Links inside code blocks or inline code spans are excluded. */
export function extractBodyLinks(body: string): BodyLink[] {
  const masked = maskCode(body);
  const re = new RegExp(LINK_PATTERN, "g");
  const links: BodyLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    if (m[1] === "!") continue; // an image, not a link
    links.push({ text: m[2] ?? "", targetRaw: linkTarget(m), sentence: sentenceAt(masked, m.index) });
  }
  return links;
}

/** Whether the cue match sits next to (or inside) the link text. */
function adjacent(sentence: string, linkText: string, cueStart: number, cueEnd: number): boolean {
  const text = linkText.split(/\s+/).filter(Boolean).join(" ");
  const linkStart = sentence.indexOf(text);
  if (linkStart === -1) return false;
  const linkEnd = linkStart + text.length;
  return cueStart < linkEnd + ADJACENCY_GAP && cueEnd > linkStart - ADJACENCY_GAP;
}

/** Pick a relation for one link from the cue table; falls back to relatedTo. */
export function classifyLink(
  sentence: string,
  linkText: string
): { predicate: string; confidence: number; rationale: string } {
  for (const [pattern, name, confidence] of CUE_TABLE) {
    const match = new RegExp(pattern.source, pattern.flags).exec(sentence);
    if (match === null) continue;
    const boosted = adjacent(sentence, linkText, match.index, match.index + match[0].length);
    return {
      predicate: name,
      confidence: Math.min(confidence + (boosted ? ADJACENCY_BOOST : 0), CONFIDENCE_CAP),
      rationale: `cue "${match[0].toLowerCase()}" ${boosted ? "adjacent to link" : "in sentence"}`,
    };
  }
  return { predicate: FALLBACK[0], confidence: FALLBACK[1], rationale: "no cue phrase matched" };
}

/** Classified, de-duplicated proposals for links that resolve to a concept and
 *  aren't already asserted in frontmatter, most-confident first. `resolve` and
 *  `isAsserted` are injected so this stays import-free and Node-testable. */
export function buildProposals(
  links: readonly BodyLink[],
  resolve: (targetRaw: string) => { path: string; bundle: string } | null,
  isAsserted: (path: string) => boolean
): Proposal[] {
  const seen = new Set<string>();
  const out: Proposal[] = [];
  for (const link of links) {
    const target = resolve(link.targetRaw);
    if (!target || isAsserted(target.path)) continue;
    const { predicate, confidence, rationale } = classifyLink(link.sentence, link.text);
    const id = `${predicate}::${target.path}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      text: link.text,
      targetRaw: link.targetRaw,
      targetPath: target.path,
      targetBundle: target.bundle,
      predicate,
      confidence,
      rationale,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
