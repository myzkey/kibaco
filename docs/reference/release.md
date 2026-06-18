# Release

Kibaco uses Changesets to automate npm releases from `main`.

## One-time Setup

Configure npm Trusted Publishing for the package:

```text
Package: kibaco
Publisher: GitHub Actions
Organization or user: myzkey
Repository: kibaco
Workflow filename: release.yml
Allowed actions: npm publish
```

Trusted Publishing uses GitHub Actions OIDC, so no `NPM_TOKEN` secret is required. npm automatically publishes provenance for public packages from public repositories.

## During Development

When a change should be released, create a changeset:

```sh
pnpm changeset
```

Commit the generated `.changeset/*.md` file with the code change.

## Release Flow

1. A change with a changeset is merged to `main`
2. GitHub Actions opens a Version Packages release PR
3. Merging that release PR updates versions and changelog
4. GitHub Actions publishes the package to npm using OIDC

The workflow checks whether the current package version is already published and skips publishing when it is.

## Local Commands

```sh
pnpm changeset
pnpm changeset:version
pnpm release
```

`pnpm release` is intended for CI. It builds the package and runs `changeset publish`.
