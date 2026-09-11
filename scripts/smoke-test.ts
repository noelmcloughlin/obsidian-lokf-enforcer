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
import { load as loadYaml } from "js-yaml";
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
  DEFAULT_SETTINGS,
  type LokfIssue,
  type LokfSettings,
} from "../src/validator";

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
  return validateLokfConcept(
    path,
    hasFm,
    data,
    opts.isRoot ?? false,
    opts.baseIri ?? null,
    opts.settings ?? DEFAULT_SETTINGS,
    opts.exists
  );
}

const errors = (issues: LokfIssue[]) => issues.filter((i) => i.severity === "error").length;
const warnings = (issues: LokfIssue[]) => issues.filter((i) => i.severity === "warning").length;
const show = (issues: LokfIssue[]) => JSON.stringify(issues, null, 2);

// Fixture 1: the real .lokf/knowledge/index.md header from okf-enforcer, verbatim.
section("real .lokf/knowledge/index.md header (placeholder base_iri)", () => {
  const content = `---
lokf_version: "0.2"
okf_version: "0.2"
base_iri: https://okf-enforcer.example/knowledge/
context: https://w3id.org/lokf/context.jsonld
title: OKF Enforcer Knowledge Bundle
description: Validate and enforce the Open Knowledge Format (OKF v0.2) across an Obsidian vault.
license: https://creativecommons.org/licenses/by/4.0/
publisher:
  type: Person
  id: https://okf-enforcer.example/knowledge/org/martinforreal
  name: MartinForReal
---

# OKF Enforcer Knowledge Bundle
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
    readBaseIri(parse(content).data) === "https://okf-enforcer.example/knowledge/",
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

section("base_iri missing trailing slash", () => {
  const issues = check("index.md", `---\nlokf_version: "0.2"\nbase_iri: https://acme.example/knowledge\n---\n`, {
    isRoot: true,
  });
  expect("one structural error", errors(issues) === 1, show(issues));
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

section("bundle root normalizes, and a dot-folder root is refused", () => {
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
    "no roots configured: every path is the implicit whole-vault bundle",
    resolveBundleRoot("anything/at/all.md", []) === "",
    String(resolveBundleRoot("anything/at/all.md", []))
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
  expect("three warnings (endpoint/http_method/documentation)", warnings(issues) === 3, show(issues));
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
  expect("a genuinely missing type stays silent (OKF's error to raise)", missing.length === 0, show(missing));
});

section("spaced 'Attested Computation' normalizes to the vocabulary class", () => {
  const issues = check("glossary/ac.md", `---\ntype: Attested Computation\n---\n`);
  expect("no vocabulary warning", !issues.some((i) => i.rule === "lokf/3-vocab"), show(issues));
});

section("mintExpectedId / id-consistency", () => {
  const baseIri = "https://okf-enforcer.example/knowledge/";
  expect(
    "matches the real services/okf-enforcer-plugin.md fixture",
    mintExpectedId("services/okf-enforcer-plugin.md", baseIri) ===
      "https://okf-enforcer.example/knowledge/services/okf-enforcer-plugin",
    mintExpectedId("services/okf-enforcer-plugin.md", baseIri)
  );
  expect(
    "percent-encodes a filename with a space",
    mintExpectedId("glossary/My Term.md", baseIri) === "https://okf-enforcer.example/knowledge/glossary/My%20Term",
    mintExpectedId("glossary/My Term.md", baseIri)
  );

  const matching = check(
    "services/okf-enforcer-plugin.md",
    `---\ntype: Service\nendpoint: x\nhttp_method: GET\ndocumentation: y\nid: ${baseIri}services/okf-enforcer-plugin\n---\n`,
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

// (a) the lokf-scaffolding skeleton, with its <PLACEHOLDER> tokens filled in as
// a real project would. scripts/fixtures/scaffolding-skeleton is a frozen copy
// of lokf-agent-skills' skills/lokf-scaffolding/templates/knowledge - a golden
// fixture, refreshed deliberately from a tagged release, never read live from
// an installed (and git-ignored) skill.
validateBundle("lokf-scaffolding template skeleton", join(repoRoot, "scripts", "fixtures", "scaffolding-skeleton"), {
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
validateBundle("lokf-enforcer's own .lokf/knowledge", join(repoRoot, ".lokf", "knowledge"), { required: true });

// (c) any other real bundle, opt-in so this suite stays hermetic - its result
// must not depend on what happens to sit next to the checkout. Point it at a
// curated bundle to check the rules against one:
//   LOKF_EXTRA_BUNDLE=../lokf-agent-skills/.lokf/knowledge npm run smoke-test
const extraBundle = process.env["LOKF_EXTRA_BUNDLE"];
if (extraBundle) validateBundle(`external bundle (${extraBundle})`, extraBundle, { required: true });

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} - ${failures} failing expectation(s)`);
process.exit(failures === 0 ? 0 : 1);
