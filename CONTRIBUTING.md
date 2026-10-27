# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm build   # the collector and viewer type-check against the client's built types
```

## Before opening a pull request

```bash
pnpm lint             # Biome; `pnpm format` fixes formatting
pnpm typecheck
pnpm test
pnpm size             # client bundle against its budget
pnpm check:packages   # publint and attw
```

For changes to how the client measures or sends data, also run:

```bash
pnpm test:e2e   # Playwright in Chromium, Firefox and WebKit
pnpm bench      # overhead and accuracy; fails if over bench/budget.json
```

Add a changeset describing user-facing changes: `pnpm changeset`.

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets):

1. Each pull request with a user-facing change adds a changeset (`pnpm changeset`).
2. On `main`, the **Version packages** workflow opens a pull request that bumps versions and writes the changelogs. Merge it when you're ready to release.
3. Run the **Publish to npm** workflow (Actions → Publish to npm → Run workflow). It publishes every package whose version isn't on npm yet, with provenance, using npm trusted publishing (no token). Each package's `prepublishOnly` runs its type check, tests and build first.

Trusted publishing is configured per package on npmjs.com (package → Settings → Trusted publisher → GitHub Actions, repository `Amalmktk/react-render-pulse`, workflow `publish.yml`). A package must exist on npm before it can have a trusted publisher, so the very first release was published locally with `npm login` and `pnpm release`.

## Ground rules

- The client must never break the app: wrap anything that can throw in `guard`, and add a case to `packages/client/tests/safeFailure.test.tsx`.
- Never add personal data to the payload. New payload fields need the collector schema, the docs ("What we collect") and a privacy test updated together.
- Overhead is a feature: keep the client within its size and overhead budgets, and explain any budget change in `docs/decisions/`.
