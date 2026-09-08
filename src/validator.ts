// validator.ts - the LOKF semantic-layer rules.
//
// Deliberately import-free: no Obsidian, no YAML parser. Callers hand in
// already-parsed frontmatter, so this module runs unchanged under Obsidian and
// under plain Node (see scripts/smoke-test.ts). Everything OKF v0.2 already
// covers - required `type`, provenance/trust/lifecycle, Attested Computation,
// index.md/log.md structure - is deliberately NOT re-implemented here; that is
// the installed OKF validator's job.

export type LokfSeverity = "error" | "warning";

export interface LokfIssue {
  severity: LokfSeverity;
  rule: string;
  message: string;
}

export interface LokfSettings {
  knownTypes: string[];
  warnUnknownType: boolean;
  genreValues: string[];
  warnTypeSpecificFields: boolean;
  knownPredicates: string[];
  warnUnknownPredicate: boolean;
  authorityDenylist: string[];
  placeholderDomains: string[];
  warnMissingHeader: boolean;
  checkRelationTargets: boolean;
  excludeFolders: string[];
  batchSize: number;
  recommendSiblingPlugin: boolean;
}

export const KNOWN_LOKF_TYPES = [
  "Dataset",
  "Table",
  "Metric",
  "Service",
  "Playbook",
  "Tutorial",
  "Explanation",
  "Policy",
  "GlossaryTerm",
  "Reference",
  "Document",
  "Person",
  "Organization",
  "AttestedComputation",
];

export const KNOWN_LOKF_VERSIONS = ["0.1", "0.2"];

export const DEFAULT_GENRE_VALUES = ["tutorial", "how-to", "reference", "explanation"];

export const RELATION_FIELDS = [
  "isPartOf",
  "hasPart",
  "references",
  "dependsOn",
  "derivedFrom",
  "about",
  "sameAs",
  "relatedTo",
  "definedBy",
  "source",
] as const;

// The fixed predicates above, plus the documented example of one outside that
// set. The full RelationType vocabulary lives in the LOKF schema, so the check
// that uses this list is off by default rather than guessing at completeness.
export const DEFAULT_KNOWN_PREDICATES = [...RELATION_FIELDS, "joinsWith"];

export const DEFAULT_AUTHORITY_DENYLIST = [
  "github.com",
  "githubusercontent.com",
  "gitlab.com",
  "bitbucket.org",
  "sourceforge.net",
  "npmjs.com",
  "pypi.org",
];

// RFC 2606 reserved domains, matched as suffixes below.
export const DEFAULT_PLACEHOLDER_DOMAINS = ["example.com", "example.org", "example.net", "example"];

export const DEFAULT_SETTINGS: LokfSettings = {
  knownTypes: KNOWN_LOKF_TYPES,
  warnUnknownType: true,
  genreValues: DEFAULT_GENRE_VALUES,
  warnTypeSpecificFields: true,
  knownPredicates: DEFAULT_KNOWN_PREDICATES,
  warnUnknownPredicate: false,
  authorityDenylist: DEFAULT_AUTHORITY_DENYLIST,
  placeholderDomains: DEFAULT_PLACEHOLDER_DOMAINS,
  warnMissingHeader: true,
  checkRelationTargets: true,
  excludeFolders: [],
  batchSize: 50,
  recommendSiblingPlugin: true,
};

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export function isReserved(path: string): "index" | "log" | null {
  const f = (path.split("/").pop() || "").toLowerCase();
  if (f === "index.md") return "index";
  if (f === "log.md") return "log";
  return null;
}

export function isExcluded(path: string, settings: LokfSettings): boolean {
  return settings.excludeFolders.some(
    (folder) => folder && (path === folder || path.startsWith(folder + "/"))
  );
}

export function splitFrontmatter(content: string): { hasFm: boolean; raw: string; body: string } {
  const m = content.match(FM_RE);
  if (!m) return { hasFm: false, raw: "", body: content };
  return { hasFm: true, raw: m[1] ?? "", body: content.slice(m[0].length) };
}

export function readBaseIri(data: Record<string, unknown>): string | null {
  const v = data["base_iri"];
  return typeof v === "string" && v ? v : null;
}

