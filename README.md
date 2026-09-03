# BuryMe

A peer-to-peer IOU / micro-lending tracker. Web-first; mobile (Flutter) follows
once the web + backend surface is stable.

## Structure

```
/backend    Express/Node API — all business logic lives here
/web        React web client — thin, consumes the API only
/shared     Generated TypeScript types from contract/openapi.yaml
/contract   openapi.yaml — the source of truth for the API surface
```

See [`CLAUDE.md`](./CLAUDE.md) for architecture decisions, the development
approach, and the current build plan — read that first before writing code.

## Getting started

```bash
pnpm install
pnpm db:up              # starts local Postgres via Docker Compose
cp .env.example .env    # fill in Firebase / Chapa credentials
pnpm dev:backend         # http://localhost:4000
pnpm dev:web             # http://localhost:5173
```

## Working with the contract

`contract/openapi.yaml` is the source of truth for the API. Code conforms to
it, not the other way around.

```bash
pnpm types:generate   # regenerate shared/src/api-types.gen.ts after any contract change
```

CI fails if the generated types are out of sync with the contract — always
run `types:generate` and commit the result after editing `openapi.yaml`.
