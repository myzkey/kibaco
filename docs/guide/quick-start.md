# Quick Start

Create a config in your project directory:

```sh
kiban init
```

Start the environment:

```sh
kiban dev
```

Open a project URL:

```sh
kiban open web
```

That is the normal daily workflow.

## Create a Config Without Prompts

```sh
kiban init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

## Check the Workspace

```sh
kiban doctor
```

`doctor` checks the active config, proxy port, Docker availability, service references, project working directories, and target reachability.
