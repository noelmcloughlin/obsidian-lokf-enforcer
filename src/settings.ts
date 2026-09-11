// settings.ts - the LOKF Enforcer settings tab.
//
// Declarative (Obsidian 1.13.0+): the tab returns definitions rather than
// building DOM, so every setting is indexed by Obsidian's settings search.
import { App, PluginSettingTab } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type LokfPlugin from "./main";
import type { LokfSettings } from "./validator";
import { joinCsv, parseCsv, hiddenRootSegment } from "./validator";
import { SCHEMA_VERSION } from "./vocab";

/** Obsidian's own deep link into the community-plugin browser. Opening it is
 *  the most this plugin ever does about its sibling: the user installs and
 *  enables it themselves, exactly as they would any other plugin. */
const OKF_ENFORCER_URI = "obsidian://show-plugin?id=okf-enforcer";

type SettingKey = keyof LokfSettings;

/** Control keys the tab exposes that aren't stored in the synced settings
 *  object: the device-local disable flag lives in localStorage and is
 *  read/written through the overridden get/setControlValue below. */
type ControlKey = SettingKey | "disabledOnDevice";

/** Settings a user edits as comma-separated text but that are stored - and
 *  validated against - as string arrays. */
const CSV_KEYS = new Set<SettingKey>([
  "knownTypes",
  "genreValues",
  "knownPredicates",
  "conceptStatuses",
  "authorityDenylist",
  "placeholderDomains",
  "escalateToError",
  "fieldAliases",
  "excludeFolders",
  "bundleRoots",
]);

function isCsvKey(key: string): key is SettingKey {
  return CSV_KEYS.has(key as SettingKey);
}

export class LokfSettingTab extends PluginSettingTab {
  plugin: LokfPlugin;