export function parseCsv(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinCsv(values: string[]): string {
  return values.join(", ");
}

/**
 * Frontmatter arrives as whatever YAML made of it, so a scalar can never be
 * assumed: an unquoted `lokf_version: 0.2` is a number and `id: true` a
 * boolean, both plainly meant as text. A mapping or list, on the other hand, is
 * a shape mistake the caller should report - returning null keeps
 * "[object Object]" out of every message below.
 */
function asScalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** Renders a frontmatter value inside a message: a scalar quoted, anything
 *  else named by its shape, so a bad value reads as the mistake it is. */
function describeValue(value: unknown): string {
  const scalar = asScalar(value);
  if (scalar !== null) return `"${scalar}"`;
  if (value === undefined) return "<missing>";
  if (value === null) return "<empty>";
  if (Array.isArray(value)) return "<a list>";
  if (typeof value === "object") return "<a mapping>";
  return `<${typeof value}>`;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normalizeTypeKey(type: string): string {
  return type.trim().replace(/\s+/g, "").toLowerCase();
}

function isKnownType(type: string, knownTypes: string[]): boolean {
  const key = normalizeTypeKey(type);
  if (!key) return false;
  return knownTypes.some((t) => normalizeTypeKey(t) === key);
}

function hasScheme(s: string): boolean {
  return SCHEME_RE.test(s);
}

function matchesDomainList(host: string, list: string[]): boolean {
  return list.some((d) => {
    const dom = d.toLowerCase();
    return host === dom || host.endsWith("." + dom);
  });
}

/** Raised for a vault with no bundle-root index.md at all - there is no file to
 *  hang the missing-header finding on, so the caller synthesizes one. */
export function missingRootIndexIssues(settings: LokfSettings): LokfIssue[] {
  if (!settings.warnMissingHeader) return [];
  return [
    {
      severity: "warning",
      rule: "lokf/2-header",
      message:
        "This vault has no root index.md, so it declares no LOKF semantic header (lokf_version, base_iri, context, …) and no concept ids can be minted or checked.",
    },
  ];
}

// ---- Golden Rule 2: bundle-root semantic header ----

interface PublisherShape {
  type?: unknown;
  id?: unknown;
  name?: unknown;
}

export function validateRootHeader(
  data: Record<string, unknown>,
  hasFm: boolean,
  settings: LokfSettings
): LokfIssue[] {
  const issues: LokfIssue[] = [];

  const hasLokfVersion = hasFm && "lokf_version" in data;
  const hasBaseIri = hasFm && "base_iri" in data;

  if (!hasFm || (!hasLokfVersion && !hasBaseIri)) {
    if (settings.warnMissingHeader) {
      issues.push({
        severity: "warning",
        rule: "lokf/2-header",
        message:
          "Root index.md carries no LOKF semantic header. Add lokf_version/base_iri/context/… to opt this bundle into LOKF (ignore this if the vault is plain OKF only).",
      });
    }
    return issues;
  }

  if (hasLokfVersion) {
    const declared = asScalar(data["lokf_version"]);
    if (declared === null || !KNOWN_LOKF_VERSIONS.includes(declared)) {
      issues.push({
        severity: "warning",
        rule: "lokf/2-header",
        message: `Declared lokf_version ${describeValue(data["lokf_version"])} is not one of ${KNOWN_LOKF_VERSIONS.join(" / ")}.`,
      });
    }
  }

  const baseIriRaw = data["base_iri"];
  if (baseIriRaw !== undefined) {
    const baseIri = asScalar(baseIriRaw);
    const url = baseIri === null ? null : parseHttpUrl(baseIri);
    if (baseIri === null || url === null) {
      issues.push({
        severity: "error",
        rule: "lokf/2-header",
        message: `base_iri ${describeValue(baseIriRaw)} is not a valid absolute http(s) URI - no IRI can be minted from it.`,
      });
    } else {
      if (!baseIri.endsWith("/")) {
        issues.push({
          severity: "error",
          rule: "lokf/2-header",
          message: `base_iri "${baseIri}" must end with "/" - concept ids are minted by straight concatenation.`,
        });
      }
      const host = url.host.toLowerCase();
      if (matchesDomainList(host, settings.authorityDenylist)) {
        issues.push({
          severity: "error",
          rule: "lokf/2-authority",
          message: `base_iri "${baseIri}" lives inside "${host}", a URL space this project doesn't control - mint IRIs from a namespace the project actually owns instead.`,
        });
      } else if (matchesDomainList(host, settings.placeholderDomains)) {
        issues.push({
          severity: "warning",
          rule: "lokf/2-authority",
          message: `base_iri "${baseIri}" uses the placeholder domain "${host}" - replace with a real, owned namespace before publishing.`,
        });
      }
    }
  }

  const contextRaw = data["context"];
  if (contextRaw !== undefined) {
    const context = asScalar(contextRaw);
    if (context === null || !hasScheme(context)) {
      issues.push({
        severity: "warning",
        rule: "lokf/2-header",
        message: `context ${describeValue(contextRaw)} doesn't look like a URL.`,
      });
    }
  }

  const publisherRaw = data["publisher"];
  if (publisherRaw !== undefined) {
    if (typeof publisherRaw !== "object" || publisherRaw === null || Array.isArray(publisherRaw)) {
      issues.push({
        severity: "warning",
        rule: "lokf/2-header",
        message: "publisher should be a mapping with type/id/name, not a plain string or list.",
      });
    } else {
      const publisher = publisherRaw as PublisherShape;
      const type = asScalar(publisher.type);
      if (type !== "Organization" && type !== "Person") {
        issues.push({
          severity: "warning",
          rule: "lokf/2-header",
          message: `publisher.type ${describeValue(publisher.type)} should be "Organization" or "Person".`,
        });
      }
      if (!publisher.id) {
        issues.push({ severity: "warning", rule: "lokf/2-header", message: "publisher is missing id." });
      }
      if (!publisher.name) {
        issues.push({ severity: "warning", rule: "lokf/2-header", message: "publisher is missing name." });
      }
    }
  }

  for (const field of ["title", "description", "license"] as const) {
    const v = data[field];
    if (v !== undefined && typeof v !== "string") {
      issues.push({ severity: "warning", rule: "lokf/2-header", message: `${field} should be a string.` });
    }
  }

  return issues;
}

// ---- Golden Rule 3: type vocabulary, genre, type-specific fields ----

interface DistributionShape {
  access_url?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateFieldsAndDistribution(data: Record<string, unknown>): LokfIssue[] {
  const issues: LokfIssue[] = [];

  const fields = data["fields"];
  if (fields !== undefined) {
    if (!Array.isArray(fields)) {
      issues.push({ severity: "error", rule: "lokf/3-fields", message: "fields must be a list of Field objects." });
    } else {
      fields.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          issues.push({
            severity: "error",
            rule: "lokf/3-fields",
            message: `fields[${i}] must be a structured Field object ({name, description, datatype, …}), not a plain string or URL.`,
          });
        }
      });
    }
  }

  const distribution = data["distribution"];
  if (distribution !== undefined) {
    if (!Array.isArray(distribution)) {
      issues.push({
        severity: "error",
        rule: "lokf/3-fields",
        message: "distribution must be a list of Distribution objects.",
      });
    } else {
      distribution.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          issues.push({
            severity: "error",
            rule: "lokf/3-fields",
            message: `distribution[${i}] must be a structured Distribution object ({access_url, name?, description?, media_type?}), not a plain string or URL.`,
          });
        } else if (!(entry as DistributionShape).access_url) {
          issues.push({
            severity: "warning",
            rule: "lokf/3-fields",
            message: `distribution[${i}] is missing access_url.`,
          });
        }
      });
    }
  }

  return issues;
}

