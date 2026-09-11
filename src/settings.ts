// settings.ts - the LOKF Enforcer settings tab.
//
// Declarative (Obsidian 1.13.0+): the tab returns definitions rather than
// building DOM, so every setting is indexed by Obsidian's settings search.
import { App, PluginSettingTab } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type LokfPlugin from "./main";
import type { LokfSettings } from "./validator";
import { joinCsv, parseCsv, hiddenRootSegment } from "./validator";

/** Obsidian's own deep link into the community-plugin browser. Opening it is
 *  the most this plugin ever does about its sibling: the user installs and
 *  enables it themselves, exactly as they would any other plugin. */
const OKF_ENFORCER_URI = "obsidian://show-plugin?id=okf-enforcer";

type SettingKey = keyof LokfSettings;

/** Settings a user edits as comma-separated text but that are stored - and
 *  validated against - as string arrays. */
const CSV_KEYS = new Set<SettingKey>([
  "knownTypes",
  "genreValues",
  "knownPredicates",
  "authorityDenylist",
  "placeholderDomains",
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
    if (isCsvKey(key)) return joinCsv(this.plugin.settings[key] as string[]);
    return super.getControlValue(key);
  }

  /** Persisting goes through the plugin's own saveSettings() rather than the
   *  inherited write, which would drop the sibling-notice flag stored beside
   *  the settings. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    if (isCsvKey(key)) settings[key] = parseCsv(String(value));
    else settings[key] = value;
    await this.plugin.saveSettings();
    // A cached base_iri may belong to a root that no longer exists in this
    // shape once the set of bundle roots changes.
    if (key === "bundleRoots") this.plugin.invalidateBaseIriCache();
    // A toggle can gate another row (see "Known predicates"), and a `disabled`
    // predicate is only re-evaluated when asked. This is the CSS-only refresh,
    // not a re-render, so it is cheap enough to run on every change.
    this.refreshDomState();
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
    return [
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
        heading: "Type vocabulary",
        items: [
          {
            name: "Known LOKF types",
            desc: "Comma-separated list of recognized LOKF classes.",
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
