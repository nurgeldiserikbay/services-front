# Services Frontend

Next.js public web, shared presentation packages and future Capacitor application. Canonical contracts: [services](https://github.com/nurgeldiserikbay/services); current G0 review: [PR #4](https://github.com/nurgeldiserikbay/services/pull/4).

## Current implemented foundation

- Next.js 16 SSR web application in `apps/web`, pnpm workspace.
- Mobile-first multilingual kk/ru discovery shell; country/global scope controls and accessible search form.
- Typed server-side public `GET /v1/search` fetcher with input/response checks and no guest token forwarding.
- Empty, unavailable and result states. No fabricated specialists, reviews, ratings or organizations.
- CI checks types, baseline tests and Next.js production build.

**Not implemented:** actual search API backend, business pages, auth, guest OTP, bookings, PWA offline flows, Capacitor native builds and admin portal. The landing screen is a real frontend foundation, not a production-ready catalog.

## Local development

Node.js 22.12+, Corepack:

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
# http://localhost:3000/kk or /ru
```

Set `SERVICES_API_BASE_URL` to the backend HTTPS endpoint when public search exists. The current backend implements health only; a search attempt correctly reports service unavailable instead of inventing results.

## Parallel development boundaries

The backend enforces seller ownership, ACL, request transitions and data protection; frontend handles localization, accessibility, SEO and presentation without redefining domain logic. Never run Next.js SSR inside Capacitor WebView: mobile runtime receives its own static application shell and uses shared feature/UI packages.

The first independent delivery after scaffold is catalog search (API and web integration) followed by professional/organization public pages.
