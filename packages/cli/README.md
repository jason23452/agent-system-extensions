# Extension distribution CLI

Node.js 24 LTS CLI package exposing two separate commands:

- `aicxt-download`: downloads an exact `id` / `channel` / `version` catalog asset and verifies byte size and SHA-256 before publishing the output file.
- `extension-catalog`: fetches and validates the latest complete public `catalog.json`; it never downloads or installs `.aicxt` assets.

Both commands are dependency-free and are shipped as a prebuilt npm tarball attached to the GitHub Release `cli/v<version>` in `jason23452/agent-system-extensions`.
