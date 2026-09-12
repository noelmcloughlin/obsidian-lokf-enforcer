---
type: Service
id: https://lokf-registrar.example/knowledge/services/report-view
title: Report View
description: Collapsible side-panel view rendering the vault-wide LOKF conformance report.
resource: src/report-view.ts
isPartOf:
  - https://lokf-registrar.example/knowledge/services/lokf-registrar-plugin
generated:
  by: process:lokf-librarian
  at: "2026-09-11T12:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-11T12:00:00Z"
---

# Overview

`LokfReportView` (view type `lokf-report-view`) renders the results of a
vault scan: the active note pinned at the top, remaining results
folder-grouped, and a summary chip row. It exposes `setProgress`/`clearProgress`
for a progress bar during a scan, but the batching itself - `processQueue` in
[the plugin lifecycle](lokf-registrar-plugin.md), size drawn from the
user-configurable `batchSize` setting (default 50) - lives outside this file;
this view only renders what it's driven with. Clicking a file name opens it.

`FileResult.synthetic` marks a bundle-level finding (no root `index.md`, a
hidden or missing bundle-root folder) whose path was never one of the
actually-scanned files. The "N clean" chip excludes synthetic rows from what
it subtracts from the scanned count - counting them used to undercount
"clean" by however many such findings a scan produced.
