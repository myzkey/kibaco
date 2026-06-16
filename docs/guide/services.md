# Docker Services

Kiban can start and stop Docker services defined in `kiban.config.json`.

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
