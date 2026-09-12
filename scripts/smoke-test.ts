/**
 * Plain-Node regression check for validator.ts - no Obsidian runtime needed.
 * Run with `npm run smoke-test`. Exits non-zero on any failed expectation.
 *
 * validator.ts is import-free and takes already-parsed frontmatter, so the only
 * thing this harness adds is a YAML parser (a devDependency; the plugin itself
 * uses Obsidian's own parseYaml).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// js-yaml is loaded as CommonJS and typed by hand: its @types package ships an
// ESM typings file that re-exports itself, and under this project's module
// settings that sends both tsc and type-aware ESLint round in circles (tsc
// rejects the named import; ESLint never finishes the file).
const cjs = createRequire(import.meta.url);
const { load: loadYaml } = cjs("js-yaml") as { load: (source: string) => unknown };
import {
  validateLokfConcept,
  missingRootIndexIssues,
  normalizeBundleRoot,
  hiddenRootSegment,
  normalizeBundleRoots,
  resolveBundleRoot,
  bundleRootIndexPath,
  toBundlePath,
  toVaultPath,
  readBaseIri,
  splitFrontmatter,
  mintExpectedId,
  resolveRelationTarget,
  isExcluded,
  isIgnoredByFrontmatter,
  applySeverityOverrides,
  applyFieldAliases,
  DEFAULT_SETTINGS,
  type LokfIssue,
  type LokfSettings,
  implicitBundleRoots,
  VISIBLE_BUNDLE_FOLDER,
} from "../src/validator";
import { locateFrontmatterKey, locationToDocRange } from "../src/locator";
import { pluginDefaultSettings, SCHEMA_VERSION, LOKF_VOCAB } from "../src/vocab";
import { buildConceptGraph, type ConceptRecord } from "../src/graph";
import { detectSuggestContext, withinFrontmatter } from "../src/suggest-context";
import { computeFixes, type FixEdit } from "../src/fixes";
import { extractBodyLinks, classifyLink, buildProposals, type BodyLink } from "../src/propose";
import { issueMatchesFilter, topLevelKey } from "../src/report-filter";
import {
  buildConceptBlock,
  applyConceptBlock,
  buildDiataxisBlock,
  applyDiataxisBlock,
  newDiataxisNote,
  diataxisFrontmatter,
  refreshGeneratedAt,
  type DiataxisHeader,
} from "../src/affordances";
import { FIELD_ORDER, LOKF_FIELD_DOCS, resolveFieldDocs } from "../src/fields";
import lokfVocab from "../src/lokf-vocab.json";

const TEST_HEADER: DiataxisHeader = { id: "https://acme.example/knowledge/diataxis", generatedBy: "lokf-registrar/0.0.0-test", generatedAt: "2026-09-12T15:00:00Z" };
let failures = 0;

function expect(name: string, condition: boolean, detail: string): boolean {
  if (condition) {
    console.log(`  ok - ${name}`);
  } else {
    failures++;
    console.error(`  FAIL - ${name}\n         ${detail}`);
  }
  return condition;
}

function section(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

function parse(content: string): { hasFm: boolean; data: Record<string, unknown> } {
  const { hasFm, raw } = splitFrontmatter(content);
  if (!hasFm) return { hasFm: false, data: {} };
  const parsed = loadYaml(raw);
  return { hasFm: true, data: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {} };
}

function check(
  path: string,
  content: string,
  opts: {
    isRoot?: boolean;
    baseIri?: string | null;
    exists?: (p: string) => boolean;
    settings?: LokfSettings;
  } = {}
): LokfIssue[] {
  const { hasFm, data } = parse(content);
  const { body } = splitFrontmatter(content);
  return validateLokfConcept(
    path,
    hasFm,
    data,
    opts.isRoot ?? false,
    opts.baseIri ?? null,
    opts.settings ?? DEFAULT_SETTINGS,
    opts.exists,
    body
  );
}

const errors = (issues: LokfIssue[]) => issues.filter((i) => i.severity === "error").length;
const warnings = (issues: LokfIssue[]) => issues.filter((i) => i.severity === "warning").length;
const show = (issues: LokfIssue[]) => JSON.stringify(issues, null, 2);

// Fixture 1: a realistic bundle-root index.md header (placeholder base_iri, Person publisher).
section("realistic bundle-root index.md header (placeholder base_iri)", () => {
  const content = `---
lokf_version: "0.2"
okf_version: "0.2"
base_iri: https://acme-knowledge.example/knowledge/
context: https://w3id.org/lokf/context.jsonld
title: Acme Knowledge Bundle
description: A realistic bundle-root header, as a team wiki or a repository sidecar would carry it.
license: https://creativecommons.org/licenses/by/4.0/
publisher:
  type: Person
  id: https://acme-knowledge.example/knowledge/person/jane-doe
  name: Jane Doe
---

# Acme Knowledge Bundle
`;
  const issues = check("index.md", content, { isRoot: true });
  expect("zero errors", errors(issues) === 0, show(issues));
  expect(
    "exactly one warning (placeholder domain)",
    warnings(issues) === 1 && issues[0]?.rule === "lokf/2-authority",
    show(issues)
  );
  expect(
    "readBaseIri reads the base_iri",
    readBaseIri(parse(content).data) === "https://acme-knowledge.example/knowledge/",
    String(readBaseIri(parse(content).data))
  );
});

section("base_iri inside an uncontrolled URL space (authority violation)", () => {
  const issues = check("index.md", `---\nlokf_version: "0.2"\nbase_iri: https://github.com/acme/repo/knowledge/\n---\n`, {
    isRoot: true,
  });
  expect("one authority error", errors(issues) === 1 && issues[0]?.rule === "lokf/2-authority", show(issues));
});

section("base_iri inside a denylisted host on a non-default port", () => {
  // `url.host` includes ":port"; comparing against that would let this slip
  // past the "github.com" denylist entry - the same authority, just fronted
  // by a non-default port.
  const issues = check("index.md", `---\nlokf_version: "0.2"\nbase_iri: https://github.com:8080/acme/repo/knowledge/\n---\n`, {
    isRoot: true,
  });
  expect("one authority error", errors(issues) === 1 && issues[0]?.rule === "lokf/2-authority", show(issues));
});

section("base_iri missing terminator", () => {
  const issues = check("index.md", `---\nlokf_version: "0.2"\nbase_iri: https://acme.example/knowledge\n---\n`, {
    isRoot: true,
  });
  expect("one structural error", errors(issues) === 1, show(issues));
});

section("base_iri may terminate with # (hash namespace)", () => {
  const issues = check("index.md", `---\nlokf_version: "0.2"\nbase_iri: https://acme.example/ns#\n---\n`, {
    isRoot: true,
  });
  expect("a #-terminated base_iri is accepted", errors(issues) === 0, show(issues));
});

section("unknown lokf_version", () => {
  const issues = check("index.md", `---\nlokf_version: "9.9"\nbase_iri: https://acme.test/knowledge/\n---\n`, {
    isRoot: true,
  });
  expect("one version warning", warnings(issues) === 1 && errors(issues) === 0, show(issues));
});

section("vault with no root index.md at all", () => {
  const issues = missingRootIndexIssues(DEFAULT_SETTINGS);
  expect("one warning", issues.length === 1 && issues[0]?.severity === "warning", show(issues));
  expect(
    "suppressed when warnMissingHeader is off",
    missingRootIndexIssues({ ...DEFAULT_SETTINGS, warnMissingHeader: false }).length === 0,
    "expected none"
  );
  expect(
    "names the configured bundle root, not just the vault root",
    missingRootIndexIssues(DEFAULT_SETTINGS, "knowledge/index.md")[0]?.message.includes("knowledge/index.md") === true,
    show(missingRootIndexIssues(DEFAULT_SETTINGS, "knowledge/index.md"))
  );
});

section("bundle root normalizes, and a dot-folder root is recognised (accepted, explained if unlisted)", () => {
  for (const raw of ["knowledge", "knowledge/", "/knowledge", "  knowledge  ", "///knowledge///"]) {
    expect(`"${raw}" normalizes to "knowledge"`, normalizeBundleRoot(raw) === "knowledge", normalizeBundleRoot(raw));
  }
  expect("blank stays blank (bundle is the vault root)", normalizeBundleRoot("  ") === "", "expected empty");
  expect("a nested path is preserved", normalizeBundleRoot("projects/foo/") === "projects/foo", "expected projects/foo");
  // The spellings a person plausibly types, each of which must land on the
  // exact form Obsidian's vault paths use - or resolveBundleRoot would match
  // nothing and the folder would be reported as missing.
  expect("a leading ./ is dropped, not treated as a hidden folder", normalizeBundleRoot("./knowledge") === "knowledge", normalizeBundleRoot("./knowledge"));
  expect("backslashes become forward slashes", normalizeBundleRoot("projects\\foo") === "projects/foo", normalizeBundleRoot("projects\\foo"));
  expect("doubled slashes collapse", normalizeBundleRoot("projects//foo") === "projects/foo", normalizeBundleRoot("projects//foo"));
  expect("whitespace inside the slashes is trimmed too", normalizeBundleRoot("/ knowledge /") === "knowledge", JSON.stringify(normalizeBundleRoot("/ knowledge /")));
  expect("a bare . is the vault root, not a folder", normalizeBundleRoot(".") === "", JSON.stringify(normalizeBundleRoot(".")));
  expect("./ is not flagged as a dot-folder either", hiddenRootSegment("./knowledge") === null, String(hiddenRootSegment("./knowledge")));

  // Obsidian's file index never exposes a dot-folder, so these can never be
  // scanned - they must be reported, never silently walked into.
  expect("the sidecar convention is caught", hiddenRootSegment(".lokf/knowledge") === ".lokf", "expected .lokf");
  expect("a dot segment deeper in the path is caught", hiddenRootSegment("a/.hidden/b") === ".hidden", "expected .hidden");
  expect("a bare dot-folder is caught", hiddenRootSegment(".git") === ".git", "expected .git");
  expect("an ordinary folder is fine", hiddenRootSegment("knowledge") === null, "expected null");
  expect("a nested ordinary path is fine", hiddenRootSegment("projects/foo") === null, "expected null");
  expect("blank (the vault root) is fine", hiddenRootSegment("") === null, "expected null");
  expect("a dot inside a name is not a dot-folder", hiddenRootSegment("v0.2-knowledge") === null, "expected null");
});

section("excludeFolders accepts the same spellings normalizeBundleRoot does", () => {
  // A trailing slash is the natural way to type a folder, so it must exclude
  // just as well as the bare form - previously only the exact bare spelling
  // ("notes", no slash, no whitespace) worked at all.
  for (const folder of ["notes", "notes/", "/notes", " notes ", "./notes", "notes\\"]) {
    const settings = { ...DEFAULT_SETTINGS, excludeFolders: [folder] };
    expect(
      `${JSON.stringify(folder)} excludes "notes/a.md"`,
      isExcluded("notes/a.md", settings),
      `isExcluded returned false for excludeFolders: [${JSON.stringify(folder)}]`
    );
  }
  const settings = { ...DEFAULT_SETTINGS, excludeFolders: ["notes"] };
  expect("a sibling folder with a shared prefix is not excluded", !isExcluded("notes-archive/a.md", settings), "expected false");
  expect("an unrelated folder is not excluded", !isExcluded("other/a.md", settings), "expected false");
});

section("per-note opt-out (isIgnoredByFrontmatter + orchestrator short-circuit)", () => {
  const d = DEFAULT_SETTINGS;
  expect("`lokf: ignore` opts out", isIgnoredByFrontmatter({ lokf: "ignore" }, d), "expected true");
  expect("`lokf: true` opts out", isIgnoredByFrontmatter({ lokf: true }, d), "expected true");
  expect("`lokf: SKIP` is case-insensitive", isIgnoredByFrontmatter({ lokf: "SKIP" }, d), "expected true");
  expect("no opt-out key means not ignored", !isIgnoredByFrontmatter({ type: "Reference" }, d), "expected false");
  expect("an unrelated value under the key does not opt out", !isIgnoredByFrontmatter({ lokf: "0.2" }, d), "expected false");
  expect("`lokf: false` does not opt out", !isIgnoredByFrontmatter({ lokf: false }, d), "expected false");
  expect("a blank opt-out key disables the feature", !isIgnoredByFrontmatter({ lokf: "ignore" }, { ...d, ignoreFrontmatterKey: "" }), "expected false");
  // A note that would otherwise warn is silenced entirely, root header included.
  const wouldWarn = `---\ntype: Nonsense\nlokf: ignore\n---\n`;
  expect("an opted-out concept yields no findings", check("misc/wip.md", wouldWarn).length === 0, show(check("misc/wip.md", wouldWarn)));
  const badRoot = `---\nlokf_version: "0.2"\nbase_iri: notaurl\nlokf: ignore\n---\n`;
  expect("an opted-out root header yields no findings", check("index.md", badRoot, { isRoot: true }).length === 0, show(check("index.md", badRoot, { isRoot: true })));
  // The same note without the flag still warns, so the opt-out is what silences it.
  const noFlag = `---\ntype: Nonsense\n---\n`;
  expect("the same note warns without the flag", check("misc/wip.md", noFlag).length > 0, "expected findings");
});

section("per-rule severity escalation (applySeverityOverrides, escalation-only)", () => {
  const warnIssue: LokfIssue = { severity: "warning", rule: "lokf/3-vocab", message: "unknown type", key: "type" };
  const errIssue: LokfIssue = { severity: "error", rule: "lokf/2-header", message: "bad base_iri", key: "base_iri" };
  const base = [warnIssue, errIssue];
  expect("no escalation list leaves severities untouched", applySeverityOverrides(base, DEFAULT_SETTINGS) === base, "expected same array");
  const escalated = applySeverityOverrides(base, { ...DEFAULT_SETTINGS, escalateToError: ["lokf/3-vocab"] });
  expect("a listed rule's warning becomes an error", escalated[0]?.severity === "error", show(escalated));
  expect("an unlisted rule's warning is unchanged", applySeverityOverrides(base, { ...DEFAULT_SETTINGS, escalateToError: ["lokf/4-relations"] })[0]?.severity === "warning", "expected warning");
  // The invariant: a structural error is never downgraded, even if its rule is listed.
  const cannotDowngrade = applySeverityOverrides(base, { ...DEFAULT_SETTINGS, escalateToError: ["lokf/2-header", "lokf/3-vocab"] });
  expect("a default error stays an error (never downgraded)", cannotDowngrade[1]?.severity === "error", show(cannotDowngrade));
  // Whole-orchestrator: an unknown type warns by default, errors when escalated.
  const doc = `---\ntype: Nonsense\n---\n`;
  expect("orchestrator escalates a warning to an error", errors(check("m/a.md", doc, { settings: { ...DEFAULT_SETTINGS, escalateToError: ["lokf/3-vocab"] } })) === 1, "expected one error");
});

section("field aliasing (applyFieldAliases) - opt-in key normalization", () => {
  const data = { type: "Reference", depends_on: "./other.md", is_part_of: "./parent.md" };
  expect("no aliases returns the same object", applyFieldAliases(data, []) === data, "expected identity");
  const mapped = applyFieldAliases(data, ["depends_on=dependsOn", "is_part_of=isPartOf"]);
  expect("the user key is renamed to canonical", mapped["dependsOn"] === "./other.md" && !("depends_on" in mapped), JSON.stringify(mapped));
  expect("a second alias also applies", mapped["isPartOf"] === "./parent.md", JSON.stringify(mapped));
  expect("the original object is not mutated", "depends_on" in data, "expected copy-on-write");
  // An absent source key, or a canonical key already present, is left alone.
  expect("an absent source key is a no-op", !("dependsOn" in applyFieldAliases({ type: "Reference" }, ["depends_on=dependsOn"])), "expected no key");
  const collide = applyFieldAliases({ dependsOn: "./canon.md", depends_on: "./alias.md" }, ["depends_on=dependsOn"]);
  expect("an existing canonical value is not clobbered", collide["dependsOn"] === "./canon.md", JSON.stringify(collide));
});

section("normalizeBundleRoots: normalizes, dedupes, sorts longest-first", () => {
  expect("no roots configured stays empty", normalizeBundleRoots([]).length === 0, "expected []");
  expect(
    "blank and whitespace-only entries drop out",
    normalizeBundleRoots(["", "   ", "knowledge"]).length === 1,
    String(normalizeBundleRoots(["", "   ", "knowledge"]))
  );
  expect(
    "differently-spelled duplicates collapse to one",
    JSON.stringify(normalizeBundleRoots(["knowledge", "knowledge/", " knowledge "])) === JSON.stringify(["knowledge"]),
    String(normalizeBundleRoots(["knowledge", "knowledge/", " knowledge "]))
  );
  expect(
    "sorted longest-first, so a nested root comes before its parent",
    JSON.stringify(normalizeBundleRoots(["a", "a/b"])) === JSON.stringify(["a/b", "a"]),
    String(normalizeBundleRoots(["a", "a/b"]))
  );
  expect(
    "disjoint roots of equal length keep input order (stable sort)",
    JSON.stringify(normalizeBundleRoots(["projects/a", "projects/b"])) === JSON.stringify(["projects/a", "projects/b"]),
    String(normalizeBundleRoots(["projects/a", "projects/b"]))
  );
});

section("resolveBundleRoot: which configured bundle a path belongs to", () => {
  expect(
    "no roots at all means no bundle: every path resolves to null, not to the vault root",
    resolveBundleRoot("anything/at/all.md", []) === null,
    String(resolveBundleRoot("anything/at/all.md", []))
  );
  expect(
    "the explicit whole-vault root (\"\") matches every path",
    resolveBundleRoot("anything/at/all.md", [""]) === "" && resolveBundleRoot("index.md", [""]) === "",
    String(resolveBundleRoot("anything/at/all.md", [""]))
  );

  const single = normalizeBundleRoots(["knowledge"]);
  expect("a path under the one configured root resolves to it", resolveBundleRoot("knowledge/index.md", single) === "knowledge", String(resolveBundleRoot("knowledge/index.md", single)));
  expect("the root path itself resolves to it", resolveBundleRoot("knowledge", single) === "knowledge", String(resolveBundleRoot("knowledge", single)));
  expect(
    "a path outside every configured root resolves to null, not the implicit root",
    resolveBundleRoot("other/note.md", single) === null,
    String(resolveBundleRoot("other/note.md", single))
  );
  expect(
    "a same-named prefix that isn't actually inside the root does not match",
    resolveBundleRoot("knowledge-archive/note.md", single) === null,
    String(resolveBundleRoot("knowledge-archive/note.md", single))
  );

  const nested = normalizeBundleRoots(["projects", "projects/a"]);
  expect(
    "a path under both an outer and a nested root resolves to the more specific one",
    resolveBundleRoot("projects/a/index.md", nested) === "projects/a",
    String(resolveBundleRoot("projects/a/index.md", nested))
  );
  expect(
    "a path under only the outer root falls back to it",
    resolveBundleRoot("projects/other/note.md", nested) === "projects",
    String(resolveBundleRoot("projects/other/note.md", nested))
  );

  const disjoint = normalizeBundleRoots(["projects/a", "projects/b"]);
  expect("disjoint roots: a path picks its own root", resolveBundleRoot("projects/a/note.md", disjoint) === "projects/a", String(resolveBundleRoot("projects/a/note.md", disjoint)));
  expect(
    "disjoint roots: a path under neither is null, not the other root",
    resolveBundleRoot("projects/c/note.md", disjoint) === null,
    String(resolveBundleRoot("projects/c/note.md", disjoint))
  );
});

section("bundleRootIndexPath / toBundlePath / toVaultPath", () => {
  expect("empty root's index is the vault root's index.md", bundleRootIndexPath("") === "index.md", bundleRootIndexPath(""));
  expect("a configured root's index sits inside it", bundleRootIndexPath("projects/a") === "projects/a/index.md", bundleRootIndexPath("projects/a"));

  expect("toBundlePath strips a matching root prefix", toBundlePath("knowledge/services/foo.md", "knowledge") === "services/foo.md", toBundlePath("knowledge/services/foo.md", "knowledge"));
  expect("toBundlePath is a no-op for the empty (whole-vault) root", toBundlePath("index.md", "") === "index.md", toBundlePath("index.md", ""));
  expect(
    "toBundlePath leaves a path alone if it isn't under the given root",
    toBundlePath("other/note.md", "knowledge") === "other/note.md",
    toBundlePath("other/note.md", "knowledge")
  );

  expect("toVaultPath prepends a non-empty root", toVaultPath("services/foo.md", "knowledge") === "knowledge/services/foo.md", toVaultPath("services/foo.md", "knowledge"));
  expect("toVaultPath is a no-op for the empty root", toVaultPath("index.md", "") === "index.md", toVaultPath("index.md", ""));

  for (const [vaultPath, root] of [
    ["knowledge/services/foo.md", "knowledge"],
    ["projects/a/index.md", "projects/a"],
    ["index.md", ""],
  ] as const) {
    const roundTripped = toVaultPath(toBundlePath(vaultPath, root), root);
    expect(`round-trips through bundle-relative and back: "${vaultPath}" (root "${root}")`, roundTripped === vaultPath, roundTripped);
  }
});

section("Table with a bare-string field (structural mistake)", () => {
  const issues = check("datasets/orders.md", `---\ntype: Table\nfields:\n  - "a bare string"\n---\n`);
  expect("one structural error", errors(issues) === 1 && issues[0]?.rule === "lokf/3-fields", show(issues));
});

section("Service missing recommended fields (warnings only)", () => {
  const issues = check("services/orders.md", `---\ntype: Service\ntitle: Orders API\n---\n`);
  expect("no errors", errors(issues) === 0, show(issues));
  // http_method is deliberately not recommended (lokf.yaml): "if applicable".
  expect("two warnings (endpoint/documentation)", warnings(issues) === 2, show(issues));
  expect("no http_method warning", !issues.some((i) => i.message.includes("http_method")), show(issues));
});

section("relationships: external IRI never flagged, broken relative link warned", () => {
  const baseIri = "https://acme.example/knowledge/";
  const content = `---
type: Reference
sameAs:
  - https://www.wikidata.org/wiki/Q1
references:
  - nonexistent-concept
---
`;
  const issues = check("services/orders.md", content, { baseIri, exists: () => false });
  expect("no errors", errors(issues) === 0, show(issues));
  expect(
    "one warning, for the broken relative reference only",
    warnings(issues) === 1 && (issues[0]?.message.includes("references") ?? false),
    show(issues)
  );
});

// The regression that motivated the fix: real bundles write targets as full
// IRIs under base_iri, and those were previously never checked at all.
section("relationships: full-IRI internal targets are checked", () => {
  const baseIri = "https://acme.example/knowledge/";
  const content = `---
type: Service
endpoint: https://api.acme.example/orders
http_method: GET
documentation: https://acme.example/docs
dependsOn:
  - ${baseIri}datasets/orders-db
  - ${baseIri}datasets/ghost
---
`;
  const present = new Set(["datasets/orders-db.md"]);
  const issues = check("services/orders.md", content, { baseIri, exists: (p) => present.has(p) });
  expect(
    "exactly one warning, naming the dangling IRI",
    warnings(issues) === 1 && (issues[0]?.message.includes("datasets/ghost") ?? false),
    show(issues)
  );
  expect("still no errors", errors(issues) === 0, show(issues));
});

section("relationships: a sibling-relative target resolves without a false warning", () => {
  const content = `---\ntype: Playbook\nrelatedTo:\n  - publishing-a-release\n---\n`;
  const present = new Set(["playbooks/publishing-a-release.md"]);
  const issues = check("playbooks/contributing.md", content, {
    baseIri: "https://acme.example/knowledge/",
    exists: (p) => present.has(p),
  });
  expect("no relation warning", !issues.some((i) => i.rule === "lokf/4-relations"), show(issues));
});

// A real audit of this bundle found this mistake in roughly half its concepts
// (see .lokf/knowledge/log.md, 2026-09-09): the generated schema requires a
// list for all ten RELATION_FIELDS, so a bare scalar - natural to write, and
// semantically a single target either way - fails real `lokf validate` even
// though this plugin previously validated it clean.
section("relationships: a bare scalar on a named relation field is flagged (schema requires a list)", () => {
  const baseIri = "https://acme.example/knowledge/";
  const target = `${baseIri}services/orders-api`;
  const exists = (p: string) => p === "services/orders-api.md";

  const scalar = check("services/a.md", `---\ntype: Reference\ndependsOn: ${target}\n---\n`, { baseIri, exists });
  expect(
    "scalar form warns, naming the field",
    warnings(scalar) === 1 && (scalar[0]?.message.includes("dependsOn") ?? false) && (scalar[0]?.message.includes("list") ?? false),
    show(scalar)
  );

  const list = check("services/a.md", `---\ntype: Reference\ndependsOn:\n  - ${target}\n---\n`, { baseIri, exists });
  expect("list form of the same target is clean", warnings(list) === 0, show(list));

  // relations[].target is a single reified relation's own target, never
  // itself multivalued - the "must be a list" rule must not reach it.
  const reified = check("misc/a.md", `---\ntype: Reference\nrelations:\n  - predicate: joinsWith\n    target: ${target}\n---\n`, {
    baseIri,
    exists,
  });
  expect("relations[].target is unaffected", warnings(reified) === 0, show(reified));
});

section("relations: predicate without a target is flagged", () => {
  const content = `---
type: Reference
relations:
  - predicate: joinsWith
---
`;
  const issues = check("misc/thing.md", content, { baseIri: "https://acme.example/knowledge/" });
  expect("one missing-target warning", warnings(issues) === 1 && (issues[0]?.message.includes("target") ?? false), show(issues));
});

section("unknown type: warning, never an error", () => {
  const issues = check("misc/thing.md", `---\ntype: Whatsit\n---\n`);
  expect(
    "one vocabulary warning",
    errors(issues) === 0 && warnings(issues) === 1 && issues[0]?.rule === "lokf/3-vocab",
    show(issues)
  );
});

section("a non-string type is a shape warning, not silence", () => {
  // A list or mapping where LOKF expects a single class name is a genuine
  // shape mistake - unlike a coercible scalar, which reads as text (YAML's
  // `type: 123` is exactly as unquoted as `lokf_version: 0.2` elsewhere in
  // this suite) and falls through to the ordinary vocabulary warning.
  const list = check("misc/thing.md", `---\ntype:\n  - Service\n---\n`);
  expect(
    "a list type warns about shape, not vocabulary",
    errors(list) === 0 && warnings(list) === 1 && list[0]?.rule === "lokf/3-vocab" && (list[0]?.message.includes("list") ?? false),
    show(list)
  );

  const numeric = check("misc/thing.md", `---\ntype: 123\n---\n`);
  expect(
    "a numeric type reads as text and hits the vocabulary warning",
    errors(numeric) === 0 && warnings(numeric) === 1 && (numeric[0]?.message.includes('"123"') ?? false),
    show(numeric)
  );

  const missing = check("misc/thing.md", `---\ntitle: No type at all\n---\n`);
  expect("a note with no LOKF fields and no type stays silent (ordinary vault note)", missing.length === 0, show(missing));
});

section("spaced 'Attested Computation' normalizes to the vocabulary class", () => {
  const issues = check("glossary/ac.md", `---\ntype: Attested Computation\n---\n`);
  expect("no vocabulary warning", !issues.some((i) => i.rule === "lokf/3-vocab"), show(issues));
});

const okfRules = (issues: LokfIssue[], prefix = "okf/") => issues.filter((i) => i.rule.startsWith(prefix));

section("OKF base layer - required type only when the note is a concept (§4.1)", () => {
  const plain = check("misc/note.md", `---\ntitle: Just a note\ntags: [x]\n---\n`);
  expect("a note with only generic frontmatter is left alone", okfRules(plain).length === 0, show(plain));

  const statusOnly = check("misc/reading.md", `---\nstatus: stable\ntags: [x]\n---\n`);
  expect("a note using only generic status/tags is left alone (no type-required)", okfRules(statusOnly, "okf/type-required").length === 0 && errors(statusOnly) === 0, show(statusOnly));

  const concept = check("misc/thing.md", `---\ndependsOn:\n  - other.md\n---\n`);
  expect("a concept-shaped note missing type errors (OKF §4.1/§11 REQUIRED)", okfRules(concept, "okf/type-required").length === 1 && errors(concept) === 1, show(concept));

  const off = check("misc/thing.md", `---\ndependsOn:\n  - other.md\n---\n`, { settings: { ...DEFAULT_SETTINGS, checkOkfBaseLayer: false } });
  expect("no OKF findings when the base layer is off", okfRules(off).length === 0, show(off));
});

section("OKF base layer - Attested Computation contract shape (§10)", () => {
  const bare = check("comp/rev.md", `---\ntype: Attested Computation\n---\n`);
  expect("missing runtime errors (OKF §10.2 REQUIRED)", okfRules(bare, "okf/attested-computation").some((i) => /runtime/.test(i.message) && i.severity === "error"), show(bare));
  expect("missing computation block warns (§10.3, advisory)", okfRules(bare, "okf/attested-computation").some((i) => /# Computation/.test(i.message) && i.severity === "warning"), show(bare));

  const wellFormed =
    `---\ntype: Attested Computation\nruntime: bigquery\nparameters:\n  - { name: year, type: integer, required: true }\n` +
    `executor:\n  resource: refs/run.md\n  receipt: [job_id]\nattester:\n  resource: refs/att.py\n---\n# Computation\n\n    SELECT 1\n`;
  const wf = check("comp/ok.md", wellFormed);
  expect("a well-formed Attested Computation draws no contract findings", okfRules(wf, "okf/attested-computation").length === 0, show(wf));

  const badParam = check("comp/p.md", `---\ntype: Attested Computation\nruntime: dbt\nparameters:\n  - { type: integer }\ncomputation: refs/x.sql\n---\n`);
  expect("a parameter missing a name warns (optional-field shape, never errors)", okfRules(badParam, "okf/attested-computation").some((i) => i.key === "parameters[0]" && i.severity === "warning") && errors(badParam) === 0, show(badParam));

  const badExecutor = check("comp/e.md", `---\ntype: Attested Computation\nruntime: python\nexecutor:\n  receipt: not-a-list\ncomputation: refs/x.py\n---\n`);
  expect("an executor missing resource warns", okfRules(badExecutor, "okf/attested-computation").some((i) => i.key === "executor"), show(badExecutor));
});

section("OKF base layer - v0.1 to v0.2 migration hints (§13)", () => {
  const legacy = check("m/old.md", `---\ntype: Metric\ntimestamp: 2026-01-01T00:00:00Z\n---\n`);
  expect("a legacy timestamp warns to migrate to generated (§13, tolerated - never errors)", okfRules(legacy, "okf/migration").some((i) => i.key === "timestamp" && i.severity === "warning") && errors(legacy) === 0, show(legacy));

  const citations = check("m/c.md", `---\ntype: Reference\n---\n# Notes\n\n# Citations\n\n- a\n`);
  expect("a body # Citations list warns to migrate to sources", okfRules(citations, "okf/migration").some((i) => /Citations/.test(i.message)), show(citations));

  const personalTimestamp = check("misc/note.md", `---\ntimestamp: 2026-01-01T00:00:00Z\ntags: [x]\n---\n`);
  expect("a plain note using timestamp (no type or LOKF fields) gets no migration nudge", okfRules(personalTimestamp).length === 0 && errors(personalTimestamp) === 0, show(personalTimestamp));
});

section("OKF base layer - reserved index.md / log.md structure (§8/§9)", () => {
  const nonRootIndex = check("services/index.md", `---\nokf_version: "0.2"\n---\n# Services\n`);
  expect("a non-root index.md carrying frontmatter errors (OKF §8/§11)", okfRules(nonRootIndex, "okf/index-structure")[0]?.severity === "error", show(nonRootIndex));

  const rootIndex = check("index.md", `---\nlokf_version: "0.2"\nbase_iri: https://acme.example/kb/\n---\n`, { isRoot: true });
  expect("a root index.md keeps its header exemption", okfRules(rootIndex, "okf/index-structure").length === 0, show(rootIndex));

  const badLog = check("log.md", `# Update Log\n\n## 2026/01/02\n\n* did a thing\n`);
  expect("a non-ISO log date heading errors (OKF §9 MUST)", okfRules(badLog, "okf/log-structure")[0]?.severity === "error", show(badLog));

  const goodLog = check("log.md", `# Update Log\n\n## 2026-01-02\n\n* did a thing\n`);
  expect("an ISO 8601 log date heading is fine", okfRules(goodLog, "okf/log-structure").length === 0, show(goodLog));

  const versionHeading = check("log.md", `# Changelog\n\n## 1.2.3\n\n* released\n`);
  expect("a version-number heading is not mistaken for a bad date", okfRules(versionHeading, "okf/log-structure").length === 0, show(versionHeading));

  const off = check("services/index.md", `---\nokf_version: "0.2"\n---\n`, { settings: { ...DEFAULT_SETTINGS, checkOkfBaseLayer: false } });
  expect("reserved-file structure checks respect the off switch", okfRules(off).length === 0, show(off));
});

section("mintExpectedId / id-consistency", () => {
  const baseIri = "https://acme-knowledge.example/knowledge/";
  expect(
    "mints a hyphenated concept path unchanged",
    mintExpectedId("services/acme-api.md", baseIri) ===
      "https://acme-knowledge.example/knowledge/services/acme-api",
    mintExpectedId("services/acme-api.md", baseIri)
  );
  expect(
    "percent-encodes a filename with a space",
    mintExpectedId("glossary/My Term.md", baseIri) === "https://acme-knowledge.example/knowledge/glossary/My%20Term",
    mintExpectedId("glossary/My Term.md", baseIri)
  );

  const matching = check(
    "services/acme-api.md",
    `---\ntype: Service\nendpoint: x\nhttp_method: GET\ndocumentation: y\nid: ${baseIri}services/acme-api\n---\n`,
    { baseIri, exists: () => true }
  );
  expect("no lokf/5-id warning when the id matches", !matching.some((i) => i.rule === "lokf/5-id"), show(matching));

  const unencoded = check(
    "glossary/My Term.md",
    `---\ntype: GlossaryTerm\ndefinition: x\nid: ${baseIri}glossary/My Term\n---\n`,
    { baseIri, exists: () => true }
  );
  expect(
    "the unencoded spelling is accepted too",
    !unencoded.some((i) => i.rule === "lokf/5-id"),
    show(unencoded)
  );
});

section("resolveRelationTarget kinds", () => {
  const baseIri = "https://acme.example/knowledge/";
  expect(
    "internal-iri",
    resolveRelationTarget(baseIri + "services/orders", baseIri).kind === "internal-iri",
    JSON.stringify(resolveRelationTarget(baseIri + "services/orders", baseIri))
  );
  expect(
    "external-iri",
    resolveRelationTarget("https://www.wikidata.org/wiki/Q1", baseIri).kind === "external-iri",
    JSON.stringify(resolveRelationTarget("https://www.wikidata.org/wiki/Q1", baseIri))
  );
  expect(
    "internal-relative",
    resolveRelationTarget("services/orders.md", baseIri).kind === "internal-relative",
    JSON.stringify(resolveRelationTarget("services/orders.md", baseIri))
  );
  expect(
    "fragment stripped from an internal IRI",
    resolveRelationTarget(baseIri + "services/orders#top", baseIri).resolvedPath === "services/orders",
    JSON.stringify(resolveRelationTarget(baseIri + "services/orders#top", baseIri))
  );
});

// YAML hands back numbers and booleans for unquoted scalars, and mappings/lists
// wherever an author nested something by mistake. Neither may reach a message as
// "[object Object]" - the reader has to be able to see what they actually wrote.
section("an unquoted numeric lokf_version reads as text", () => {
  const issues = check("index.md", `---\nlokf_version: 0.2\nbase_iri: https://acme.test/knowledge/\n---\n`, {
    isRoot: true,
  });
  expect("no version warning", !issues.some((i) => i.message.includes("lokf_version")), show(issues));
});

section("non-scalar values are named by shape, never stringified", () => {
  const header = check(
    "index.md",
    `---\nlokf_version: "0.2"\nbase_iri:\n  a: b\ncontext:\n  - x\npublisher:\n  type: [Organization]\n  id: x\n  name: y\n---\n`,
    { isRoot: true }
  );
  expect("a mapping base_iri is a structural error", errors(header) === 1, show(header));
  expect(
    "each message names the shape it found",
    header.every((i) => /<a (mapping|list)>/.test(i.message)),
    show(header)
  );

  const concept = check("misc/thing.md", `---\ntype: Reference\nid:\n  - a\n  - b\ngenre:\n  x: y\n---\n`, {
    baseIri: "https://acme.example/knowledge/",
  });
  expect(
    "a list id is flagged without stringifying it",
    concept.some((i) => i.rule === "lokf/5-id" && i.message.includes("<a list>")),
    show(concept)
  );
  expect(
    "nothing anywhere leaks [object Object]",
    ![...header, ...concept].some((i) => i.message.includes("[object Object]")),
    show([...header, ...concept])
  );
});

section("reserved files", () => {
  expect("non-root index.md yields nothing", check("services/index.md", "# Services\n").length === 0, "expected none");
  expect("log.md yields nothing", check("log.md", "# Change Log\n", { isRoot: true }).length === 0, "expected none");
  expect("a generated diataxis.md is reserved, never validated as a concept", check("diataxis.md", "# Diátaxis map\n").length === 0, "expected none");
});

// ---- Golden fixtures: real bundle directories, walked whole ----
// Diagnostic as much as confirmatory: a hand-maintained bundle drawing an
// *error* means the rule engine is too strict, so errors are asserted to be
// zero. Warnings are only counted and printed - a perfectly good bundle still
// draws them (a placeholder base_iri, a missing recommended field, a relation
// to a concept outside the walked set).

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  // Sorted so the walk order - and any failure output - is reproducible
  // rather than dependent on filesystem order.
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith(".")) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walkMarkdown(abs));
    else if (entry.endsWith(".md")) out.push(abs);
  }
  return out;
}

/** A `required` bundle must exist and hold at least one concept: a fixture
 *  whose directory got moved would otherwise "pass" by checking nothing. */
