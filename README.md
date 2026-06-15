# Kiban

Kiban is an AI-friendly local development stack manager.

It starts local app processes such as Next.js, Vite, Rails, Laravel, and API servers while managing dependent Docker services such as PostgreSQL, MySQL, Redis, Mailhog, and MinIO from one `kiban.yml`.

## Install

```sh
pnpm install
pnpm build
pnpm link --global
```

## Quick Start

```sh
kiban init
kiban add web --path ~/projects/web --cmd "pnpm dev" --port 3000 --url http://localhost:3000
kiban up web
kiban status
kiban logs web
kiban down web
```

## Commands

- `kiban init`
- `kiban add`
- `kiban list`
- `kiban up`
- `kiban down`
- `kiban restart`
- `kiban status`
- `kiban logs`
- `kiban doctor`
- `kiban ports`
- `kiban kill-port`
- `kiban open`
- `kiban edit`

Core inspection commands support `--json` for AI coding agents and scripts.

## Configuration

```yaml
workspace: default
projects:
  - name: web
    path: ~/projects/web
    command: pnpm dev
    port: 3000
    url: http://localhost:3000
    services:
      - postgres
services:
  - name: postgres
    image: postgres:16
    ports:
      - "5432:5432"
    env:
      POSTGRES_PASSWORD: postgres
    healthCheck:
      type: tcp
      host: 127.0.0.1
      port: 5432
```

Kiban stores runtime data in `~/.kiban`:

- `~/.kiban/logs`
- `~/.kiban/pids`
- `~/.kiban/state`
- `~/.kiban/cache`

## Security

Kiban runs commands from your local `kiban.yml`. Only use configuration files that you trust.
