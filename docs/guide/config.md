# Configuration

Kiban uses `kiban.config.json` as the source of truth for local app processes, URLs, proxy routing, and Docker services.

```json
{
  "workspace": "my-app",
  "proxyPort": 8080,
  "services": [
    {
      "name": "postgres",
      "image": "postgres:16",
      "ports": ["5432:5432"],
      "env": {
        "POSTGRES_PASSWORD": "postgres",
        "POSTGRES_DB": "app"
      },
      "healthCheck": {
        "type": "tcp",
        "host": "127.0.0.1",
        "port": 5432
      }
    }
  ],
  "projects": [
    {
      "name": "web",
      "host": "web.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": ".",
      "services": ["postgres"]
    }
  ]
}
```

## Projects

Each project describes one local app process and the URL Kiban should expose.

- `name`: Project name used by commands such as `kiban open web`
- `host`: Local hostname handled by the proxy
- `target`: Local server URL started by the project command
- `command`: Shell command for the app process
- `cwd`: Working directory for the command
- `services`: Docker service names that should be started before the project

## Services

Services are Docker containers managed by Kiban.

- `name`: Service name referenced by projects
- `image`: Docker image
- `ports`: Docker port mappings
- `env`: Environment variables passed to the container
- `volumes`: Docker volume mappings
- `dependsOn`: Services to start first
- `healthCheck`: Optional readiness check