function validateBundle(
  name: string,
  knowledgeDir: string,
  opts: { required: boolean; transform?: (content: string) => string }
): void {
  const transform = opts.transform ?? ((c: string) => c);
  section(`golden fixture: ${name}`, () => {
    if (!existsSync(knowledgeDir)) {
      if (opts.required) expect("bundle directory is present", false, `nothing at ${knowledgeDir}`);
      else console.log(`  skip - nothing at ${knowledgeDir}`);
      return;
    }

    const concepts = walkMarkdown(knowledgeDir).map((abs) => ({
      path: relative(knowledgeDir, abs).split(sep).join("/"),
      content: transform(readFileSync(abs, "utf8")),
    }));
    if (!expect(`bundle holds concepts (${concepts.length} file(s))`, concepts.length > 0, `no .md under ${knowledgeDir}`)) {
      return;
    }

    const present = new Set(concepts.map((c) => c.path));
    const rootIndex = concepts.find((c) => c.path === "index.md");
    const baseIri = rootIndex ? readBaseIri(parse(rootIndex.content).data) : null;

    const found = concepts
      .map((c) => ({
        path: c.path,
        issues: check(c.path, c.content, { isRoot: !c.path.includes("/"), baseIri, exists: (p) => present.has(p) }),
      }))
      .filter((r) => r.issues.length > 0);

    const errCount = found.reduce((n, r) => n + errors(r.issues), 0);
    const warnCount = found.reduce((n, r) => n + warnings(r.issues), 0);
    expect("zero errors across the bundle", errCount === 0, found.map((r) => `${r.path}:\n${show(r.issues)}`).join("\n"));
    console.log(`  characterized - ${warnCount} warning(s), not asserted`);
  });
}

