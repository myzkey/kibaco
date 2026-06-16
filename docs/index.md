# Kiban

Kiban starts your local development environment with one command.

It keeps app commands, local URLs, reverse proxy routing, and Docker services in one `kiban.config.json`, so you do not have to remember which terminal, port, or container belongs to each project.

## Daily Workflow

```sh
kiban dev
```

Then open a project:

```sh
kiban open web
```

`kiban dev` starts the Docker services used by your projects, runs each project command, and starts the local reverse proxy.

## Why Kiban

- One command to start the local stack
- Stable local URLs such as `http://web.localhost:8080`
- Docker service startup and health checks before app commands
- Proxy reuse when a Kiban proxy is already running
- Diagnostics for ports, Docker services, config, and targets

## Next Steps

- [Quick Start](./guide/quick-start.md)
- [Configuration](./guide/config.md)
- [Command Reference](./reference/commands.md)
