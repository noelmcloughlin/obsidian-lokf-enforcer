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
  readBaseIri,
  splitFrontmatter,
  mintExpectedId,
  resolveRelationTarget,
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
sameAs: https://www.wikidata.org/wiki/Q1
references: nonexistent-concept
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
  const content = `---\ntype: Playbook\nrelatedTo: publishing-a-release\n---\n`;
  const present = new Set(["playbooks/publishing-a-release.md"]);
  const issues = check("playbooks/contributing.md", content, {
    baseIri: "https://acme.example/knowledge/",
    exists: (p) => present.has(p),
  });
  expect("no relation warning", !issues.some((i) => i.rule === "lokf/4-relations"), show(issues));
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
      .replaceAll("<OWNER_SLUG>", "acme-org")
      .replaceAll("<OWNER_NAME>", "Acme Org")
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