// ---- locator.ts: map a key path to its line/column in the raw frontmatter ----

section("locateFrontmatterKey - top-level scalar", () => {
  const raw = splitFrontmatter(
    `---\nlokf_version: "0.2"\nbase_iri: https://x.example/knowledge/\n---\n`
  ).raw;
  const lines = raw.split("\n");
  const loc = locateFrontmatterKey(raw, "base_iri");
  expect("resolves base_iri", loc !== null, "got null");
  if (loc) {
    expect("lands on the base_iri line", lines[loc.line] === "base_iri: https://x.example/knowledge/", lines[loc.line] ?? "");
    expect("key range covers the key", (lines[loc.line] ?? "").slice(loc.keyStart, loc.keyEnd) === "base_iri:", show([]));
    expect(
      "value range covers the value",
      (lines[loc.line] ?? "").slice(loc.valueStart, loc.valueEnd) === "https://x.example/knowledge/",
      (lines[loc.line] ?? "").slice(loc.valueStart, loc.valueEnd)
    );
  }
});

section("locateFrontmatterKey - one level of map nesting", () => {
  const raw = splitFrontmatter(
    `---\npublisher:\n  type: Person\n  id: https://x.example/knowledge/person/you\n  name: You\n---\n`
  ).raw;
  const lines = raw.split("\n");
  const type = locateFrontmatterKey(raw, "publisher.type");
  expect("resolves publisher.type", !!type && (lines[type.line] ?? "").trim() === "type: Person", show([]));
  const name = locateFrontmatterKey(raw, "publisher.name");
  expect("resolves publisher.name", !!name && (lines[name.line] ?? "").trim() === "name: You", show([]));
});