export function validateTypeVocabulary(data: Record<string, unknown>, settings: LokfSettings): LokfIssue[] {
  const issues: LokfIssue[] = [];
  const typeRaw = data["type"];
  const type = typeof typeRaw === "string" ? typeRaw.trim() : "";
  if (!type) return issues; // missing type is the installed OKF validator's error to raise

  if (settings.warnUnknownType && !isKnownType(type, settings.knownTypes)) {
    issues.push({
      severity: "warning",
      rule: "lokf/3-vocab",
      message: `type "${type}" is not one of the LOKF vocabulary classes - treated as a generic lokf:Concept.`,
    });
  }

  const genreRaw = data["genre"];
  if (genreRaw !== undefined) {
    const genre = asScalar(genreRaw);
    if (genre === null || !settings.genreValues.includes(genre)) {
      issues.push({
        severity: "warning",
        rule: "lokf/3-genre",
        message: `genre ${describeValue(genreRaw)} should be one of: ${settings.genreValues.join(", ")}.`,
      });
    }
  }

  const typeKey = normalizeTypeKey(type);
  if (typeKey === "table" || typeKey === "dataset") {
    issues.push(...validateFieldsAndDistribution(data));
  } else if (typeKey === "metric" && settings.warnTypeSpecificFields) {
    for (const f of ["unit", "formula", "measures"]) {
      if (data[f] === undefined) {
        issues.push({ severity: "warning", rule: "lokf/3-fields", message: `Metric concept is missing recommended field "${f}".` });
      }
    }
  } else if (typeKey === "service" && settings.warnTypeSpecificFields) {
    for (const f of ["endpoint", "http_method", "documentation"]) {
      if (data[f] === undefined) {
        issues.push({ severity: "warning", rule: "lokf/3-fields", message: `Service concept is missing recommended field "${f}".` });
      }
    }
  } else if (typeKey === "glossaryterm") {
    if (data["definition"] === undefined && settings.warnTypeSpecificFields) {
      issues.push({ severity: "warning", rule: "lokf/3-fields", message: `GlossaryTerm concept is missing recommended field "definition".` });
    }
    if (data["abbreviation"] !== undefined && typeof data["abbreviation"] !== "string") {
      issues.push({ severity: "warning", rule: "lokf/3-fields", message: "abbreviation should be a string." });
    }
  }

  return issues;
}

