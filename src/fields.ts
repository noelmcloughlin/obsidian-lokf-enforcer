// fields.ts - a plain-language reference for the LOKF frontmatter fields, so a
// user unsure what a property means can look it up in the editor. The schema is
// the single source of truth for what each field means: the descriptions come
// straight from its slot definitions via the vocabulary manifest
// (src/lokf-vocab.json, which build-vocab.mjs fills from `lokf vocab --all
// --json`, or lokf.yaml). This module only decides which fields to surface and
// in what order (FIELD_ORDER), so the wording never forks from the schema; the
// smoke test asserts every name here is a real schema slot and that each
// description stays short enough for the modal. Import-free (of Obsidian) and
// Node-tested; field-modal.ts renders it, and there is no Obsidian API to attach
// these to the native Properties widget, so a searchable command is the surface.
import lokfVocab from "./lokf-vocab.json";

export interface FieldDoc {
  name: string;
  description: string;
}

// The frontmatter fields worth surfacing, in reading order (bundle header,
// concept, lifecycle, trust/provenance, relations, data). The schema describes
// many more structural slots; this is the user-facing subset. Membership and
// order are the only editorial choices here - the wording is the schema's.
export const FIELD_ORDER = [
  "lokf_version", "base_iri", "context", "title", "description", "license", "publisher",
  "type", "id", "genre", "status", "stale_after",
  "verified", "generated", "sources",
  "relations", "predicate", "target", "distribution", "fields", "resource",
];

interface ManifestSlot {
  name: string;
  description: string;
}

/** Build the field reference from the schema manifest: each FIELD_ORDER slot
 *  paired with its schema description, in order. A field the manifest doesn't
 *  describe is dropped - the smoke-test drift guard then fails, catching a
 *  schema rename. Exported for the smoke test. */
export function resolveFieldDocs(slots: ManifestSlot[] | undefined): FieldDoc[] {
  const bySchema = new Map((slots ?? []).map((s) => [s.name, s.description]));
  const out: FieldDoc[] = [];
  for (const name of FIELD_ORDER) {
    const description = bySchema.get(name);
    if (description) out.push({ name, description });
  }
  return out;
}

export const LOKF_FIELD_DOCS: readonly FieldDoc[] = resolveFieldDocs(
  (lokfVocab as { slots?: ManifestSlot[] }).slots
);
