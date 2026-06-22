# Quick Start

Create a config in your project directory:

```sh
kibaco init
```

Kibaco infers sensible defaults from package managers, `package.json`, dev scripts, `.env` ports, common frameworks, simple backend/server files, monorepo app folders, and Compose files when it can.
Inferred local hostnames include the workspace directory as a prefix, such as `my-app-web.localhost`, to avoid collisions across repositories.

Start the environment:

```sh
kibaco dev
```

Open a project URL:

```sh
kibaco open web
```

That is the normal daily workflow.

## Override Inferred Values

```sh
kibaco init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

Preview inferred config without saving it:

```sh
kibaco init --detect
```

Force an interactive review:

```sh
kibaco init --interactive
```

`kibaco init` can detect:

- Package managers: pnpm, npm, yarn, bun
- Frontend frameworks: Next.js, Vite, Astro, Nuxt, Remix
- Backend projects: Rails, Laravel, Django, Go, Rust, simple Node servers
- Monorepos: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `apps/*`, `packages/*`, `services/*`
- Environment ports: `.env`, `.env.local`, `.env.development`
- Compose services: images, ports, environment, volumes, dependencies, and common health checks

## Check the Workspace

```sh
kibaco doctor
```

`doctor` checks the active config, proxy port, Docker availability, service references, project working directories, and target reachability.
