// graph.ts - the bundle as a graph of concepts and their typed relations (C).
//
// Import-free and Node-tested, like validator.ts and locator.ts: the plugin
// resolves each concept's outgoing relation targets to the vault paths of the
// concepts they actually point at (reusing the resolution the rules already
// do), and hands the finished records here. This module is pure aggregation -
// forward and inverse adjacency, grouping by type, and the orphan set - so the
// graph-level questions the per-file rules can't answer (what links to this?
// what is nothing linked to?) have one tested home.

export interface ConceptRecord {
  /** Vault-relative path of the concept note. */
  path: string;
  type: string | null;
  id: string | null;
  /** Vault paths of the other concepts this one links to - already resolved and
   *  filtered to real concepts by the caller (external IRIs, broken links, and
   *  non-concept targets are dropped, so every entry forms a real edge). */
  targets: string[];
}

export interface ConceptGraph {
  records: ConceptRecord[];
  byPath: Map<string, ConceptRecord>;
  /** Concept type (or "(untyped)") -> the concepts of that type. */
  byType: Map<string, ConceptRecord[]>;
  /** Concept path -> the concept paths that link to it. */
  inbound: Map<string, string[]>;
  /** Concept path -> the concept paths it links to (deduped, self-links out). */
  outbound: Map<string, string[]>;
  /** Concepts nothing links to - the graph's roots/islands. */
  orphans: ConceptRecord[];
}

const UNTYPED = "(untyped)";

export function buildConceptGraph(records: ConceptRecord[]): ConceptGraph {
  const byPath = new Map<string, ConceptRecord>();
  const byType = new Map<string, ConceptRecord[]>();
  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();

  for (const r of records) {
    byPath.set(r.path, r);
    inbound.set(r.path, []);
    const key = r.type ?? UNTYPED;
    let group = byType.get(key);
    if (!group) {
      group = [];
      byType.set(key, group);
    }
    group.push(r);
  }

  for (const r of records) {
    const outs: string[] = [];
    const seen = new Set<string>();
    for (const target of r.targets) {
      // A target is only an edge when it names another concept in the graph.
      if (target === r.path || seen.has(target) || !byPath.has(target)) continue;
      seen.add(target);
      outs.push(target);
      inbound.get(target)?.push(r.path);
    }
    outbound.set(r.path, outs);
  }

  const orphans = records.filter((r) => (inbound.get(r.path) ?? []).length === 0);
  return { records, byPath, byType, inbound, outbound, orphans };
}
