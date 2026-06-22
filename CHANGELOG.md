# kibaco

## 0.0.4

### Patch Changes

- Add project cache cleanup and improve config tooling.

  - Add `kibaco clean` and `kibaco restart --force` for framework cache cleanup and target port recovery.
  - Add configurable project `cacheDirs` plus doctor warnings for stale caches.
  - Add safer config editing commands and update notifications for local CLI usage.

## 0.0.3

### Patch Changes

- Improve AI-friendly config discovery and editing.

  - Prefer project-local `.kibaco/config.json` while preserving legacy local and workspace fallback config discovery.
  - Generate `kibaco.config.example.json`, add JSON Schema, and keep developer-local config ignored by Git.
  - Add `kibaco config validate`, `kibaco config format`, `kibaco config list-routes`, `kibaco config set-target`, and `kibaco explain`.
  - Keep repo-local overrides and workspace status diagnostics compatible with existing workflows.
  - Forward WebSocket HTTP Upgrade requests through the proxy so Next.js HMR works behind Kibaco stable URLs.

## 0.0.2

### Patch Changes

- Improve local dev startup for monorepos and Compose-backed services.

  - Start Compose-inferred services through `docker compose`.
  - Detect monorepo app projects more reliably.
  - Keep `kibaco dev` quiet by default and add `--verbose`.
  - Add `kibaco urls` for checking configured local URLs.
  - Infer `VITE_PORT` and automatically choose a non-conflicting proxy port.
