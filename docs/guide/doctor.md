# Troubleshooting

Start with:

```sh
kibaco doctor
```

`doctor` checks:

- Active config file
- Proxy port availability
- Reusable Kibaco proxy state
- Docker availability
- Service references
- Project working directories
- Target port and reachability

## Common Fixes

Port conflict:

```sh
kibaco kill-port 8080 --force
```

Stop Docker services:

```sh
kibaco services down
```

Check service logs:

```sh
kibaco services logs postgres --follow
```