section("locateFrontmatterKey - list indices and item children", () => {
  const raw = splitFrontmatter(
    `---\nfields:\n  - name: a\n  - name: b\nrelations:\n  - predicate: about\n    target: ./x.md\n---\n`
  ).raw;
  const lines = raw.split("\n");
  const second = locateFrontmatterKey(raw, "fields[1]");
  expect("fields[1] lands on the second item", !!second && (lines[second.line] ?? "").trim() === "- name: b", show([]));
  const target = locateFrontmatterKey(raw, "relations[0].target");
  expect("relations[0].target lands on the target line", !!target && (lines[target.line] ?? "").trim() === "target: ./x.md", show([]));
});

// ---- A0: findings carry a key anchor a UI can jump to ----

section("locateFrontmatterKey - absent key and graceful fallback", () => {
  const raw = splitFrontmatter(`---\npublisher:\n  type: Person\n---\n`).raw;
  const lines = raw.split("\n");
  expect("absent top-level key returns null", locateFrontmatterKey(raw, "nonexistent") === null, "expected null");
  const partial = locateFrontmatterKey(raw, "publisher.bogus");
  expect(
    "unresolved child falls back to the deepest resolved container",
    !!partial && (lines[partial.line] ?? "").trim() === "publisher:",
    show([])
  );
});

