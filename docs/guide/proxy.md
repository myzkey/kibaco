# Proxy

Kibaco exposes stable local URLs through a reverse proxy.

```json
{
  "proxyPort": 8080,
  "projects": [
    {
      "name": "web",
      "host": "web.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": "."
    }
  ]
}
```

This project is available at:

```text
http://web.localhost:8080
```

## Proxy Only

Use `kibaco proxy` when app processes are already running and you only want URL routing:

```sh
kibaco proxy
```

If a Kibaco proxy is already running on `proxyPort`, `kibaco dev` reuses it.
