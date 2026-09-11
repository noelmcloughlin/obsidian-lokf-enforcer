// vocab.ts - load the shipped vocabulary manifest, with fallback (§9.2).
//
// The manifest (src/lokf-vocab.json) is derived at build time from a pinned
// lokf.yaml by scripts/build-vocab.mjs and bundled as static data. This module
// reads it and derives the plugin's default vocabulary from it, falling back to
// validator.ts's hard-coded constants for any field that is missing or
// malformed - LOKF's permissive stance already requires tolerating unknowns, so
// a bad manifest degrades to today's behaviour rather than breaking. validator.ts
// stays import-free: the effective vocabulary reaches the rules through
// `settings`, exactly like every other tunable.
import lokfVocab from "./lokf-vocab.json";
import {
  DEFAULT_SETTINGS,
  KNOWN_LOKF_TYPES,
  DEFAULT_KNOWN_PREDICATES,
  DEFAULT_GENRE_VALUES,
  DEFAULT_CONCEPT_STATUSES,
  type LokfSettings,
} from "./validator";

export interface VocabClass {
  name: string;
  aliases?: string[];
}

export interface VocabGenre {
  value: string;
  aliases?: string[];
  notes?: string;
}

export interface LokfVocabManifest {
  schemaVersion: string;
  classes: VocabClass[];
  relationTypes: string[];
  genres: VocabGenre[];
  fieldTypes: string[];
  conceptStatuses: string[];
  subsets: string[];
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
}

function classNames(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names: string[] = [];
  for (const c of value) {
    const name = (c as { name?: unknown })?.name;
    if (typeof name !== "string") return null;
    names.push(name);
  }
  return names;
}

function genreValues(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values: string[] = [];
  for (const g of value) {
    const v = (g as { value?: unknown })?.value;
    if (typeof v !== "string") return null;
    values.push(v);
  }
  return values;
}

const raw = lokfVocab as Partial<LokfVocabManifest>;

/** The pinned schema the shipped vocabulary was derived from, for the settings
 *  tab to cite ("as of LOKF schema 0.7.0"); empty when the manifest is bad. */
export const SCHEMA_VERSION: string =
  typeof raw.schemaVersion === "string" && raw.schemaVersion ? raw.schemaVersion : "";

/** The full manifest when it validates, for future richer consumers (hover
 *  descriptions, autocomplete aliases/notes); null when it is malformed. */
export const LOKF_VOCAB: LokfVocabManifest | null =
  classNames(raw.classes) &&
  stringArray(raw.relationTypes) &&
  genreValues(raw.genres) &&
  stringArray(raw.fieldTypes) &&
  stringArray(raw.conceptStatuses) &&
  stringArray(raw.subsets)
    ? (raw as LokfVocabManifest)
    : null;

/** The hard-coded vocabulary, exposed so callers can tell a list left at the
 *  previous built-in default (safe to refresh to the pinned schema) from one a
 *  user actually customised (must be preserved). */
export const HARDCODED_VOCAB = {
  knownTypes: KNOWN_LOKF_TYPES,
  knownPredicates: DEFAULT_KNOWN_PREDICATES,
  genreValues: DEFAULT_GENRE_VALUES,
  conceptStatuses: DEFAULT_CONCEPT_STATUSES,
} as const;

/** The plugin's runtime defaults: validator.ts's, with the vocabulary lists
 *  refreshed from the pinned schema manifest where it is well-formed. */
export function pluginDefaultSettings(): LokfSettings {
  return {
    ...DEFAULT_SETTINGS,
    knownTypes: classNames(raw.classes) ?? DEFAULT_SETTINGS.knownTypes,
    knownPredicates: stringArray(raw.relationTypes) ?? DEFAULT_SETTINGS.knownPredicates,
    genreValues: genreValues(raw.genres) ?? DEFAULT_SETTINGS.genreValues,
    conceptStatuses: stringArray(raw.conceptStatuses) ?? DEFAULT_SETTINGS.conceptStatuses,
  };
}
