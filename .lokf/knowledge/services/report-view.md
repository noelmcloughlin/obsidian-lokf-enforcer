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
  at: "2026-09-08T00:00:00Z"
verified:
  - by: process:lokf-librarian
    at: "2026-09-09T00:00:00Z"
---

# Overview

`LokfReportView` (view type `lokf-report-view`) renders the results of a
vault scan: the active note pinned at the top, remaining results
folder-grouped, and a summary chip row. Large vaults are batched
(`processQueue`, default batch size 50) with a progress indicator during a
scan. Clicking a file name opens it.
