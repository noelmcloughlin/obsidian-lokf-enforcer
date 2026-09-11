// report-filter.ts - the report panel's finding filter (F).
//
// Import-free (no Obsidian), so the match predicate is Node-tested; both the
// panel (report-view.ts) and the findings quick-switcher (finding-modal.ts)
// narrow through it, sharing one definition of what a query matches.

export interface FilterableIssue {
  severity: string;
  rule: string;
  message: string;
  key?: string;
}

/** One finding matches a query when every whitespace-separated term matches: a
 *  `sev:` term against the severity and a `rule:` term against the rule id, and
 *  everything else as a substring across the path, rule, message, and key. An
 *  empty query matches everything. */
export function issueMatchesFilter(path: string, issue: FilterableIssue, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${path} ${issue.rule} ${issue.message} ${issue.key ?? ""}`.toLowerCase();
  return terms.every((term) => {
    if (term.startsWith("sev:")) {
      const want = term.slice(4);
      return !want || issue.severity.toLowerCase().startsWith(want);
    }
    if (term.startsWith("rule:")) {
      const want = term.slice(5);
      return !want || issue.rule.toLowerCase().includes(want);
    }
    return haystack.includes(term);
  });
}

/** The top-level frontmatter key a finding's key path belongs to, for grouping
 *  a file's findings in the report: `publisher.type` -> `publisher`,
 *  `relations[2].target` -> `relations`. Empty (a whole-note finding) -> "". */
export function topLevelKey(key: string | undefined): string {
  if (!key) return "";
  const match = key.match(/^[^.[]+/);
  return match ? match[0] : key;
}
