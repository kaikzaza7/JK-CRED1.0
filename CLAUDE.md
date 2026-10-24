# JK CRED — Agent Instructions

This repository is now a PRIVATE administration panel. There is no customer portal and no in-app email/password login.

- Production code lives in `painel/`, deployed to Vercel project `jk-cred-admin`.
- Keep Vercel Authentication enabled for ALL deployment URLs and domains. The server API relies on this access boundary.
- Vanilla JavaScript ES modules, HTML and CSS, no build dependencies. Node.js 24 for `painel/api/gateway.mjs`.
- Browser requests go to `/api/gateway`, with same-origin JSON POST and CSRF origin checks. Server-only configuration must never reach the browser.
- Supabase schema uses additive `jk_*` tables with RLS and protected RPCs. Never put secrets, service-role keys or database contents in commits.
- SQL migrations are in `database/`. Preserve existing financial records and keep mutation/audit operations atomic.
- Use integer cents, basis points, half-up interest and last-installment cent adjustment. Total extra fee is fee × (installment count − 1).
- Client proposal/JPEG and simulation messages show principal, rate, interest, additional fees, effective total charge, total and all installment dates. Adhesion messages follow the current administrator-selected template, with all customer and contract values filled dynamically.
- UI and messages: pt-BR. Dates: America/Sao_Paulo. Phones: +55 + DDD + number.
- Preserve the supplied JK CRED brand (gold, silver/white, black) and responsive accessibility.
- Run `node --test tests/*.test.mjs` and inspect affected browser flows before publishing.

- Repasse societário has exactly two partner profiles: Juan Kelvin (1) and Kaik Andrade (2). Receipt splits snapshot the rule at registration; never recompute past splits when changing the default. Payouts are manual records, not bank transfers. Reversed receipts/payouts stay in history and update partner balances; negative balances must remain visible as compensation due.

- Society percentage validation must run at statement end inside the authorized gateway, never as a deferred invoker trigger after returning to the API role. Validate database changes with both `tests/society.database.sql` and `tests/society.gateway.database.sql`; owner-only tests miss API-role and deferred-trigger failures.

- Cash control starts at installation with an explicitly entered opening balance; never replay older loans/receipts against it. New loan principal debits, receipts credit, and society payouts debit cash atomically. Cash entries are append-only, ordered by sequence; corrections append compensating entries. Lock society settings before the cash account when both are needed. Normal outflows require funds; corrections may expose deficits. Verify through `tests/cash.database.sql` under the actual anon gateway role.
