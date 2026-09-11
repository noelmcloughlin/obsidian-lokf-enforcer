// validator.ts - the LOKF semantic-layer rules.
//
// Deliberately import-free: no Obsidian, no YAML parser. Callers hand in
// already-parsed frontmatter, so this module runs unchanged under Obsidian and
// under plain Node (see scripts/smoke-test.ts). Everything OKF v0.2 already
// covers - required `type`, `Attested Computation` shape, index.md/log.md
// structure - is deliberately NOT re-implemented here; that is the installed
// OKF validator's job. The one exception is the OKF v0.2 §5 trust/lifecycle
// fields (verified/generated/status/stale_after/sources): their *shape* is
// checked here (Golden Rule 5, below), because they are defined in the LOKF
// schema and are the substrate LOKF's curation ceremony stands on - but their
// credibility *depth* and trust-tier interpretation is still an OKF
// validator's job, never this file's.

export type LokfSeverity = "error" | "warning";

export interface LokfIssue {
  severity: LokfSeverity;
  rule: string;
  message: string;
  /** The frontmatter key (or key path like `publisher.type`,
   *  `relations[2].target`) the finding is about, when one can be named. A UI
   *  layer resolves it to a line/column via `locateFrontmatterKey` (locator.ts)
   *  for inline underlines and jump-to-line. Absent when the finding is about
   *  the note as a whole, or about a field that is missing entirely (there is
   *  no key to point at), in which case callers fall back to the header. */
  key?: string;
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
  /** Validate the *shape* of the OKF v0.2 §5 trust/lifecycle fields a bundle
   *  actually uses (verified/generated actors, status, stale_after) - the
   *  substrate LOKF's curation ceremony stands on. Produces nothing on a
   *  bundle that carries no §5 fields; deeper credibility/tier interpretation
   *  stays an installed OKF validator's job. */
  checkTrustShape: boolean;
  /** The lifecycle values `status` may take, from the LOKF schema. */
  conceptStatuses: string[];
  /** A note whose frontmatter sets this key to a truthy opt-out value (e.g.
   *  `lokf: ignore`) is silenced entirely - no findings, no underlines, no
   *  report rows. Blank turns the opt-out off. The note still counts as a
   *  concept in the bundle graph; only its findings are suppressed. */
  ignoreFrontmatterKey: string;
  /** Rule ids whose *warnings* should be raised to errors (e.g. `lokf/3-vocab`).
   *  Escalation only: a finding that is already an error by default is never
   *  downgraded, so the "warnings, not errors" contract can only get stricter,
   *  never invert. */
  escalateToError: string[];
  /** Advanced: `user=canonical` pairs mapping a vault's own frontmatter key
   *  spelling onto the LOKF one (e.g. `depends_on=dependsOn`) before validation,
   *  so a vault that never adopted the canonical keys can still be checked
   *  without renaming them. Off (empty) by default - on, it stops the plugin
   *  flagging the divergence, which is why it is opt-in and advanced. */
  fieldAliases: string[];
  excludeFolders: string[];
  batchSize: number;
  recommendSiblingPlugin: boolean;
  /** Underline offending frontmatter values inline, in the editor, with the
   *  finding on hover - the live counterpart to the side report. Off leaves
   *  the editor untouched and the panel the only surface. */
  inlineDiagnostics: boolean;
  /** Offer LOKF-aware value completions while editing a concept's frontmatter
   *  (type/genre/status classes, relation predicates, and the other concepts a
   *  relation can point at) - so a value is picked, not mistyped. */
  autocomplete: boolean;
  /** Vault-relative folders, each the root (index.md, own base_iri/ids) of its
   *  own bundle. Empty means the whole vault is one implicit bundle - the
   *  usual Obsidian setup. Non-empty lets one vault hold several independent
   *  bundles as sibling project folders - the Obsidian-native "one vault,
   *  many folders" pattern - rather than forcing a `.lokf/knowledge/`-style
   *  bundle to be opened as its own vault. A note outside every configured
   *  root is not scanned. */
  bundleRoots: string[];
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

export const DEFAULT_CONCEPT_STATUSES = ["draft", "stable", "deprecated"];

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
  checkTrustShape: true,
  conceptStatuses: DEFAULT_CONCEPT_STATUSES,
  ignoreFrontmatterKey: "lokf",
  escalateToError: [],
  fieldAliases: [],
  excludeFolders: [],
  batchSize: 50,
  recommendSiblingPlugin: true,
  inlineDiagnostics: true,
  autocomplete: true,
  bundleRoots: [],
};