section("locationToDocRange - block-relative location maps to document offsets", () => {
  const doc = `---\nlokf_version: "0.2"\nbase_iri: https://x.example/knowledge/\n---\n\n# Body\n`;
  const raw = splitFrontmatter(doc).raw;
  const loc = locateFrontmatterKey(raw, "base_iri");
  expect("base_iri located", loc !== null, "got null");
  if (loc) {
    const { from, to } = locationToDocRange(doc, loc);
    expect("range slices the value out of the whole document", doc.slice(from, to) === "https://x.example/knowledge/", doc.slice(from, to));
  }
});

section("issues carry a key anchor where one is nameable", () => {
  const idBase = { isRoot: true as const };
  const baseErr = check("index.md", `---\nlokf_version: "0.2"\nbase_iri: notaurl\n---\n`, idBase);
  expect("base_iri finding anchors to base_iri", baseErr.some((i) => i.key === "base_iri"), show(baseErr));

  const typeWarn = check("note.md", `---\ntype: Nonsense\n---\n`);
  expect("unknown type anchors to type", typeWarn.some((i) => i.key === "type"), show(typeWarn));

  const relWarn = check("note.md", `---\ntype: Reference\ndependsOn: ./missing.md\n---\n`, {
    baseIri: "https://x.example/knowledge/",
    exists: () => false,
  });
  expect("unresolved relation anchors to its field", relWarn.some((i) => i.key === "dependsOn"), show(relWarn));
});

// ---- §9.2: the shipped vocabulary manifest, with fallback ----

section("vocabulary manifest refreshes the plugin defaults", () => {
  expect("manifest carries a schema version", SCHEMA_VERSION.length > 0, SCHEMA_VERSION);
  expect("manifest validates whole", LOKF_VOCAB !== null, "LOKF_VOCAB was null (malformed manifest)");
  const defaults = pluginDefaultSettings();
  expect("known types gain Role from the pinned schema", defaults.knownTypes.includes("Role"), defaults.knownTypes.join(", "));
  expect(
    "predicates widen to the full RelationType vocabulary",
    ["wasAttributedTo", "measures", "memberOf", "holder"].every((p) => defaults.knownPredicates.includes(p)),
    defaults.knownPredicates.join(", ")
  );
  expect("the four Diataxis genres are unchanged", defaults.genreValues.length === 4, defaults.genreValues.join(", "));
});

section("a schema-refreshed type no longer warns", () => {
  const withRole = check("misc/lead.md", `---\ntype: Role\n---\n`, { settings: pluginDefaultSettings() });
  expect("Role is accepted under the manifest defaults", !withRole.some((i) => i.rule === "lokf/3-vocab"), show(withRole));
  const withoutManifest = check("misc/lead.md", `---\ntype: Role\n---\n`);
  expect("Role still warns under the hard-coded fallback", withoutManifest.some((i) => i.rule === "lokf/3-vocab"), show(withoutManifest));
});

// ---- C: the concept graph (forward/inverse adjacency, orphans) ----

section("buildConceptGraph - edges, inverse, grouping, and orphans", () => {
  const records: ConceptRecord[] = [
    { path: "a.md", type: "Service", id: null, targets: ["b.md"] },
    { path: "b.md", type: "Dataset", id: null, targets: [] },
    { path: "c.md", type: "Service", id: null, targets: ["b.md", "missing.md", "c.md"] },
    { path: "island.md", type: "Document", id: null, targets: [] },
  ];
  const g = buildConceptGraph(records);
  expect("b is linked to by a and c", (g.inbound.get("b.md") ?? []).sort().join(",") === "a.md,c.md", JSON.stringify([...g.inbound]));
  expect("a's only edge is to b", (g.outbound.get("a.md") ?? []).join(",") === "b.md", JSON.stringify(g.outbound.get("a.md")));
  expect("a non-concept target forms no edge", !(g.outbound.get("c.md") ?? []).includes("missing.md"), JSON.stringify(g.outbound.get("c.md")));
  expect("a self-link forms no edge", !(g.outbound.get("c.md") ?? []).includes("c.md"), JSON.stringify(g.outbound.get("c.md")));
  expect("two Service concepts are grouped by type", (g.byType.get("Service")?.length ?? 0) === 2, JSON.stringify([...g.byType.keys()]));
  const orphanPaths = g.orphans.map((r) => r.path).sort();
  expect("a, c, and island are orphans; b is not", orphanPaths.join(",") === "a.md,c.md,island.md", orphanPaths.join(","));
});

// ---- D: frontmatter autocomplete context detection ----

section("withinFrontmatter - only inside the opening --- … --- block", () => {
  const lines = ["---", "type: Reference", "---", "", "# Body"];
  const read = (i: number) => lines[i] ?? "";
  expect("the fence line 0 is not inside", !withinFrontmatter(read, lines.length, 0), "line 0");
  expect("a header line is inside", withinFrontmatter(read, lines.length, 1), "line 1");
  expect("the closing fence is not inside", !withinFrontmatter(read, lines.length, 2), "line 2");
  expect("the body is not inside", !withinFrontmatter(read, lines.length, 4), "line 4");
  const noFm = ["# Just a heading", "text"];
  expect("a note without frontmatter is never inside", !withinFrontmatter((i) => noFm[i] ?? "", noFm.length, 0), "no fm");
});

