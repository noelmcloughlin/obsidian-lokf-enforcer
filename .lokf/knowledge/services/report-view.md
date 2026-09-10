---
type: Service
id: https://lokf-enforcer.example/knowledge/services/report-view
title: Report View
description: Collapsible side-panel view rendering the vault-wide LOKF conformance report.
resource: src/report-view.ts
isPartOf:
  - https://lokf-enforcer.example/knowledge/services/lokf-enforcer-plugin
generated:
  by: process:lokf-librarian
  at: "2026-09-11T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-11T00:00:00Z"
---

# Overview

`LokfReportView` (view type `lokf-report-view`) renders the results of a
vault scan: the active note pinned at the top, remaining results
folder-grouped, and a summary chip row. It exposes `setProgress`/`clearProgress`
for a progress bar during a scan, but the batching itself - `processQueue` in
[the plugin lifecycle](lokf-enforcer-plugin.md), size drawn from the
user-configurable `batchSize` setting (default 50) - lives outside this file;
this view only renders what it's driven with. Clicking a file name opens it.