  constructor(app: App, plugin: LokfPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** The CSV-backed settings are lists in storage and text in the UI, so they
   *  are joined on the way out and split on the way back in. */
  getControlValue(key: string): unknown {
    if (key === "disabledOnDevice") return this.plugin.isDisabledOnDevice();
    if (isCsvKey(key)) return joinCsv(this.plugin.settings[key] as string[]);
    return super.getControlValue(key);
  }

  /** Persisting goes through the plugin's own saveSettings() rather than the
   *  inherited write, which would drop the sibling-notice flag stored beside
   *  the settings. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    // The device-local flag isn't part of the synced settings object; it is
    // persisted to localStorage through the plugin, which also re-syncs the
    // status bar, inline underlines, and active verdict.
    if (key === "disabledOnDevice") {
      this.plugin.setDisabledOnDevice(Boolean(value));
      this.refreshDomState();
      return;
    }
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    if (isCsvKey(key)) settings[key] = parseCsv(String(value));
    else settings[key] = value;
    await this.plugin.saveSettings();
    // A cached base_iri may belong to a root that no longer exists in this
    // shape once the set of bundle roots changes.
    if (key === "bundleRoots") this.plugin.invalidateBaseIriCache();
    // Toggling inline diagnostics changes a registered editor extension's
    // behaviour; ask every open editor to reconfigure so it repaints at once
    // rather than on the next keystroke. Escalating a rule to an error changes
    // what the same extension paints, so it wants the same repaint.
    if (key === "inlineDiagnostics" || key === "escalateToError") this.plugin.app.workspace.updateOptions();
    // A toggle can gate another row (see "Known predicates"), and a `disabled`
    // predicate is only re-evaluated when asked. This is the CSS-only refresh,
    // not a re-render, so it is cheap enough to run on every change.
    this.refreshDomState();
  }

  getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
    return [
      {
        type: "group",
        heading: "This device",
        items: [
          {
            name: "Disable LOKF Enforcer on this device",
            desc: "Silence the status bar, inline underlines, autocomplete, and scanning on this device only. Stored per-device and never synced, so the same vault opened on another device keeps its own setting - useful when a vault is synced to a phone.",
            aliases: ["disable", "device", "off", "mobile", "phone", "local", "turn off"],
            control: { type: "toggle", key: "disabledOnDevice" },
          },
        ],
      },
      {
        type: "group",
        heading: "Sibling plugin",
        items: [
          {
            // There is no public API for "is plugin X installed" (reading
            // `app.plugins` is undocumented and flagged in community review),
            // so this is offered unconditionally rather than only when
            // "not detected".
            name: "Install OKF Enforcer",
            desc: "Opens OKF Enforcer in Obsidian's community-plugin browser, where you install and enable it yourself. LOKF Enforcer never installs, enables, or calls into another plugin.",
            aliases: ["sibling", "companion", "OKF v0.2"],
            action: () => {
              window.open(OKF_ENFORCER_URI);
            },
          },
          {
            name: "Recommend installing an OKF validator",
            desc: "Show a one-time notice, on first opening this vault, recommending an OKF v0.2 validator (e.g. OKF Enforcer).",
            control: { type: "toggle", key: "recommendSiblingPlugin" },
          },
        ],
      },
      {
        type: "group",
        heading: "In-editor diagnostics",
        items: [
          {
            name: "Underline findings in the editor",
            desc: "Mark offending frontmatter inline, with the finding on hover - the live counterpart to the side report. Off leaves the editor untouched and the report panel the only surface.",
            aliases: ["inline", "underline", "CodeMirror", "live", "diagnostics"],
            control: { type: "toggle", key: "inlineDiagnostics" },
          },
          {
            name: "Suggest LOKF values as you type",
            desc: "Offer completions inside a concept's frontmatter (type/genre/status values, relation predicates, and the other concepts a relation can point at). Raw-text editing only - in Live Preview, frontmatter is Obsidian's Properties widget.",
            aliases: ["autocomplete", "EditorSuggest", "completion", "targets"],
            control: { type: "toggle", key: "autocomplete" },
          },
        ],
      },
      {
        type: "group",
        heading: "Type vocabulary",
        items: [
          {
            name: "Known LOKF types",
            desc: SCHEMA_VERSION
              ? `Comma-separated recognized LOKF classes. Defaults track the pinned LOKF schema ${SCHEMA_VERSION}; an untouched list is refreshed automatically on upgrade.`
              : "Comma-separated list of recognized LOKF classes.",
            control: { type: "textarea", key: "knownTypes", rows: 3 },
          },
          {
            name: "Warn on unrecognized type",
            desc: "Flag a type outside the known vocabulary (never an error - treated as a generic lokf:Concept).",
            control: { type: "toggle", key: "warnUnknownType" },
          },
          {
            name: "Genre values",
            desc: "Comma-separated Diátaxis genre values.",
            control: { type: "text", key: "genreValues" },
          },
        ],
      },
      {
        type: "group",
        heading: "Type-specific fields",
        items: [
          {
            name: "Warn about missing recommended fields",
            desc: "Metric/Service/GlossaryTerm concepts missing their recommended fields (unit/formula/measures, endpoint/http_method/documentation, definition).",
            control: { type: "toggle", key: "warnTypeSpecificFields" },
          },
        ],
      },
      {
        type: "group",
        heading: "Semantic header and base IRI",
        items: [
          {
            name: "Warn when the root index.md has no LOKF header",
            desc: "Also warns when the vault has no root index.md at all.",
            control: { type: "toggle", key: "warnMissingHeader" },
          },
          {
            name: "Authority denylist",
            desc: "Domains a base_iri must not live inside (comma-separated).",
            control: { type: "textarea", key: "authorityDenylist", rows: 3 },
          },
          {
            name: "Placeholder domains",
            desc: "Domains treated as a pending placeholder rather than an authority violation (comma-separated).",
            control: { type: "text", key: "placeholderDomains" },
          },
        ],
      },
      {
        type: "group",
        heading: "Trust and lifecycle (OKF v0.2 §5)",
        items: [
          {
            name: "Check trust/lifecycle field shapes",
            desc: "Validate the shape of the §5 fields a bundle actually uses (verified/generated actors, status, stale_after, sources) - the substrate LOKF's curation ceremony stands on. Never fires on a bundle that carries no §5 fields; deeper credibility/tier interpretation is an installed OKF validator's job.",
            aliases: ["verified", "generated", "status", "stale_after", "provenance", "ceremony"],
            control: { type: "toggle", key: "checkTrustShape" },
          },
          {
            name: "Concept statuses",
            desc: "Comma-separated lifecycle values accepted for status. Defaults track the pinned LOKF schema; an untouched list is refreshed automatically on upgrade.",
            control: {
              type: "text",
              key: "conceptStatuses",
              disabled: () => !this.plugin.settings.checkTrustShape,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Relationships",
        items: [
          {
            name: "Check relation targets resolve",
            desc: "Warn (never error) when a relationship target inside this bundle doesn't resolve to a file in the vault.",
            control: { type: "toggle", key: "checkRelationTargets" },
          },
          {
            name: "Warn on unknown relations predicate",
            desc: "Off by default: the full RelationType vocabulary is defined by the LOKF schema, so this list may be incomplete for your bundle.",
            control: { type: "toggle", key: "warnUnknownPredicate" },
          },
          {
            name: "Known predicates",
            desc: "Comma-separated predicates accepted in a relations entry.",
            // Only consulted by the check above, so it is dimmed while that is off.
            control: {
              type: "textarea",
              key: "knownPredicates",
              rows: 3,
              disabled: () => !this.plugin.settings.warnUnknownPredicate,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Rule severity",
        items: [
          {
            name: "Treat these rules as errors",
            desc: "Comma-separated rule ids whose warnings are raised to errors (escalation only - a structural error is never downgraded, so the permissive default only ever gets stricter). Rule ids: lokf/2-header (semantic header), lokf/3-vocab (unknown type), lokf/3-genre (genre), lokf/3-fields (type-specific fields), lokf/4-relations (relationships), lokf/5-id (id minting), lokf/5-trust and lokf/5-lifecycle (OKF v0.2 §5 shape).",
            aliases: ["severity", "strict", "error", "escalate", "warnings as errors", "CI", "gate"],
            control: { type: "text", key: "escalateToError" },
          },
        ],
      },
      {
        type: "group",
        heading: "Field aliasing (advanced)",
        items: [
          {
            name: "Frontmatter key aliases",
            desc: "Comma-separated user=canonical pairs that rename a vault's own frontmatter keys onto the LOKF ones before checking (e.g. depends_on=dependsOn, is_part_of=isPartOf), so a vault that never adopted the canonical spellings can still be validated. Off by default - turning it on stops the plugin flagging the divergence, so use it only when the alternative spelling is deliberate.",
            aliases: ["alias", "field name", "mapping", "rename", "snake_case", "depends_on"],
            control: { type: "text", key: "fieldAliases" },
          },
        ],
      },
      {
        type: "group",
        heading: "Scope and performance",
        items: [
          {
            name: "Bundle root folders",
            desc: "Comma-separated vault-relative folders, each the root of its own bundle (its own index.md, base_iri, ids). Leave blank if the bundle is the whole vault - the usual Obsidian setup, one vault per bundle. List folders here only when one vault holds several independent bundles as sibling project folders; a note outside every listed folder is not scanned.",
            aliases: ["subfolder", "one vault many folders", "bundleRoots", "multiple bundles"],
            control: {
              type: "textarea",
              key: "bundleRoots",
              rows: 2,
              // A dot-folder entry is silently unscannable rather than wrong-
              // looking (Obsidian's file index never exposes one), so it is
              // rejected here with the reason, before it is ever saved.
              validate: (value) => {
                for (const entry of parseCsv(String(value ?? ""))) {
                  const segment = hiddenRootSegment(entry);
                  if (segment) {
                    return `"${entry}" sits inside "${segment}" - Obsidian's file index skips folders whose name begins with a dot, so nothing under it can ever be scanned. Open that folder as its own vault instead (File → Open folder as vault).`;
                  }
                }
                return undefined;
              },
            },
          },
          {
            name: "Excluded folders",
            desc: "Comma-separated folder paths to skip during a scan.",
            control: { type: "text", key: "excludeFolders" },
          },
          {
            name: "Per-note opt-out key",
            desc: "A note whose frontmatter sets this key to a skip value (ignore, true, yes, on, or skip - e.g. `lokf: ignore`) is silenced: no findings, inline underlines, or report rows. Blank this to turn the opt-out off. The note still counts as a concept in the bundle graph; only its findings are suppressed.",
            aliases: ["ignore", "opt-out", "opt out", "suppress", "silence", "skip", "work in progress"],
            control: { type: "text", key: "ignoreFrontmatterKey" },
          },
          {
            name: "Batch size",
            desc: "Files processed per batch during a vault scan.",
            control: {
              type: "number",
              key: "batchSize",
              min: 1,
              max: 1000,
              step: 1,
              defaultValue: 50,
              validate: (value) =>
                Number.isInteger(value) && value >= 1 && value <= 1000
                  ? undefined
                  : "Enter a whole number between 1 and 1000.",
            },
          },
        ],
      },
    ];
  }
}
