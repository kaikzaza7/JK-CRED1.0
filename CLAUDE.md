# JK CRED — Agent Instructions

This repository is now a PRIVATE administration panel. There is no customer portal and no in-app email/password login.

- Production code lives in `painel/`, deployed to Vercel project `jk-cred-admin`.
- Keep Vercel Authentication enabled for ALL deployment URLs and domains. The server API relies on this access boundary.
- Vanilla JavaScript ES modules, HTML and CSS, no build dependencies. Node.js 24 for `painel/api/gateway.mjs`.
- Browser requests go to `/api/gateway`, with same-origin JSON POST and CSRF origin checks. Server-only configuration must never reach the browser.
- Supabase schema uses additive `jk_*` tables with RLS and protected RPCs. Never put secrets, service-role keys or database contents in commits.
- SQL migrations are in `database/`. Preserve existing financial records and keep mutation/audit operations atomic.
- Use integer cents, basis points, half-up interest and last-installment cent adjustment. Total extra fee is fee × (installment count − 1).
- Copy client proposal and WhatsApp message should show principal, rate, interest, additional fees, effective total charge, total and all installment dates.
- UI and messages: pt-BR. Dates: America/Sao_Paulo. Phones: +55 + DDD + number.
- Preserve the supplied JK CRED brand (gold, silver/white, black) and responsive accessibility.
- Run `node --test tests/core.test.mjs` and inspect affected browser flows before publishing.
