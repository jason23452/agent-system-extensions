# Agent System Extensions distribution repository

This public repository owns the shared Extension Catalog contract, exact-release downloader, catalog-only updater, and release automation. It does not contain the five product Extensions yet; ticket 02 owns those sources and their first product releases.

## Release contract

- Extension release tags are exactly `<extensionId>-<SemVer>`, for example `gitlab-2.1.0-dev.1`. The tag, root `.aicxt` `extension.json` identity/version and release prerelease marker must agree.
- A release contains exactly one package asset named `<tag>.aicxt`, for example `gitlab-2.1.0-dev.1.aicxt`. The workflow validates the ZIP archive and manifest, uploads the asset without replacing existing bytes, then reads it back anonymously and verifies its size and SHA-256.
- Stable SemVer versions map to `stable`; SemVer prereleases map to `dev` and require a GitHub prerelease. Build metadata does not change the channel.
- `catalog.json` is schema v1 (`packages/cli/schemas/catalog-v1.schema.json`). Entries pin `id`, `version`, `channel`, tag, exact public asset URL, SHA-256, size, host compatibility and package metadata. Catalog selection never uses a repository-wide `latest` release.
- Catalog updates are monotonic. GitHub Contents API writes include the current file SHA; on a concurrent-write conflict the job re-reads and unions the latest catalog with published releases before retrying. Conflicting metadata for the same `id`/version fails rather than overwriting a published identity.
- The `synthetic-` ID namespace is reserved for distribution tests. Its public workflow release gets an attached `synthetic-catalog.json` for anonymous verification, but is never added to official `catalog.json`.
- CLI releases use `cli/v<version>` tags and contain a dependency-free npm `.tgz`. The package is released only as a GitHub Release asset; it is not published to the npm registry.

## CLI use (Node.js 24+)

### Exact package download

```powershell
npx --yes --package="https://github.com/jason23452/agent-system-extensions/releases/download/cli/v1.0.0/agent-system-extension-distribution-cli-1.0.0.tgz" -- aicxt-download --id gitlab --channel stable --version 2.0.0 --output gitlab-2.0.0.aicxt
```

The command downloads only the exact catalog entry and verifies its bytes before writing the destination. Missing versions and hash mismatches fail; there is no `latest` fallback. Use `--catalog <url>` to supply a different catalog source explicitly.

### Update only the catalog

```powershell
npx --yes --package="https://github.com/jason23452/agent-system-extensions/releases/download/cli/v1.0.0/agent-system-extension-distribution-cli-1.0.0.tgz" -- extension-catalog --output .\catalog.json
```

This fetches and validates the current complete public `catalog.json`; it does not fetch `.aicxt` assets or install/switch an Extension. Without `--output`, validated JSON is written to stdout.

### Local installation

```powershell
Invoke-WebRequest "https://github.com/jason23452/agent-system-extensions/releases/download/cli/v1.0.0/agent-system-extension-distribution-cli-1.0.0.tgz" -OutFile .\agent-system-extension-distribution-cli-1.0.0.tgz
npm install --global .\agent-system-extension-distribution-cli-1.0.0.tgz
aicxt-download --help
extension-catalog --help
```

On Linux, use `curl -fL <release-asset-url> -o agent-system-extension-distribution-cli-1.0.0.tgz`, then `npm install --global ./agent-system-extension-distribution-cli-1.0.0.tgz`.

## Maintainer workflow

- Run `npm test` on Node 24. It uses only the built-in Node test runner and has no install step.
- `npm run fixture:build` deterministically rebuilds the reserved synthetic `.aicxt`; `npm run fixture:verify` checks the tracked archive is reproducible.
- Publish an Extension by adding its validated `.aicxt` at `packages/<extensionId>/<extensionId>-<SemVer>.aicxt`, then pushing the exact matching tag. The release workflow creates the immutable Release and updates the full catalog.
- Publish a CLI release by pushing `cli/v<package-version>`. The workflow packs and attaches the `.tgz`; no `npm publish` is used.