section("detectSuggestContext - inline key: value slots", () => {
  const one = (line: string, ch = line.length) => detectSuggestContext(() => line, 0, ch);
  expect("type: completes classes", one("type: Ref")?.kind === "type", JSON.stringify(one("type: Ref")));
  expect("type query is the partial", one("type: Ref")?.query === "Ref", JSON.stringify(one("type: Ref")));
  expect("genre: completes genres", one("genre: how")?.kind === "genre", JSON.stringify(one("genre: how")));
  expect("status: completes statuses", one("status: dra")?.kind === "status", JSON.stringify(one("status: dra")));
  expect("a relation field completes targets", one("dependsOn: ./x")?.kind === "target", JSON.stringify(one("dependsOn: ./x")));
  expect("relations target: completes targets", one("    target: ser")?.kind === "target", JSON.stringify(one("    target: ser")));
  expect("relations predicate: completes predicates", one("    predicate: dep")?.kind === "predicate", JSON.stringify(one("    predicate: dep")));
  expect("a non-LOKF key yields nothing", one("title: My note") === null, JSON.stringify(one("title: My note")));
  expect("empty value gives an empty query at the cursor", one("type: ")?.query === "", JSON.stringify(one("type: ")));
});

section("detectSuggestContext - list items resolve to their parent key", () => {
  const lines = ["---", "dependsOn:", "  - ser", "genre: reference", "  - x", "---"];
  const read = (i: number) => lines[i] ?? "";
  const item = detectSuggestContext(read, 2, read(2).length);
  expect("a relation-field list item completes targets", item?.kind === "target" && item.query === "ser", JSON.stringify(item));
  // A list item under a non-relation key (genre isn't multivalued) yields nothing.
  const under = detectSuggestContext(read, 4, read(4).length);
  expect("a list item under a non-relation key yields nothing", under === null, JSON.stringify(under));
});

// ---- E: safe quick-fixes (deterministic text edits) ----