// ---- Golden Rule 4: typed relationships + target resolution ----

export interface ResolvedTarget {
  raw: string;
  kind: "internal-iri" | "internal-relative" | "external-iri" | "malformed";
  resolvedPath?: string;
}

export function resolveRelationTarget(raw: unknown, baseIri: string | null): ResolvedTarget {
  if (typeof raw !== "string" || !raw.trim()) {
    return { raw: describeValue(raw), kind: "malformed" };
  }
  const value = raw.trim();

  if (hasScheme(value)) {
    if (baseIri && value.startsWith(baseIri)) {
      return { raw: value, kind: "internal-iri", resolvedPath: stripFragment(value.slice(baseIri.length)) };
    }
    return { raw: value, kind: "external-iri" };
  }

  let path = value;
  if (path.startsWith("./")) path = path.slice(2);
  return { raw: value, kind: "internal-relative", resolvedPath: stripFragment(path) };
}

function stripFragment(path: string): string {
  const hashIdx = path.indexOf("#");
  return hashIdx >= 0 ? path.slice(0, hashIdx) : path;
}

/**
 * A concept id has no `.md`, while the file backing it does - and a relative
 * target may be written either way, so both spellings count as resolving.
 * Percent-encoded segments are decoded first: an id minted from a filename with
 * a space is a valid IRI, but the vault path it points at has the space.
 *
 * `siblingDir` is set only for a bare relative target, which an author may well
 * have written relative to the file it sits in rather than to the bundle root;
 * a full IRI under base_iri is bundle-root-absolute by construction.
 */
function targetExists(path: string, exists: (p: string) => boolean, siblingDir?: string): boolean {
  if (!path) return false;
  const bases = new Set([path]);
  try {
    bases.add(decodeURIComponent(path));
  } catch {
    // A malformed escape sequence just means there is nothing extra to try.
  }
  if (siblingDir) {
    for (const b of [...bases]) bases.add(`${siblingDir}/${b}`);
  }
  for (const base of bases) {
    if (exists(base) || exists(base + ".md")) return true;
  }
  return false;
}

