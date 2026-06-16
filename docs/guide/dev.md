# Development

Run:

```sh
kiban dev
```

Kiban will:

1. Read `kiban.config.json`
2. Start Docker services referenced by projects
3. Wait for configured health checks
4. Start project commands
5. Start or reuse the local proxy
6. Print the URLs for each project

## Stopping

Press `Ctrl+C` to stop the project processes and the proxy started by Kiban.

Docker services are left running so databases stay available during development. Stop them explicitly with:

```sh
kiban services down
```
