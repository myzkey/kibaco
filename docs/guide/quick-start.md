# Quick Start

Create a config in your project directory:

```sh
kiban init
```

Kiban infers sensible defaults from `package.json`, common dev scripts, or simple server files when it can.

Start the environment:

```sh
kiban dev
```

Open a project URL:

```sh
kiban open web
```

That is the normal daily workflow.

## Override Inferred Values

```sh
kiban init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

## Check the Workspace

```sh
kiban doctor
```

`doctor` checks the active config, proxy port, Docker availability, service references, project working directories, and target reachability.
