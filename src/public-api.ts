// public-api.ts - the read-only surface other plugins (the sibling Curator, an
// agent) may read validation state from, without either plugin depending on the
// other. Reachable at runtime as `app.plugins.plugins["lokf-registrar"].api`.
//
// Types only, so a consumer can import this file for the shapes without pulling
// in Obsidian or the rest of the plugin. Everything here is read-only: the API
// never writes to the vault. `LokfFinding` is deliberately its own type (not the
// internal `LokfIssue`) so this contract can stay stable independently.

export interface LokfFinding {
  severity: "error" | "warning";
  rule: string;
  message: string;
  /** The frontmatter key/path the finding is about, when one can be named. */
  key?: string;
}

export interface LokfFileFindings {
  path: string;
  findings: LokfFinding[];
}

export interface LokfRegistrarApi {
  /** The plugin version this API belongs to (from the manifest). */
  readonly version: string;
  /** The findings from the most recent vault scan - a read-only snapshot, empty
   *  before the first scan. Reflects incremental re-checks while the report
   *  panel is open. */
  getReport(): LokfFileFindings[];
  /** Validate one note's current content on demand and return its findings.
   *  Reads and validates only - it never writes. A note that isn't a concept in
   *  a configured bundle (or can't be read) returns an empty list. */
  validatePath(path: string): Promise<LokfFinding[]>;
  /** Subscribe to "a validation finished" (a full scan or an incremental
   *  re-check). Returns an unsubscribe function. */
  onValidated(callback: () => void): () => void;
}
