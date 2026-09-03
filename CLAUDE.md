# CLAUDE.md — BuryMe project memory

Read this before writing any code. It captures decisions made during
planning, so you don't have to re-derive them from scratch.

## What BuryMe is

A peer-to-peer IOU / micro-lending tracker (PRD v2.7). Users create Borrow or
Lend requests, negotiate terms (capped at one counter-proposal), and once
agreed the platform tracks the resulting Obligation through disbursement,
repayment (lump sum or installments), and settlement. Also supports group
expenses (one payer, N participants, bilateral obligations per participant)
and two-party net settlement suggestions.

Full detail lives in `contract/openapi.yaml` — read it before implementing
any endpoint. Its `info.description` explains the domain model rationale in
depth (Request vs. Obligation split, Chapa's two-hop payment model, etc.).

## Architecture (fixed — do not deviate without asking)

- **Thin clients.** All business logic, persistence, and third-party
  integration live in `/backend` (Express/Node). `/web` (React) and the
  future Flutter mobile app consume the API only — no domain logic in
  clients, ever.
- **Auth: Firebase**, not a custom auth system. Phone/email OTP and
  credential handling happen client-side via the Firebase Auth SDK. The
  client sends the Firebase ID token as `Authorization: Bearer <token>` on
  every request; the backend verifies it via the Firebase Admin SDK. There
  is no `/login` or `/verify-otp` endpoint in this API by design.
- **Database: PostgreSQL.** Schema should map directly to `contract/openapi.yaml`'s
  entity schemas, which themselves map to PRD §8.
- **Payments: Chapa**, Telebirr-only for MVP, modeled as two explicit hops
  (collect, then transfer) — see the contract's `info.description` for why.
  Two separate webhook endpoints exist for this reason; don't collapse them.
- **Real-time: Socket.io.** Event names TBD per slice — check PRD §13 when
  the notifications slice comes up.
- **Push: FCM**, via `POST /auth/fcm-token`.

## Contract-first — the core rule

`contract/openapi.yaml` is the single source of truth for the API surface.
**Code conforms to the contract, not the other way around.** If implementing
a slice reveals the contract needs to change, stop and propose the contract
change explicitly (and regenerate types) rather than silently diverging.

After any edit to `contract/openapi.yaml`, always run:

```bash
pnpm types:generate
```

and commit the regenerated `shared/src/api-types.gen.ts` in the same commit
as the contract change. CI enforces this — a stale generated-types file
fails the build. Never hand-edit `api-types.gen.ts`.

## Development method: vertical slices

We are **not** building "all backend then all frontend," and we are **not**
running literal parallel tracks (single developer). Each unit of work is a
full-stack vertical slice: backend endpoint + logic + a test, then the web
screens wired to it, then an integration check. The app should be
demoable after every slice.

### Slice order

1. **Auth** — Firebase verification middleware, `/auth/me`, `/auth/register`,
   `/auth/fcm-token`. Web: login/register screens.
2. **Users** — search/discovery, own profile, Telebirr verification.
3. **Core obligation loop** — Requests (Borrow/Lend), negotiation
   (counter/accept/decline/cancel), Obligation creation on acceptance.
   This is the heart of the app.
4. **Disbursement** — `Pending Disbursement → Active`, Chapa transfer hop,
   the "Already Given" vs "Through App" branch.
5. **Payments** — Chapa repayment (collection hop), external payment
   recording + acknowledge/dispute.
6. **Schedules/Installments** — repayment schedule read, installment status
   transitions (Pending → Paid/Overdue).
7. **Group expenses** — creation, per-participant obligation spawning.
8. **Settlements** — suggestion detection, two-party accept/decline.
9. **Notifications** — feed, read state, Socket.io real-time layer, FCM push.

Do not jump ahead of the current slice unless explicitly asked. Do not
build frontend screens for a slice whose backend endpoints don't exist yet.

## Repo structure

```
/backend
  src/
    routes/       one file per resource, matching contract tags
    middleware/    Firebase auth verification, error envelope, etc.
    db/            Postgres schema, migrations, query layer
    config/        env loading, Firebase Admin init, Chapa client init
/web
  src/
    api/           typed fetch wrappers built on @buryme/shared types
    components/    reusable UI
    pages/         route-level screens
    hooks/
/shared
  src/
    api-types.gen.ts   GENERATED — do not hand-edit
    index.ts            re-exports + convenience aliases
/contract
  openapi.yaml     the contract — source of truth
```

## Conventions

- **TypeScript everywhere**, strict mode (`tsconfig.base.json` — do not
  loosen strictness without discussion).
- **pnpm workspaces.** Use `workspace:*` for internal package references.
- **Error envelope**: every backend error response uses the shape defined in
  `contract/openapi.yaml`'s `Error` schema and the `ErrorCode` enum — this is
  taken verbatim from PRD §12.3 and is normative, not a suggestion.
  Never invent a new error code; if a situation doesn't fit the existing
  list, flag it rather than adding one silently.
- **Money** is always `{ amount: number, currency: "ETB" }`, ≤2 decimal
  places, per the `Money` schema. Never pass a bare number for an amount.
- **Validation**: server-side validation is authoritative regardless of what
  the client does (PRD §12.1). Field-level constraints (lengths, ranges,
  formats) are documented per-schema in the contract via `description` and
  JSON Schema keywords (`minLength`, `pattern`, etc.) — implement to match
  exactly, they're sourced from PRD §12.2, not invented.
- **No obligation status called `proposed`/`agreed`/`countered`.** That
  vocabulary belongs to `Request`. If you see it applied to an Obligation,
  something has drifted from the contract — stop and check.

## What NOT to do

- Don't add endpoints, fields, or status values not in `contract/openapi.yaml`
  without flagging the gap first.
- Don't put business logic in `/web`.
- Don't build a `/login` or OTP endpoint — that's Firebase's job, client-side.
- Don't collapse the two Chapa webhook endpoints into one.
- Don't let a Repayment Request create a new Obligation — it targets an
  existing one (`obligation_id` is set at creation, not on acceptance).
- Don't skip ahead in the slice order without being asked.

## Session start checklist

1. Read this file.
2. Skim `contract/openapi.yaml`'s `info.description` and the relevant tag's
   paths for the slice at hand.
3. Confirm which slice we're on (ask if unclear) before writing code.
4. Summarize your understanding of the current task back before starting,
   so drift gets caught early.