export function validateRelationships(
  data: Record<string, unknown>,
  baseIri: string | null,
  settings: LokfSettings,
  exists?: (path: string) => boolean,
  conceptDir = ""
): LokfIssue[] {
  const issues: LokfIssue[] = [];

  const checkTargets = (field: string, raw: unknown) => {
    if (raw === undefined) return;
    if (typeof raw !== "string" && !Array.isArray(raw)) {
      issues.push({ severity: "warning", rule: "lokf/4-relations", message: `${field} should be a string or a list of strings.` });
      return;
    }
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) {
      const resolved = resolveRelationTarget(v, baseIri);
      if (resolved.kind === "malformed") {
        issues.push({ severity: "warning", rule: "lokf/4-relations", message: `${field} has an empty or non-string target.` });
        continue;
      }
      // Both a full IRI under base_iri and a bare relative path name something
      // inside this bundle, so both are checked. An external IRI never is.
      const isInternal = resolved.kind === "internal-iri" || resolved.kind === "internal-relative";
      if (!isInternal || !settings.checkRelationTargets || !exists) continue;
      const siblingDir = resolved.kind === "internal-relative" ? conceptDir : "";
      // Broken cross-links MUST NOT be an error (golden rule 7) - advisory only.
      if (!targetExists(resolved.resolvedPath ?? "", exists, siblingDir)) {
        issues.push({
          severity: "warning",
          rule: "lokf/4-relations",
          message: `${field} -> "${resolved.raw}" does not resolve to a file in this vault.`,
        });
      }
    }
  };

  for (const field of RELATION_FIELDS) {
    checkTargets(field, data[field]);
  }

  const relations = data["relations"];
  if (relations !== undefined) {
    if (!Array.isArray(relations)) {
      issues.push({ severity: "warning", rule: "lokf/4-relations", message: "relations must be a list of {predicate, target} objects." });
    } else {
      relations.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          issues.push({ severity: "warning", rule: "lokf/4-relations", message: `relations[${i}] must be a {predicate, target} object.` });
          return;
        }
        const rel = entry as { predicate?: unknown; target?: unknown };
        if (typeof rel.predicate !== "string" || !rel.predicate.trim()) {
          issues.push({ severity: "warning", rule: "lokf/4-relations", message: `relations[${i}] is missing a predicate.` });
        } else if (settings.warnUnknownPredicate && !settings.knownPredicates.includes(rel.predicate.trim())) {
          issues.push({
            severity: "warning",
            rule: "lokf/4-relations",
            message: `relations[${i}] predicate "${rel.predicate.trim()}" is not in the known RelationType list.`,
          });
        }
        if (rel.target === undefined) {
          issues.push({ severity: "warning", rule: "lokf/4-relations", message: `relations[${i}] is missing a target.` });
        } else {
          checkTargets(`relations[${i}].target`, rel.target);
        }
      });
    }
  }

  return issues;
}

// ---- Golden Rule 2/5: id / IRI-minting consistency ----

export function mintExpectedId(vaultRelativePath: string, baseIri: string): string {
  const withoutExt = vaultRelativePath.replace(/\.md$/i, "");
  return baseIri + withoutExt.split("/").map(encodeURIComponent).join("/");
}

export function validateConceptId(data: Record<string, unknown>, path: string, baseIri: string | null): LokfIssue[] {
  if (!baseIri) return [];
  const idRaw = data["id"];
  if (idRaw === undefined) return [];
  const id = asScalar(idRaw);
  if (id === null) {
    return [
      {
        severity: "warning",
        rule: "lokf/5-id",
        message: `id ${describeValue(idRaw)} should be a single IRI string.`,
      },
    ];
  }
  const expected = mintExpectedId(path, baseIri);
  // The unencoded spelling is what a human typically writes by hand, and it
  // names the same concept, so it is accepted rather than nagged about.
  const expectedRaw = baseIri + path.replace(/\.md$/i, "");
  if (id === expected || id === expectedRaw) return [];
  return [
    {
      severity: "warning",
      rule: "lokf/5-id",
      message: `id "${id}" does not match the id this bundle's base_iri would mint ("${expected}") - fine if intentionally a stable external id.`,
    },
  ];
}

// ---- Orchestrator ----

/**
 * `data` is already-parsed frontmatter (empty when `hasFm` is false). Parsing
 * lives in the caller so this module stays free of any YAML dependency.
 */
export function validateLokfConcept(
  path: string,
  hasFm: boolean,
  data: Record<string, unknown>,
  isRoot: boolean,
  baseIri: string | null,
  settings: LokfSettings,
  exists?: (path: string) => boolean
): LokfIssue[] {
  const reserved = isReserved(path);

  if (reserved === "index" && isRoot) return validateRootHeader(data, hasFm, settings);
  if (reserved) return []; // non-root index.md / log.md carry no LOKF surface
  if (!hasFm) return []; // missing frontmatter entirely is the OKF validator's error

  const cut = path.lastIndexOf("/");
  const conceptDir = cut > 0 ? path.slice(0, cut) : "";

  return [
    ...validateTypeVocabulary(data, settings),
    ...validateRelationships(data, baseIri, settings, exists, conceptDir),
    ...validateConceptId(data, path, baseIri),
  ];
}
