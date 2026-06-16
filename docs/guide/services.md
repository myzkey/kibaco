# Docker Services

Kiban can start and stop Docker services defined in the workspace config.

`kiban init` can infer services from common Compose files:

- `compose.yaml`
- `compose.yml`
- `docker-compose.yaml`
- `docker-compose.yml`
- `docker.yaml`
- `docker.yml`

```sh
kiban services up
kiban services status
kiban services logs postgres --follow
kiban services down
```

When a project lists services, `kiban dev` starts those services before running the project command.

## Health Checks

A service can define a health check:

```json
{
  "healthCheck": {
    "type": "tcp",
    "host": "127.0.0.1",
    "port": 5432
  }
}
```

Kiban waits for the health check before starting dependent project commands.
