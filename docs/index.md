# Kibaco

Kibaco starts your local development environment with one command.

It keeps app commands, local URLs, reverse proxy routing, and Docker services in Kibaco's workspace config under `~/.kibaco`, so your project directory stays clean.

## Daily Workflow

```sh
kibaco dev
```

Then open a project:

```sh
kibaco open web
```

`kibaco dev` starts the Docker services used by your projects, runs each project command, and starts the local reverse proxy.

## Why Kibaco

- One command to start the local stack
- Stable local URLs such as `http://my-app-web.localhost:8080`
- Docker service startup and health checks before app commands
- Proxy reuse when a Kibaco proxy is already running
- Diagnostics for ports, Docker services, config, and targets

## Next Steps

- [Quick Start](./guide/quick-start.md)
- [Configuration](./guide/config.md)
- [Command Reference](./reference/commands.md)
