// fixes.ts - deterministic, format-preserving quick-fixes for safe findings (E).
//
// Import-free (no Obsidian), like validator.ts/locator.ts, so the fix logic is
// Node-tested. A fix is a targeted text-range edit computed from a finding, its
// key's location (locator.ts), and the parsed value - never a whole-block
// reserialization, so hand-authored formatting and comments survive. Only
// unambiguous, mechanical corrections are offered; a value that encodes an
// owned human decision (a `base_iri` authority, a publisher identity) is never
// guessed.
import { RELATION_FIELDS, splitFrontmatter, type LokfIssue } from "./validator";
import { locateFrontmatterKey, locationToDocRange } from "./locator";
import { LOKF_VOCAB } from "./vocab";

export interface FixEdit {
  from: number;
  to: number;
  text: string;
  label: string;
}

// A normalized alias (or spacing/case variant) -> its canonical class name,
// from the shipped manifest. Empty when the manifest is missing/malformed, so
// alias fixes simply aren't offered (the fallback).
const ALIAS_TO_CANONICAL = new Map<string, string>();
if (LOKF_VOCAB) {
  for (const c of LOKF_VOCAB.classes) {
    ALIAS_TO_CANONICAL.set(normalizeType(c.name), c.name);
    for (const a of c.aliases ?? []) ALIAS_TO_CANONICAL.set(normalizeType(a), c.name);
  }
}

function normalizeType(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function isHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

function lineStarts(doc: string): number[] {
  const starts = [0];
  for (let i = 0; i < doc.length; i++) if (doc[i] === "\n") starts.push(i + 1);
  return starts;
}

/** A single deterministic fix for `issue`, or null when the finding has no
 *  unambiguous mechanical correction (or names an owned value we must not
 *  guess, like base_iri authority). */
export function computeFix(issue: LokfIssue, doc: string, data: Record<string, unknown>): FixEdit | null {
  if (!issue.key) return null;
  const { hasFm, raw } = splitFrontmatter(doc);
  if (!hasFm) return null;
  const loc = locateFrontmatterKey(raw, issue.key);
  if (!loc) return null;

  // base_iri: append the missing terminator to an otherwise-valid http(s) URL.
  // Never touches the authority finding (a different rule) - that needs a human.
  if (issue.rule === "lokf/2-header" && issue.key === "base_iri") {
    const value = data["base_iri"];
    if (typeof value !== "string" || !isHttpUrl(value) || value.endsWith("/") || value.endsWith("#")) return null;
    const { to } = locationToDocRange(doc, loc);
    return { from: to, to, text: "/", label: 'Add trailing "/" to base_iri' };
  }

  // type: replace a known alias (or spacing/case variant) with its canonical class.
  if (issue.rule === "lokf/3-vocab" && issue.key === "type") {
    const value = data["type"];
    if (typeof value !== "string") return null;
    const canonical = ALIAS_TO_CANONICAL.get(normalizeType(value));
    if (!canonical || canonical === value.trim()) return null;
    const { from, to } = locationToDocRange(doc, loc);
    return { from, to, text: canonical, label: `Use "${canonical}"` };
  }

  // A relation field written as a bare scalar -> a one-item YAML list, which the
  // schema requires. The raw value text is preserved verbatim.
  if (issue.rule === "lokf/4-relations" && (RELATION_FIELDS as readonly string[]).includes(issue.key)) {
    if (typeof data[issue.key] !== "string") return null;
    const value = locationToDocRange(doc, loc);
    if (value.to <= value.from) return null;
    const rawValue = doc.slice(value.from, value.to);
    const base = lineStarts(doc)[loc.line + 1] ?? doc.length;
    return { from: base + loc.keyEnd, to: value.to, text: `\n  - ${rawValue}`, label: `Make ${issue.key} a list` };
  }

  return null;
}

/** Every applicable fix for a note's findings, de-duplicated (two findings on
 *  one value can ask for the same edit) and ordered last-edit-first so a caller
 *  can apply them in sequence without offsets shifting. */
export function computeFixes(issues: readonly LokfIssue[], doc: string, data: Record<string, unknown>): FixEdit[] {
  const seen = new Set<string>();
  const edits: FixEdit[] = [];
  for (const issue of issues) {
    const edit = computeFix(issue, doc, data);
    if (!edit) continue;
    const id = `${edit.from}:${edit.to}:${edit.text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edits.push(edit);
  }
  return edits.sort((a, b) => b.from - a.from);
}