function applyFixEdits(doc: string, edits: FixEdit[]): string {
  let out = doc;
  for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

section("computeFixes - base_iri terminator, type alias, scalar relation", () => {
  const headerDoc = `---\nlokf_version: "0.2"\nbase_iri: https://acme.example/knowledge\n---\n`;
  const headerIssues = check("index.md", headerDoc, { isRoot: true });
  const headerFixed = applyFixEdits(headerDoc, computeFixes(headerIssues, headerDoc, parse(headerDoc).data));
  expect("appends the missing base_iri terminator", headerFixed.includes("base_iri: https://acme.example/knowledge/"), headerFixed);

  const typeDoc = `---\ntype: runbook\n---\n`;
  const typeFixed = applyFixEdits(typeDoc, computeFixes(check("p.md", typeDoc), typeDoc, parse(typeDoc).data));
  expect("rewrites a known alias to its canonical class", typeFixed.includes("type: Playbook"), typeFixed);

  const relDoc = `---\ntype: Reference\ndependsOn: ./other.md\n---\n`;
  const relFixed = applyFixEdits(relDoc, computeFixes(check("r.md", relDoc, { baseIri: "https://x.example/knowledge/", exists: () => false }), relDoc, parse(relDoc).data));
  expect("converts a bare-scalar relation to a one-item list", /dependsOn:\n {2}- \.\/other\.md/.test(relFixed), relFixed);
});

section("computeFixes - only unambiguous fixes; owned/unknown values left alone", () => {
  // A base_iri that isn't a URL at all has no mechanical fix.
  const badUrl = `---\nlokf_version: "0.2"\nbase_iri: notaurl\n---\n`;
  expect("a non-URL base_iri is not fixed", computeFixes(check("index.md", badUrl, { isRoot: true }), badUrl, parse(badUrl).data).length === 0, "expected no fix");

  // An authority violation (github) is terminated and owned - never guessed.
  const authority = `---\nlokf_version: "0.2"\nbase_iri: https://github.com/acme/repo/knowledge/\n---\n`;
  expect("an authority violation is not auto-fixed", computeFixes(check("index.md", authority, { isRoot: true }), authority, parse(authority).data).length === 0, "expected no fix");

  // A truly unknown type (no alias) has no canonical to rewrite to.
  const unknownType = `---\ntype: Widget\n---\n`;
  expect("an unknown non-alias type is not rewritten", computeFixes(check("w.md", unknownType), unknownType, parse(unknownType).data).length === 0, "expected no fix");
});

// ---- §9.4: promote body links to typed relations (propose.ts) ----

section("extractBodyLinks - finds prose links, skips images and code", () => {
  const body =
    "This depends on [the loader](./loader.md).\n\n" +
    "![a diagram](diagram.png) is not a link.\n\n" +
    "Ignore `[code](x.md)` in a span and\n\n```\n[fenced](y.md)\n```\n";
  const links = extractBodyLinks(body);
  const targets = links.map((l) => l.targetRaw);
  expect("the prose link is extracted", targets.includes("./loader.md"), JSON.stringify(targets));
  expect("the image is not a link", !targets.includes("diagram.png"), JSON.stringify(targets));
  expect("the inline-code link is masked", !targets.includes("x.md"), JSON.stringify(targets));
  expect("the fenced link is masked", !targets.includes("y.md"), JSON.stringify(targets));
  const loader = links.find((l) => l.targetRaw === "./loader.md");
  expect("the surrounding sentence is captured", (loader?.sentence ?? "").startsWith("This depends on the loader"), loader?.sentence ?? "");
});

section("classifyLink - cue phrases pick the relation, else relatedTo", () => {
  expect("'depends on' -> dependsOn", classifyLink("This depends on the loader", "the loader").predicate === "dependsOn", "");
  expect("'part of' -> isPartOf", classifyLink("It is part of the pipeline", "the pipeline").predicate === "isPartOf", "");
  expect("'same as' -> sameAs", classifyLink("This is the same as the old metric", "the old metric").predicate === "sameAs", "");
  const none = classifyLink("Here is the loader", "the loader");
  expect("no cue -> relatedTo fallback", none.predicate === "relatedTo" && none.confidence < 0.5, JSON.stringify(none));
  const adj = classifyLink("It depends on the loader", "the loader");
  const far = classifyLink("It depends on quite a lot before we ever get anywhere near the loader", "the loader");
  expect("adjacency boosts confidence", adj.confidence > far.confidence, `${adj.confidence} vs ${far.confidence}`);
});

section("buildProposals - resolves, dedups, skips asserted, sorts by confidence", () => {
  const links: BodyLink[] = [
    { text: "loader", targetRaw: "./loader.md", sentence: "This depends on loader" },
    { text: "loader again", targetRaw: "loader.md", sentence: "It also depends on loader again" },
    { text: "glossary", targetRaw: "./glossary.md", sentence: "See glossary" },
    { text: "already", targetRaw: "./already.md", sentence: "It contains already" },
    { text: "external", targetRaw: "https://elsewhere.example/x", sentence: "From external" },
  ];
  const resolve = (raw: string): { path: string; bundle: string } | null => {
    if (raw.startsWith("http")) return null;
    const stem = raw.replace(/^\.\//, "").replace(/\.md$/, "");
    return { path: `${stem}.md`, bundle: stem };
  };
  const proposals = buildProposals(links, resolve, (p) => p === "already.md");
  const preds = proposals.map((p) => `${p.predicate}:${p.targetBundle}`);
  expect("the asserted target is skipped", !preds.some((p) => p.endsWith(":already")), JSON.stringify(preds));
  expect("the external link is dropped", !preds.some((p) => p.endsWith(":x")), JSON.stringify(preds));
  expect("the duplicate dependsOn:loader collapses to one", preds.filter((p) => p === "dependsOn:loader").length === 1, JSON.stringify(preds));
  expect("glossary is proposed via references cue", preds.includes("references:glossary"), JSON.stringify(preds));
  expect("proposals are sorted most-confident first", proposals.every((p, i) => i === 0 || proposals[i - 1]!.confidence >= p.confidence), "");
});

// ---- F: report finding filter ----

section("issueMatchesFilter - text, sev:, rule:, and AND of terms", () => {
  const issue = { severity: "warning", rule: "lokf/4-relations", message: "dependsOn does not resolve", key: "dependsOn" };
  const path = "guides/setup.md";
  expect("an empty query matches everything", issueMatchesFilter(path, issue, ""), "expected true");
  expect("a plain term matches the message", issueMatchesFilter(path, issue, "resolve"), "expected true");
  expect("a plain term matches the path", issueMatchesFilter(path, issue, "guides"), "expected true");
  expect("a plain term matches the key", issueMatchesFilter(path, issue, "dependson"), "expected true");
  expect("a non-matching term fails", !issueMatchesFilter(path, issue, "publisher"), "expected false");
  expect("sev:warn matches a warning", issueMatchesFilter(path, issue, "sev:warn"), "expected true");
  expect("sev:error does not match a warning", !issueMatchesFilter(path, issue, "sev:error"), "expected false");
  expect("rule: matches the rule id", issueMatchesFilter(path, issue, "rule:lokf/4"), "expected true");
  expect("rule: excludes a different rule", !issueMatchesFilter(path, issue, "rule:lokf/2"), "expected false");
  expect("all terms must match (AND)", issueMatchesFilter(path, issue, "sev:warning resolve"), "expected true");
  expect("one failing term fails the whole query", !issueMatchesFilter(path, issue, "sev:warning publisher"), "expected false");
});

section("topLevelKey - the frontmatter key a finding groups under", () => {
  expect("a plain key is itself", topLevelKey("base_iri") === "base_iri", topLevelKey("base_iri"));
  expect("a nested key drops the sub-path", topLevelKey("publisher.type") === "publisher", topLevelKey("publisher.type"));
  expect("an indexed key drops the index and sub-path", topLevelKey("relations[2].target") === "relations", topLevelKey("relations[2].target"));
  expect("a list-field key drops the index", topLevelKey("fields[0]") === "fields", topLevelKey("fields[0]"));
  expect("no key groups as empty (a whole-note finding)", topLevelKey(undefined) === "", `"${topLevelKey(undefined)}"`);
});

const trust = (issues: LokfIssue[]) => issues.filter((i) => i.rule === "lokf/5-trust" || i.rule === "lokf/5-lifecycle");

section("well-formed §5 fields draw no trust findings", () => {
  const content =
    `---\ntype: Reference\ngenerated:\n  by: process:lokf-librarian\n  at: 2026-01-01T00:00:00Z\n` +
    `verified:\n  - by: human:alice\n    at: 2026-02-01\nstatus: draft\nstale_after: 2026-12-01\n` +
    `sources:\n  - resource: https://example.org/doc\n---\n`;
  const issues = check("misc/thing.md", content, { settings: pluginDefaultSettings() });
  expect("no §5 shape findings on a well-formed concept", trust(issues).length === 0, show(trust(issues)));
});

section("a plain bundle with no §5 fields draws no trust findings", () => {
  const issues = check("misc/thing.md", `---\ntype: Reference\ntitle: A thing\n---\n`);
  expect("nothing fires when §5 is absent", trust(issues).length === 0, show(trust(issues)));
});

section("§5 shape findings: OKF-REQUIRED fields error, the rest warn", () => {
  const badVerified = check("m/a.md", `---\ntype: Reference\nverified: yes\n---\n`);
  expect("a scalar verified warns", trust(badVerified).some((i) => i.key === "verified") && errors(badVerified) === 0, show(badVerified));

  const noBy = check("m/b.md", `---\ntype: Reference\ngenerated:\n  at: 2026-01-01\n---\n`);
  expect("generated missing by errors (OKF §5.2 REQUIRED)", trust(noBy).some((i) => i.rule === "lokf/5-trust" && i.severity === "error"), show(noBy));

  const badActor = check("m/c.md", `---\ntype: Reference\nverified:\n  - by: alice\n    at: 2026-01-01\n---\n`);
  expect("a non-actor verified by warns (not spec-REQUIRED)", trust(badActor).some((i) => i.key === "verified[0].by" && i.severity === "warning"), show(badActor));

  const badStatus = check("m/d.md", `---\ntype: Reference\nstatus: archived\n---\n`, { settings: pluginDefaultSettings() });
  expect("an out-of-vocabulary status warns", trust(badStatus).some((i) => i.rule === "lokf/5-lifecycle" && i.key === "status" && i.severity === "warning"), show(badStatus));

  const badStale = check("m/e.md", `---\ntype: Reference\nstale_after: someday\n---\n`);
  expect("a non-date stale_after warns", trust(badStale).some((i) => i.key === "stale_after"), show(badStale));

  const badSource = check("m/f.md", `---\ntype: Reference\nsources:\n  - title: no resource here\n---\n`);
  expect("a source missing resource errors (OKF §5.1 REQUIRED)", trust(badSource).some((i) => i.key === "sources[0]" && i.severity === "error"), show(badSource));
});

section("OKF conformance can be relaxed to warnings temporarily (enforceOkfConformance)", () => {
  const relaxed: LokfSettings = { ...DEFAULT_SETTINGS, enforceOkfConformance: false };

  const noType = check("misc/thing.md", `---\ndependsOn:\n  - other.md\n---\n`, { settings: relaxed });
  expect("a required-type error downgrades to a warning, still visible", okfRules(noType, "okf/type-required").some((i) => i.severity === "warning") && errors(noType) === 0, show(noType));

  const noBy = check("m/b.md", `---\ntype: Reference\ngenerated:\n  at: 2026-01-01\n---\n`, { settings: relaxed });
  expect("a §5 REQUIRED error downgrades too", trust(noBy).some((i) => i.severity === "warning") && errors(noBy) === 0, show(noBy));

  const badLog = check("log.md", `## 2026/01/02\n`, { settings: relaxed });
  expect("a reserved-structure error downgrades too", okfRules(badLog, "okf/log-structure").some((i) => i.severity === "warning") && errors(badLog) === 0, show(badLog));

  const bareField = check("d/t.md", `---\ntype: Table\nfields: not-a-list\n---\n`, { settings: relaxed });
  expect("a LOKF structural error is NOT relaxed", errors(bareField) >= 1, show(bareField));
});

section("the trust-shape check can be switched off", () => {
  const off: LokfSettings = { ...DEFAULT_SETTINGS, checkTrustShape: false };
  const issues = check("m/g.md", `---\ntype: Reference\nverified: yes\nstatus: archived\n---\n`, { settings: off });
  expect("no trust findings when disabled", trust(issues).length === 0, show(trust(issues)));
});
section("the by actor pattern matches lokf.yaml (strict: human/process/producer-version)", () => {
  const ok = (by: string) =>
    trust(check("m/a.md", `---\ntype: Reference\ngenerated:\n  by: ${by}\n  at: 2026-01-01\n---\n`)).length === 0;
  expect("human:<id> is a valid actor", ok("human:jsmith@acme"), "human: rejected");
  expect("process:<id> is a valid actor", ok("process:metrics-nightly"), "process: rejected");
  expect("<producer>/<version> is a valid actor", ok("reference_agent/gemini-2.5-pro"), "producer/version rejected");
  // A source's `author` admits `team:` etc., but a `by` slot does not.
  expect("team:<id> is rejected for a by slot", !ok("team:analytics"), "team: should not pass a by slot");
  expect("a bare name is rejected", !ok("John Smith"), "bare name should not pass");
});

section("affordances - concept block builds, tags genre, replaces in place, idempotent", () => {
  const links = [
    { predicate: "dependsOn", linktext: "Beta" },
    { predicate: "isPartOf", linktext: "Alpha" },
    { predicate: "dependsOn", linktext: "Beta" }, // duplicate
  ];
  const block = buildConceptBlock(links, "how-to");
  expect("a block is produced for real links", block !== null, "expected a block");
  expect("a canonical genre becomes a tag", (block ?? "").includes("#how-to"), block ?? "null");
  expect("duplicates are collapsed", (block?.match(/\[\[Beta\]\]/g) ?? []).length === 1, block ?? "null");
  expect("entries sort by predicate then target (dependsOn Beta before isPartOf Alpha)", (block ?? "").indexOf("[[Beta]] (dependsOn)") < (block ?? "").indexOf("[[Alpha]] (isPartOf)"), block ?? "null");
  expect("genre alone still yields a block", buildConceptBlock([], "reference") !== null, "expected a block");
  expect("a non-canonical genre earns no tag", buildConceptBlock([], "guide") === null, "expected null");
  expect("no links and no genre yields no block", buildConceptBlock([], null) === null, "expected null");

  const doc = "---\ntype: Reference\n---\n\nBody text.\n";
  const once = applyConceptBlock(doc, links, "how-to");
  expect("block is appended to a note without one", once !== null && once.includes("<!-- lokf:related -->"), once ?? "null");
  expect("body prose is preserved", (once ?? "").includes("Body text."), once ?? "null");
  const twice = applyConceptBlock(once ?? "", links, "how-to");
  expect("re-running with the same inputs is a no-op", twice === null, twice ?? "changed");
  const changed = applyConceptBlock(once ?? "", [{ predicate: "references", linktext: "Gamma" }], "how-to");
  expect("changed inputs replace in place, never append a second block", changed !== null && (changed.match(/<!-- lokf:related -->/g) ?? []).length === 1, changed ?? "null");
  const removed = applyConceptBlock(once ?? "", [], null);
  expect("nothing to project removes an existing block", removed !== null && !(removed ?? "").includes("lokf:related"), removed ?? "null");
});

section("affordances - Diátaxis map groups by genre across all four quadrants", () => {
  const entries = [
    { genre: "tutorial", linktext: "Learn" },
    { genre: "reference", linktext: "Spec" },
    { genre: "tutorial", linktext: "Learn" }, // duplicate
  ];
  const block = buildDiataxisBlock(entries);
  const headings = ["## Tutorials", "## How-to guides", "## Reference", "## Explanation"];
  expect("all four quadrant headings appear", headings.every((h) => block.includes(h)), block);
  expect("an empty quadrant reads 'No concepts yet.'", block.includes("_No concepts yet._"), block);
  expect("a duplicate entry is collapsed", (block.match(/\[\[Learn\]\]/g) ?? []).length === 1, block);
  const note = newDiataxisNote(entries, TEST_HEADER);
  expect("a fresh note carries a human title above the block", note.includes("\n---\n# Diátaxis map\n"), note);
  expect("re-generating the same map is a no-op", applyDiataxisBlock(note, entries) === null, "expected no change");
});


section("implicit bundle roots: the vault says what it is; a workshop with no exhibition is left alone", () => {
  const j = (x: unknown) => JSON.stringify(x);
  expect("a root index.md carrying a header makes the whole vault the bundle", j(implicitBundleRoots(true, false, false)) === j([""]), j(implicitBundleRoots(true, false, false)));
  expect("…and wins over a knowledge_bundle/ folder inside it", j(implicitBundleRoots(true, true, false)) === j([""]), j(implicitBundleRoots(true, true, false)));
  expect("knowledge_bundle/index.md in a plain notes vault becomes the root", j(implicitBundleRoots(false, true, false)) === j([VISIBLE_BUNDLE_FOLDER]), j(implicitBundleRoots(false, true, false)));
  expect("neither header nor folder: no bundle, nothing scanned", j(implicitBundleRoots(false, false, false)) === j([]), j(implicitBundleRoots(false, false, false)));
  expect("break-glass: the same vault read as one whole-vault bundle", j(implicitBundleRoots(false, false, true)) === j([""]), j(implicitBundleRoots(false, false, true)));
  expect("break-glass does not override a detected knowledge_bundle/", j(implicitBundleRoots(false, true, true)) === j([VISIBLE_BUNDLE_FOLDER]), j(implicitBundleRoots(false, true, true)));
  expect("the convention's name is the one lokf-sidecar lays down", VISIBLE_BUNDLE_FOLDER === "knowledge_bundle", VISIBLE_BUNDLE_FOLDER);
});

section("Diátaxis map is a record the registrar accepts: Document header, minted id, plugin provenance", () => {
  const entries = [{ genre: "how-to", linktext: "services/example-service-a" }];
  const fresh = newDiataxisNote(entries, TEST_HEADER);
  expect("starts with frontmatter", fresh.startsWith("---\ntype: Document\n"), fresh.slice(0, 40));
  expect("carries the minted id", fresh.includes("\nid: https://acme.example/knowledge/diataxis\n"), fresh);
  expect("carries genre: reference", fresh.includes("\ngenre: reference\n"), fresh);
  expect("generated.by is the plugin as an OKF §7 producer actor", fresh.includes("\ngenerated:\n  by: lokf-registrar/0.0.0-test\n  at: \"2026-09-12T15:00:00Z\"\n---\n"), fresh);
  expect("title heading follows the frontmatter", fresh.includes("---\n# Diátaxis map\n\n<!-- lokf:diataxis -->"), fresh);
  const fm = parse(fresh).data;
  expect("the frontmatter parses back with type Document", fm["type"] === "Document" && typeof fm["generated"] === "object", JSON.stringify(fm));
  expect("without a base_iri the id line is simply omitted", !newDiataxisNote(entries, { ...TEST_HEADER, id: null }).includes("\nid:"), "id line present");
  expect("frontmatter alone ends with the closing fence", diataxisFrontmatter(TEST_HEADER).endsWith("---\n"), diataxisFrontmatter(TEST_HEADER).slice(-10));

  // An older, headerless map gains the header on its next refresh - even when
  // the block itself is already current.
  const legacy = `# Diátaxis map\n\n${buildDiataxisBlock(entries)}\n`;
  const upgraded = applyDiataxisBlock(legacy, entries, TEST_HEADER);
  expect("a headerless map gains the header", upgraded !== null && upgraded.startsWith("---\ntype: Document\n") && upgraded.includes("# Diátaxis map"), String(upgraded).slice(0, 80));
  expect("a second pass is a no-op", applyDiataxisBlock(upgraded!, entries, TEST_HEADER) === null, "expected null");

  // A changed block refreshes the plugin-written stamp; a human-written one is left alone.
  const later = { ...TEST_HEADER, generatedAt: "2026-10-01T09:00:00Z" };
  const changed = applyDiataxisBlock(fresh, [...entries, { genre: "reference", linktext: "glossary/term" }], later);
  expect("a changed block refreshes generated.at", changed !== null && changed.includes('at: "2026-10-01T09:00:00Z"') && !changed.includes("2026-09-12T15:00:00Z"), String(changed));
  const human = fresh.replace("by: lokf-registrar/0.0.0-test", "by: human:ada");
  const humanChanged = applyDiataxisBlock(human, [...entries, { genre: "reference", linktext: "glossary/term" }], later);
  expect("a human-authored generated block keeps its stamp", humanChanged !== null && humanChanged.includes('at: "2026-09-12T15:00:00Z"'), String(humanChanged));
  expect("refreshGeneratedAt is null when nothing matches", refreshGeneratedAt("# no frontmatter\n", "2026-01-01T00:00:00Z") === null, "expected null");
  expect("an unchanged block leaves the stamp alone", applyDiataxisBlock(fresh, entries, later) === null, "expected null");

  // The stamp refresh copes with how a frontmatter block may actually be written,
  // and touches nothing but the plugin's own stamp inside the frontmatter.
  const more = [...entries, { genre: "reference", linktext: "glossary/term" }];
  const crlf = fresh.replace(/\n/g, "\r\n");
  const crlfChanged = applyDiataxisBlock(crlf, more, later);
  expect("a CRLF map still refreshes its stamp", crlfChanged !== null && crlfChanged.includes('at: "2026-10-01T09:00:00Z"'), String(crlfChanged).slice(0, 220));
  const unquoted = fresh.replace('at: "2026-09-12T15:00:00Z"', "at: 2026-09-12T15:00:00Z");
  const requoted = refreshGeneratedAt(unquoted, "2026-10-01T09:00:00Z");
  expect("an unquoted stamp is refreshed, and quoted", requoted !== null && requoted.includes('  at: "2026-10-01T09:00:00Z"\n---'), String(requoted));
  const otherProcess = fresh.replace("by: lokf-registrar/0.0.0-test", "by: process:lokf-librarian");
  expect("another process's generated block is never re-stamped", refreshGeneratedAt(otherProcess, "2026-10-01T09:00:00Z") === null, "expected null");
  const formerName = fresh.replace("by: lokf-registrar/0.0.0-test", "by: lokf-enforcer/0.4.0");
  const formerRestamped = refreshGeneratedAt(formerName, "2026-10-01T09:00:00Z");
  expect("a map stamped under the plugin's former name (lokf-enforcer) is still its own and is re-stamped", formerRestamped !== null && formerRestamped.includes('by: lokf-enforcer/0.4.0\n  at: "2026-10-01T09:00:00Z"'), String(formerRestamped));
  const bodyCopy = `${fresh}\ngenerated:\n  by: lokf-registrar/0.0.0-test\n  at: "2020-01-01T00:00:00Z"\n`;
  const bodyKept = refreshGeneratedAt(bodyCopy, "2026-10-01T09:00:00Z");
  expect("a generated mapping in the body is left alone; only the frontmatter stamp moves", bodyKept !== null && bodyKept.includes('at: "2020-01-01T00:00:00Z"') && bodyKept.includes('at: "2026-10-01T09:00:00Z"'), String(bodyKept));
  expect("a fenceless document is not frontmatter", refreshGeneratedAt("type: Document\ngenerated:\n  by: lokf-registrar/1\n  at: x\n", "2026-10-01T09:00:00Z") === null, "expected null");
});

section("field reference - covers the header fields and frames base_iri as an identifier", () => {
  const byName = new Map(LOKF_FIELD_DOCS.map((f) => [f.name, f.description]));
  for (const key of ["lokf_version", "base_iri", "type", "id", "genre", "status", "verified", "relations"]) {
    expect(`documents ${key}`, byName.has(key), `missing ${key}`);
  }
  const baseIri = byName.get("base_iri") ?? "";
  expect(
    "base_iri is framed as an identifier that need not resolve",
    /identifier/i.test(baseIri) && /need not resolve/i.test(baseIri),
    baseIri
  );
  expect("every field doc carries a non-empty description", LOKF_FIELD_DOCS.every((f) => f.description.trim().length > 0), "empty description");

  // Resolution: the description flows straight from the schema manifest,
  // unchanged - the schema is the single source of truth; this module only
  // picks the fields and their order.
  const resolved = resolveFieldDocs([{ name: "title", description: "STRAIGHT FROM THE SCHEMA" }]);
  expect("the schema's description flows through unchanged", resolved.find((f) => f.name === "title")?.description === "STRAIGHT FROM THE SCHEMA", "schema description not used");
  expect("a FIELD_ORDER field the manifest doesn't describe is dropped", resolved.length === 1, "undescribed fields not dropped");

  // Drift guard: every surfaced field must be a real, described schema slot, so
  // a rename/removal drops it and the length check below fails.
  const manifestSlots = new Set(((lokfVocab as { slots?: { name: string }[] }).slots ?? []).map((s) => s.name));
  expect(
    "every FIELD_ORDER entry is a real schema slot",
    LOKF_FIELD_DOCS.length === FIELD_ORDER.length && LOKF_FIELD_DOCS.every((f) => manifestSlots.has(f.name)),
    "a FIELD_ORDER entry names a slot the schema doesn't have"
  );

  // Conciseness guard: schema descriptions must stay short enough for a one-row
  // lookup (the reason they were tightened upstream) - catches a regression.
  const longest = Math.max(...LOKF_FIELD_DOCS.map((f) => f.description.length));
  expect("every field description stays modal-sized (<= 400 chars)", longest <= 400, `longest description is ${longest} chars`);
});
// (a) the lokf-sidecar skeleton, with its <PLACEHOLDER> tokens filled in as
// a real project would. scripts/fixtures/sidecar-skeleton is a frozen copy
// of lokf-agent-skills' skills/lokf-sidecar/templates/knowledge - a golden
// fixture, refreshed deliberately from a tagged release, never read live from
// an installed (and git-ignored) skill.
validateBundle("lokf-sidecar template skeleton", join(repoRoot, "scripts", "fixtures", "sidecar-skeleton"), {
  required: true,
  transform: (c) =>
    c
      .replaceAll("<BASE_IRI>", "https://acme.example/knowledge/")
      .replaceAll("<PROJ_NAME>", "Acme")
      .replaceAll("<PROJ_DESC>", "Acme's knowledge bundle.")
      .replaceAll("<PROJ_SLUG>", "acme")
      .replaceAll("<OWNER_SLUG>", "acme-maintainer")
      .replaceAll("<OWNER_NAME>", "Acme Maintainer")
      .replaceAll("<TODAY>", "2026-01-01"),
});

// (b) this repo's own bundle.
validateBundle("lokf-registrar's own .lokf/knowledge", join(repoRoot, ".lokf", "knowledge"), { required: true });

// (c) any other real bundle, opt-in so this suite stays hermetic - its result
// must not depend on what happens to sit next to the checkout. Point it at a
// curated bundle to check the rules against one:
//   LOKF_EXTRA_BUNDLE=../lokf-agent-skills/.lokf/knowledge npm run smoke-test
const extraBundle = process.env["LOKF_EXTRA_BUNDLE"];
if (extraBundle) validateBundle(`external bundle (${extraBundle})`, extraBundle, { required: true });

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} - ${failures} failing expectation(s)`);
process.exit(failures === 0 ? 0 : 1);
