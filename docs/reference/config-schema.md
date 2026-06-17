# Config Schema

## Root

```json
{
  "workspace": "my-app",
  "proxyPort": 8080,
  "log": {
    "maxBytes": 5242880,
    "maxFiles": 3
  },
  "services": [],
  "projects": []
}
```

- `workspace`: Name used for Docker container names
- `proxyPort`: Local proxy port
- `log`: Per-project log rotation settings
- `services`: Docker services Kiban can manage
- `projects`: Local app commands and URL routes

Project logs are stored under:

```text
~/.kiban/logs/{workspace}/{project}.log
~/.kiban/logs/{workspace}/{project}.jsonl
```

## Project

```json
{
  "name": "web",
  "host": "web.localhost",
  "target": "http://localhost:3000",
  "command": "pnpm dev",
  "cwd": ".",
  "services": ["postgres"]
}
```

## Service

```json
{
  "name": "postgres",
  "image": "postgres:16",
  "ports": ["5432:5432"],
  "env": {
    "POSTGRES_PASSWORD": "postgres"
  },
  "volumes": [],
  "dependsOn": [],
  "healthCheck": {
    "type": "tcp",
    "host": "127.0.0.1",
    "port": 5432
  }
}
```

## Health Check

Supported types:

- `tcp`
- `http`
- `command`