/** Settles the spellings a person plausibly types for one folder onto the
 *  single form Obsidian's vault paths use: forward slashes, no leading or
 *  trailing slash or whitespace, no doubled slashes, no `./` segments. So
 *  "/knowledge/", " knowledge ", ".\knowledge", "./knowledge" and
 *  "knowledge" all become "knowledge". (`..` is left alone - it can't name a
 *  vault folder, so it falls through to the missing-root check and is
 *  reported as not existing, which is the honest message for it.) */
export function normalizeBundleRoot(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

/**
 * The first path segment beginning with a dot, or null if there is none.
 *
 * Obsidian's file index never lists a folder whose name starts with a dot, so
 * a bundle root inside one (`.lokf/knowledge`, the sidecar convention) is
 * invisible to this and every other plugin - a scan of it would silently find
 * nothing. Callers report the segment rather than scanning into the void.
 */
export function hiddenRootSegment(bundleRoot: string): string | null {
  const root = normalizeBundleRoot(bundleRoot);
  if (!root) return null;
  return root.split("/").find((segment) => segment.startsWith(".")) ?? null;
}

// ---- Multi-bundle-root resolution ----
//
// A vault may configure several bundle roots (one vault, several sibling
// project folders, each its own bundle) or none (the whole vault is the one
// implicit bundle). This is pure path algebra - no Obsidian dependency - so
// it lives here rather than in main.ts, exactly like the rest of this file.

/** Normalizes and deduplicates a list of configured bundle roots, sorted
 *  longest-first so `resolveBundleRoot`'s first prefix match is always the
 *  most specific one for a path under a nested root. A blank entry (after
 *  normalizing) drops out silently - it would otherwise collide with the "no
 *  roots configured" case, which means something different (the whole vault,
 *  rather than one configured root that happens to be the vault root). */
export function normalizeBundleRoots(roots: string[]): string[] {
  const seen = new Set<string>();
  for (const entry of roots) {
    const norm = normalizeBundleRoot(entry);
    if (norm) seen.add(norm);
  }
  return [...seen].sort((a, b) => b.length - a.length);
}

/**
 * Which configured bundle a vault-relative path belongs to.
 *
 * Returns that bundle's root path; `""` for the implicit whole-vault bundle
 * when `roots` is empty (no explicit roots configured); or `null` when
 * explicit roots are configured and the path sits under none of them - it
 * belongs to no bundle and is not scanned at all.
 *
 * `roots` must already be normalized and sorted longest-first (see
 * `normalizeBundleRoots`) - this function does not sort, so it stays cheap to
 * call once per candidate file during a scan.
 */
export function resolveBundleRoot(vaultPath: string, roots: string[]): string | null {
  if (roots.length === 0) return "";
  for (const root of roots) {
    if (vaultPath === root || vaultPath.startsWith(root + "/")) return root;
  }
  return null;
}

export function bundleRootIndexPath(root: string): string {
  return root ? `${root}/index.md` : "index.md";
}

/** Strips `root`'s prefix so validator.ts's rule functions - which know
 *  nothing about bundle roots - always see paths relative to the bundle
 *  being validated, exactly as when a bundle root was necessarily the vault
 *  root. The inverse of `toVaultPath`. */
export function toBundlePath(vaultPath: string, root: string): string {
  return root && vaultPath.startsWith(root + "/") ? vaultPath.slice(root.length + 1) : vaultPath;
}

export function toVaultPath(bundlePath: string, root: string): string {
  return root ? `${root}/${bundlePath}` : bundlePath;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export function isReserved(path: string): "index" | "log" | null {
  const f = (path.split("/").pop() || "").toLowerCase();
  if (f === "index.md") return "index";
  if (f === "log.md") return "log";
  return null;
}

// isExcluded runs once per candidate file per scan, so the normalized folder
// list is cached rather than rebuilt per call - same WeakMap-on-array-identity
// convention as isKnownType above, sound for the same reason (settings.ts
// assigns a fresh parseCsv() array on every edit, never mutates in place).
const normalizedExcludeLists = new WeakMap<string[], string[]>();

function normalizedExcludeFolders(excludeFolders: string[]): string[] {
  let norm = normalizedExcludeLists.get(excludeFolders);
  if (!norm) {
    norm = excludeFolders.map(normalizeBundleRoot).filter(Boolean);
    normalizedExcludeLists.set(excludeFolders, norm);
  }
  return norm;
}

/** Settles the same spellings normalizeBundleRoot does ("notes/", "/notes",
 *  " notes ", "./notes") onto the single form vault paths use, so a folder
 *  typed with a trailing slash - the natural way to write one - isn't
 *  silently never excluded. */
export function isExcluded(path: string, settings: LokfSettings): boolean {
  return normalizedExcludeFolders(settings.excludeFolders).some(
    (folder) => path === folder || path.startsWith(folder + "/")
  );
}

// The opt-out is an allow-list, not general truthiness: a note is silenced only
// when its opt-out key names an explicit skip, so an unrelated value under the
// same key (someone typing `lokf: 0.2` by mistake) never quietly suppresses it.
const IGNORE_VALUES = new Set(["ignore", "true", "yes", "on", "skip"]);

/** Whether a note has opted out of validation via its frontmatter (the
 *  `settings.ignoreFrontmatterKey` key set to a skip value). Blank key = off. */
export function isIgnoredByFrontmatter(data: Record<string, unknown>, settings: LokfSettings): boolean {
  const key = settings.ignoreFrontmatterKey.trim();
  if (!key) return false;
  const value = data[key];
  if (value === true) return true;
  if (typeof value === "string") return IGNORE_VALUES.has(value.trim().toLowerCase());
  return false;
}

/** Raise the listed rules' warnings to errors (escalation only - a default
 *  error is never touched, so a structural finding can't be downgraded and the
 *  permissive contract only ever gets stricter). Returns the input untouched
 *  when nothing is escalated, the common case. */
export function applySeverityOverrides(issues: LokfIssue[], settings: LokfSettings): LokfIssue[] {
  if (settings.escalateToError.length === 0) return issues;
  const escalate = new Set(settings.escalateToError);
  return issues.map((issue): LokfIssue =>
    issue.severity === "warning" && escalate.has(issue.rule) ? { ...issue, severity: "error" } : issue
  );
}

/** Rename a vault's own frontmatter keys onto the canonical LOKF ones per the
 *  `user=canonical` alias list, before validation, so a note using `depends_on`
 *  is checked as `dependsOn`. Copy-on-write and non-destructive: an alias whose
 *  source key is absent, or whose target key is already present, is skipped, and
 *  with no aliases the input is returned untouched. */
export function applyFieldAliases(data: Record<string, unknown>, aliases: string[]): Record<string, unknown> {
  if (aliases.length === 0) return data;
  let result = data;
  for (const entry of aliases) {
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    const user = entry.slice(0, eq).trim();
    const canonical = entry.slice(eq + 1).trim();
    if (!user || !canonical || user === canonical) continue;
    if (!(user in result) || canonical in result) continue;
    result = { ...result };
    result[canonical] = result[user];
    delete result[user];
  }
  return result;
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

// isKnownType runs once per note, so the normalized vocabulary is cached
// rather than rebuilt per call. Keyed by array identity, which is sound only
// because a settings list is always REPLACED, never mutated in place
// (settings.ts assigns a fresh parseCsv() array on every edit) - an in-place
// push here would leave this cache stale.
const normalizedTypeSets = new WeakMap<string[], Set<string>>();

function isKnownType(type: string, knownTypes: string[]): boolean {
  const key = normalizeTypeKey(type);
  if (!key) return false;
  let set = normalizedTypeSets.get(knownTypes);
  if (!set) {
    set = new Set(knownTypes.map(normalizeTypeKey));
    normalizedTypeSets.set(knownTypes, set);
  }
  return set.has(key);
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

/** Raised for a bundle with no root index.md at all - there is no file to hang
 *  the missing-header finding on, so the caller synthesizes one. The path is
 *  passed in because the bundle root need not be the vault root. */
export function missingRootIndexIssues(settings: LokfSettings, rootIndexPath = "index.md"): LokfIssue[] {
  if (!settings.warnMissingHeader) return [];
  return [
    {
      severity: "warning",
      rule: "lokf/2-header",
      message: `There is no ${rootIndexPath}, so this bundle declares no LOKF semantic header (lokf_version, base_iri, context, …) and no concept ids can be minted or checked.`,
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
        key: "lokf_version",
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
        key: "base_iri",
        message: `base_iri ${describeValue(baseIriRaw)} is not a valid absolute http(s) URI - no IRI can be minted from it.`,
      });
    } else {
      // A base_iri terminates in `/` (path namespace) or `#` (hash namespace);
      // ids mint by straight concatenation, so an unterminated one would glue
      // (`…/team` + `x` -> `…/teamx`). Matches lokf.yaml's base_iri pattern.
      if (!baseIri.endsWith("/") && !baseIri.endsWith("#")) {
        issues.push({
          severity: "error",
          rule: "lokf/2-header",
          key: "base_iri",
          message: `base_iri "${baseIri}" must end with "/" or "#" - concept ids are minted by straight concatenation.`,
        });
      }
      // .hostname, not .host: the latter includes ":port", which would let
      // "https://github.com:8080/..." slip past a denylist entry of
      // "github.com" - the same authority, just on a non-default port.
      const host = url.hostname.toLowerCase();
      if (matchesDomainList(host, settings.authorityDenylist)) {
        issues.push({
          severity: "error",
          rule: "lokf/2-authority",
          key: "base_iri",
          message: `base_iri "${baseIri}" lives inside "${host}", a URL space this project doesn't control - mint IRIs from a namespace the project actually owns instead.`,
        });
      } else if (matchesDomainList(host, settings.placeholderDomains)) {
        issues.push({
          severity: "warning",
          rule: "lokf/2-authority",
          key: "base_iri",
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
        key: "context",
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
        key: "publisher",
        message: "publisher should be a mapping with type/id/name, not a plain string or list.",
      });
    } else {
      const publisher = publisherRaw as PublisherShape;
      const type = asScalar(publisher.type);
      if (type !== "Organization" && type !== "Person") {
        issues.push({
          severity: "warning",
          rule: "lokf/2-header",
          key: "publisher.type",
          message: `publisher.type ${describeValue(publisher.type)} should be "Organization" or "Person".`,
        });
      }
      if (!publisher.id) {
        issues.push({ severity: "warning", rule: "lokf/2-header", key: "publisher", message: "publisher is missing id." });
      }
      if (!publisher.name) {
        issues.push({ severity: "warning", rule: "lokf/2-header", key: "publisher", message: "publisher is missing name." });
      }
    }
  }

  for (const field of ["title", "description", "license"] as const) {
    const v = data[field];
    if (v !== undefined && typeof v !== "string") {
      issues.push({ severity: "warning", rule: "lokf/2-header", key: field, message: `${field} should be a string.` });
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
      issues.push({ severity: "error", rule: "lokf/3-fields", key: "fields", message: "fields must be a list of Field objects." });
    } else {
      fields.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          issues.push({
            severity: "error",
            rule: "lokf/3-fields",
            key: `fields[${i}]`,
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
        key: "distribution",
        message: "distribution must be a list of Distribution objects.",
      });
    } else {
      distribution.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          issues.push({
            severity: "error",
            rule: "lokf/3-fields",
            key: `distribution[${i}]`,
            message: `distribution[${i}] must be a structured Distribution object ({access_url, name?, description?, media_type?}), not a plain string or URL.`,
          });
        } else if (!(entry as DistributionShape).access_url) {
          issues.push({
            severity: "warning",
            rule: "lokf/3-fields",
            key: `distribution[${i}]`,
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
  // undefined/null is effectively missing - the installed OKF validator's
  // error to raise, not this one's. A list or mapping is a genuine shape
  // mistake (unlike a coercible scalar - "123" or "true" - which falls
  // through to the ordinary "not one of the vocabulary" warning below,
  // exactly like an unrecognized string would).
  if (typeRaw === undefined || typeRaw === null) return issues;
  const typeScalar = asScalar(typeRaw);
  if (typeScalar === null) {
    issues.push({
      severity: "warning",
      rule: "lokf/3-vocab",
      key: "type",
      message: `type ${describeValue(typeRaw)} should be a single string naming a LOKF class, not a list or mapping.`,
    });
    return issues;
  }
  const type = typeScalar.trim();
  if (!type) return issues; // blank string is effectively missing too

  if (settings.warnUnknownType && !isKnownType(type, settings.knownTypes)) {
    issues.push({
      severity: "warning",
      rule: "lokf/3-vocab",
      key: "type",
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
        key: "genre",
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
    // http_method is deliberately not recommended (lokf.yaml): its own spec
    // says "if applicable", and a GraphQL, gRPC, or whole-REST-API Service has
    // no single verb.
    for (const f of ["endpoint", "documentation"]) {
      if (data[f] === undefined) {
        issues.push({ severity: "warning", rule: "lokf/3-fields", message: `Service concept is missing recommended field "${f}".` });
      }
    }
  } else if (typeKey === "glossaryterm") {
    if (data["definition"] === undefined && settings.warnTypeSpecificFields) {
      issues.push({ severity: "warning", rule: "lokf/3-fields", message: `GlossaryTerm concept is missing recommended field "definition".` });
    }
    if (data["abbreviation"] !== undefined && typeof data["abbreviation"] !== "string") {
      issues.push({ severity: "warning", rule: "lokf/3-fields", key: "abbreviation", message: "abbreviation should be a string." });
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

  // `mustBeList` applies only to the ten named RELATION_FIELDS below, never to
  // a single relations[].target: the generated schema declares those ten
  // slots multivalued (Rule 4), so a bare scalar there - natural to write,
  // and semantically a single target either way - fails real `lokf validate`
  // even though this function would happily resolve it. A real audit of this
  // bundle found exactly this mistake in roughly half its concepts (see
  // .lokf/knowledge/log.md, 2026-09-09) - `lokf validate` is the only thing
  // that ever caught it before this warning existed.
  const checkTargets = (field: string, raw: unknown, mustBeList = false) => {
    if (raw === undefined) return;
    if (typeof raw !== "string" && !Array.isArray(raw)) {
      issues.push({ severity: "warning", rule: "lokf/4-relations", key: field, message: `${field} should be a string or a list of strings.` });
      return;
    }
    if (mustBeList && !Array.isArray(raw)) {
      issues.push({
        severity: "warning",
        rule: "lokf/4-relations",
        key: field,
        message: `${field} is a single value, but the LOKF schema requires a list even for one target - write "${field}:" on its own line with "- ${raw}" indented below it.`,
      });
    }
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) {
      const resolved = resolveRelationTarget(v, baseIri);
      if (resolved.kind === "malformed") {
        issues.push({ severity: "warning", rule: "lokf/4-relations", key: field, message: `${field} has an empty or non-string target.` });
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
          key: field,
          message: `${field} -> "${resolved.raw}" does not resolve to a file in this vault.`,
        });
      }
    }
  };

  for (const field of RELATION_FIELDS) {
    checkTargets(field, data[field], true);
  }

  const relations = data["relations"];
  if (relations !== undefined) {
    if (!Array.isArray(relations)) {
      issues.push({ severity: "warning", rule: "lokf/4-relations", key: "relations", message: "relations must be a list of {predicate, target} objects." });
    } else {
      relations.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          issues.push({ severity: "warning", rule: "lokf/4-relations", key: `relations[${i}]`, message: `relations[${i}] must be a {predicate, target} object.` });
          return;
        }
        const rel = entry as { predicate?: unknown; target?: unknown };
        if (typeof rel.predicate !== "string" || !rel.predicate.trim()) {
          issues.push({ severity: "warning", rule: "lokf/4-relations", key: `relations[${i}]`, message: `relations[${i}] is missing a predicate.` });
        } else if (settings.warnUnknownPredicate && !settings.knownPredicates.includes(rel.predicate.trim())) {
          issues.push({
            severity: "warning",
            rule: "lokf/4-relations",
            key: `relations[${i}].predicate`,
            message: `relations[${i}] predicate "${rel.predicate.trim()}" is not in the known RelationType list.`,
          });
        }
        if (rel.target === undefined) {
          issues.push({ severity: "warning", rule: "lokf/4-relations", key: `relations[${i}]`, message: `relations[${i}] is missing a target.` });
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
        key: "id",
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
      key: "id",
      message: `id "${id}" does not match the id this bundle's base_iri would mint ("${expected}") - fine if intentionally a stable external id.`,
    },
  ];
}

// ---- Golden Rule 5: trust/lifecycle field shapes (OKF v0.2 §5) ----
//
// The §5 fields originated in OKF v0.2 but are defined in the LOKF schema and
// are the load-bearing substrate of LOKF's curation ceremony (draft → verified
// → stale), so their *shape* is LOKF Enforcer's business - not the deep
// credibility/tier interpretation, which stays an installed OKF validator's
// job. Every finding is a warning, and nothing fires on a bundle that carries
// no §5 fields, so a plain LOKF bundle sees no new noise.

function isDateObject(value: unknown): boolean {
  return Object.prototype.toString.call(value) === "[object Date]" && !isNaN((value as Date).getTime());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// An OKF §7 provenance actor literal for a `by` slot: `human:<id>`,
// `process:<id>`, or a bare `<producer>/<version>`. Matches lokf.yaml's `by`
// pattern exactly - deliberately stricter than a source's `author`, which
// admits any `<prefix>:<id>` (e.g. `team:analytics`); a `by` value narrower
// than the schema's would let the trust-tier derivation read an actor the
// real validator rejects.
const ACTOR_RE = /^(?:(?:human|process):\S+|[^\s/]+\/[^\s/]+)$/;

/** One `{ by, at }` event under `generated` or an entry of `verified`. */
function validateTrustEvent(label: string, keyPath: string, entry: unknown, issues: LokfIssue[]): void {
  if (!isPlainObject(entry)) {
    issues.push({ severity: "warning", rule: "lokf/5-trust", key: keyPath, message: `${label} should be a mapping with { by, at }.` });
    return;
  }
  const by = entry["by"];
  if (by === undefined) {
    issues.push({ severity: "warning", rule: "lokf/5-trust", key: keyPath, message: `${label} is missing "by" - the actor that performed it, from which trust tiers derive.` });
  } else {
    const actor = asScalar(by);
    if (actor === null || !actor.trim()) {
      issues.push({ severity: "warning", rule: "lokf/5-trust", key: `${keyPath}.by`, message: `${label} "by" ${describeValue(by)} should be a non-empty OKF §7 actor string (human:<id>, process:<id>, or <producer>/<version>).` });
    } else if (!ACTOR_RE.test(actor.trim())) {
      issues.push({ severity: "warning", rule: "lokf/5-trust", key: `${keyPath}.by`, message: `${label} "by" "${actor}" doesn't look like an OKF §7 actor (human:<id>, process:<id>, or <producer>/<version>) - trust tiers derive from the human: prefix.` });
    }
  }
  const at = entry["at"];
  if (at !== undefined && !isDateObject(at)) {
    const scalar = asScalar(at);
    if (scalar === null || !DATETIME_RE.test(scalar)) {
      issues.push({ severity: "warning", rule: "lokf/5-trust", key: `${keyPath}.at`, message: `${label} "at" ${describeValue(at)} should be an ISO 8601 date or datetime.` });
    }
  }
}

export function validateTrustLifecycle(data: Record<string, unknown>, settings: LokfSettings): LokfIssue[] {
  if (!settings.checkTrustShape) return [];
  const issues: LokfIssue[] = [];

  const generated = data["generated"];
  if (generated !== undefined) validateTrustEvent("generated", "generated", generated, issues);

  const verified = data["verified"];
  if (verified !== undefined) {
    if (Array.isArray(verified)) {
      verified.forEach((entry, i) => validateTrustEvent(`verified[${i}]`, `verified[${i}]`, entry, issues));
    } else if (isPlainObject(verified)) {
      // A single event mapping is tolerated - the schema normalizes it to a
      // one-element list, exactly as with a single relation target.
      validateTrustEvent("verified", "verified", verified, issues);
    } else {
      issues.push({ severity: "warning", rule: "lokf/5-trust", key: "verified", message: "verified should be a list of { by, at } events (or a single such mapping)." });
    }
  }

  const status = data["status"];
  if (status !== undefined) {
    const scalar = asScalar(status);
    if (scalar === null || !settings.conceptStatuses.includes(scalar)) {
      issues.push({ severity: "warning", rule: "lokf/5-lifecycle", key: "status", message: `status ${describeValue(status)} should be one of: ${settings.conceptStatuses.join(", ")}.` });
    }
  }

  const staleAfter = data["stale_after"];
  if (staleAfter !== undefined && !isDateObject(staleAfter)) {
    const scalar = asScalar(staleAfter);
    if (scalar === null || !DATE_RE.test(scalar)) {
      issues.push({ severity: "warning", rule: "lokf/5-lifecycle", key: "stale_after", message: `stale_after ${describeValue(staleAfter)} should be an absolute date (YYYY-MM-DD).` });
    }
  }

  const sources = data["sources"];
  if (sources !== undefined) {
    if (!Array.isArray(sources)) {
      issues.push({ severity: "warning", rule: "lokf/5-trust", key: "sources", message: "sources should be a list of { resource, … } objects." });
    } else {
      sources.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          issues.push({ severity: "warning", rule: "lokf/5-trust", key: `sources[${i}]`, message: `sources[${i}] should be a { resource, … } object.` });
        } else if (entry["resource"] === undefined || (typeof entry["resource"] === "string" && !entry["resource"].trim())) {
          issues.push({ severity: "warning", rule: "lokf/5-trust", key: `sources[${i}]`, message: `sources[${i}] is missing the required "resource".` });
        }
      });
    }
  }

  return issues;
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

  // A note that has explicitly opted out is silenced before any rule runs -
  // including the root header - but stays a concept in the bundle graph.
  if (hasFm && isIgnoredByFrontmatter(data, settings)) return [];

  if (reserved === "index" && isRoot) return applySeverityOverrides(validateRootHeader(data, hasFm, settings), settings);
  if (reserved) return []; // non-root index.md / log.md carry no LOKF surface
  if (!hasFm) return []; // missing frontmatter entirely is the OKF validator's error

  const cut = path.lastIndexOf("/");
  const conceptDir = cut > 0 ? path.slice(0, cut) : "";

  return applySeverityOverrides(
    [
      ...validateTypeVocabulary(data, settings),
      ...validateRelationships(data, baseIri, settings, exists, conceptDir),
      ...validateConceptId(data, path, baseIri),
      ...validateTrustLifecycle(data, settings),
    ],
    settings
  );
}
