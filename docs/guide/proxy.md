# Proxy

Kiban exposes stable local URLs through a reverse proxy.

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

Use `kiban proxy` when app processes are already running and you only want URL routing:

```sh
kiban proxy
```

If a Kiban proxy is already running on `proxyPort`, `kiban dev` reuses it.
