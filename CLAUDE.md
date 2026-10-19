# JK-CRED — Agent Instructions

This file guides AI agents working on the JK-CRED codebase.

## Project Overview

JK-CRED is a single-page application (vanilla JS + CSS) for credit management:
- **Client side**: solicitar empréstimos, acompanhar parcelas, falar com a equipe via WhatsApp
- **Admin side**: gestão de clientes, solicitações, empréstimos, parcelas, vencimentos
- **Backend**: Supabase (Auth + Database + Edge Functions)
- **Routing**: hash-based (`#/cliente`, `#/admin`, etc.)

## Agent skills

### Issue tracker

GitHub Issues (uses `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Coding Standards

- **Vanilla JS/HTML/CSS** — no build step, no framework
- **Supabase client** via CDN (`@supabase/supabase-js` UMD)
- **Session storage only** — no persistent localStorage for auth
- **Portuguese (pt-BR)** for UI strings, English for code/comments
- **Mobile-first**, responsive breakpoints at 900px / 520px
- **Accessibility**: semantic HTML, ARIA labels, focus-visible, reduced motion

## Key Files

- `index.html` — all HTML, CSS, routing, components
- `auth.js` — Supabase auth, forms, validation, session management
- `config.js` — public Supabase config (URL + anon key)
- `docs/agents/` — agent skill configuration

## Architecture Notes

- Single `index.html` loads everything; `auth.js` loads after and extends `routes`
- Hash routing via `hashchange` event; `render()` rebuilds `#app`
- `JKAuth` singleton manages session, redirects, form binding
- Admin routes use `AdminShell` with side-nav; client routes use `Topbar`
- Edge Function `acesso-cliente` handles client login/password recovery
- RLS + `is_admin` RPC for authorization