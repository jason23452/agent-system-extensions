# Agent System Extensions

This repository is the public source workspace for Agent System Extensions and their shared CLI. The initial workspace and release/host contracts are established by ticket 01; product extension contents and CLI behavior are added by their owning tickets.

## Workspace baseline

- Node.js 24 LTS; npm workspaces are the repository package boundary.
- The CLI and each Extension have independent package versions. Each of the five Extension workspaces starts at the agreed 2.0.0 content baseline; the CLI starts at its own unpublished 0.1.0 workspace version.
- Extension releases are immutable `.aicxt` artifacts. Catalog and release identity includes extension ID, version, and SHA-256; the catalog's per-Extension latest pointer is explicit.
- `packages/contracts` owns the versioned release, catalog, package metadata, host, lifecycle, and source-sync wire contracts plus their shared conformance fixtures.

The initial workspace deliberately contains no product Extension source or functional CLI. Those contents are owned by the subsequent delivery tickets.
