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

## Ground rules

- The client must never break the app: wrap anything that can throw in `guard`, and add a case to `packages/client/tests/safeFailure.test.tsx`.
- Never add personal data to the payload. New payload fields need the collector schema, the docs ("What we collect") and a privacy test updated together.
- Overhead is a feature: keep the client within its size and overhead budgets, and explain any budget change in `docs/decisions/`.
