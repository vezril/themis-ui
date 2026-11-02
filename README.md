# themis-ui — freelance invoicing & expense console

The console for **Themis**: issue invoices, log expenses with receipts, and see what is
outstanding. The service holds the ledger; this is the surface Calvin actually works in.

**Status:** scaffold (2026-11-02). Canonical design: `codex/docs/themis.md`. The service it fronts
is [`themis-service`](https://github.com/vezril/themis-service), whose MVP is built (21 of 25
stories, 758 tests green in CI) and whose REST surface this consumes.

## Conventions

`UX-STANDARDS.md` and `UI-PLAYBOOK.md` in this folder are the **copied-in binding standards** —
dark-only, one per-god accent, same-origin BFF, shadcn/Radix kit. Read both before writing a
component. They encode real scars: artemis-ui was rebuilt after going client-direct, zeus-ui
shipped a silently-inert `NEXT_PUBLIC_*`, and an empty `ingressClassName` once deleted a live
ingress.

**Accent: NOT YET ASSIGNED.** Themis is absent from the accent table in `UX-STANDARDS.md` §2 and
has no mark in `codex/docs/brand/`. Until both exist the theme uses family cyan with the accent
isolated behind the `--primary` / `--ring` / `--sidebar-primary` / `--sidebar-ring` tokens in one
place, so assigning it later is a five-value edit and not a re-theme. Generate the mark via the
constellation-logo pipeline; the accent in the mark and `--primary` must be the same value.

Deploys are the **Codex** session's. **Behind Authelia** — this screen shows client PII and
Calvin's financial records, the most sensitive in the constellation after Harpocrates.
Owner/coordination per `codex/docs/session-coordination.md`.

## Stack

Next.js 16 + React 19 + Tailwind v4, standalone output, listening on :3000 as non-root uid 1001.
Same-origin BFF only: **the browser never talks to `themis-service` directly** — every call goes
through this app's own route handlers under `/api/themis/*`, which reach the service server-side
inside the cluster.

## Scope

**v1 (this scaffold):** the dashboard — outstanding vs paid invoices, overdue count, expense
totals by category, and the year's net. All read-only, all from endpoints that already exist.

**Next:** client registry, invoice issue/send/pay/void with the PDF view, expense capture with
receipt upload, the year-end workbook download, and the invoice-number integrity view.

**Out of scope, deliberately:** sending an invoice to a client. Themis generates and tracks;
sending is Calvin's own outward action, and the service has no code to do it.

## Service endpoints this consumes

All under `/api/v1` on `themis-service`, all behind its gateway guard:

| Endpoint | Use |
|---|---|
| `GET /invoices?year=` · `GET /invoices/{id}` | lists and detail; rows carry an `overdue` flag |
| `GET /invoices/{id}/pdf?stage=` | the document; `X-Themis-Source` says `stored` or `rerendered` |
| `GET /expenses?year=` · `GET /expenses/{id}` | lists and detail; rows carry `receiptCount` |
| `POST /expenses/{id}/receipts` · `GET .../receipts/{sha256}` | receipt upload and retrieval |
| `GET /reports/{year}?basis=` | income, expenses by category, net — the dashboard's numbers |
| `GET /exports/{year}/workbook?basis=` | the year-end `.xlsx` download |
| `GET /integrity?year=` | invoice-number gap report |
| `GET /clients` · `GET /profile` | registry and invoice identity |

Two service behaviours the UI must respect rather than paper over:

- **Receipts are switched off** until the Apollo garbage-collection question is settled, so the
  upload and retrieval routes answer **503**. Render that as "not yet available", never as
  "no receipts".
- **A 404 from a list endpoint means the route is gone, not that there is nothing.** Rendering it
  as "No items yet" is the visual-truthfulness failure demeter-ui shipped and fixed.

## License

MIT — see [LICENSE.md](LICENSE.md).

## Development

Node 22 (`.nvmrc`). `npm ci`, then `npm run dev` (it sets `NEXT_PUBLIC_THEMIS_API_BASE=/api/themis`).
Set `THEMIS_SERVICE_URL` (and `THEMIS_GATEWAY_SECRET` if the service runs `auth.mode=gateway-secret`)
to point the BFF at a running themis-service; see `.env.example`.

`npm run build` **requires** `NEXT_PUBLIC_THEMIS_API_BASE=/api/themis` (it is inlined into the
browser bundle at build time; there is no fallback), and `npm run verify:bundle` proves it landed.
The Dockerfile and CI both do this. Checks: `npm run lint`, `npm run typecheck`, `npm test`.
