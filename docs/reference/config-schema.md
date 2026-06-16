# Config Schema

## Root

```json
{
  "workspace": "my-app",
  "proxyPort": 8080,
  "services": [],
  "projects": []
}
```

- `workspace`: Name used for Docker container names
- `proxyPort`: Local proxy port
- `services`: Docker services Kiban can manage
- `projects`: Local app commands and URL routes

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
