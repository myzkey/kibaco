# Local HTTP Smoke Test

This example verifies Kiban without Docker.

Kiban does not create a config file in this directory. `kiban init` stores the workspace config under `~/.kiban`.

```sh
pnpm build
cd examples/local-http
node ../../dist/cli.js init
node ../../dist/cli.js list
node ../../dist/cli.js dev
```

In another terminal:

```sh
cd examples/local-http
curl -H "Host: web.localhost:8080" http://127.0.0.1:8080
```

Browser URL:

```text
http://web.localhost:8080
```

`node ../../dist/cli.js proxy` is available when you want to run only the reverse proxy.
If that proxy is already running, `node ../../dist/cli.js dev` reuses it.
