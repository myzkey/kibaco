# Troubleshooting

Start with:

```sh
kiban doctor
```

`doctor` checks:

- Active config file
- Proxy port availability
- Reusable Kiban proxy state
- Docker availability
- Service references
- Project working directories
- Target port and reachability

## Common Fixes

Port conflict:

```sh
kiban kill-port 8080 --force
```

Stop Docker services:

```sh
kiban services down
```

Check service logs:

```sh
kiban services logs postgres --follow
```
