# Services Frontend

Next.js public web, shared presentation packages and future Capacitor application. Canonical contracts: [services](https://github.com/nurgeldiserikbay/services).

## Implementation inventory (reviewed 2026-11-08)

The old scaffold-only summary was outdated. The repository has progressed beyond a discovery shell. Recent work includes:

- Mobile-first kk/ru discovery and public search, with server-side API boundaries.
- Guest request status UI and seller inbox/decision workflows; strict TypeScript declarations and regression coverage were addressed in [PR #47](https://github.com/nurgeldiserikbay/services-front/pull/47).
- Seller workspace fail-closed invalidation and bounded BFF response handling in [PR #48](https://github.com/nurgeldiserikbay/services-front/pull/48) and [PR #49](https://github.com/nurgeldiserikbay/services-front/pull/49).
- Feature-gated account notification inbox with HttpOnly BFF and localized event display in [PR #50](https://github.com/nurgeldiserikbay/services-front/pull/50) and [PR #51](https://github.com/nurgeldiserikbay/services-front/pull/51).
- Default-off trusted OTP verification/cookie bridge in [PR #52](https://github.com/nurgeldiserikbay/services-front/pull/52), with transport hardening in [PR #53](https://github.com/nurgeldiserikbay/services-front/pull/53).

**Important:** These PR descriptions establish implementation scope, not current merge status or passing CI. A feature-gated or unmounted module is not an enabled user journey. Do not claim production-ready login, OTP, notifications, native builds, or complete booking flows without deployment and E2E evidence.

## Release gates (all require verification)

1. Verify backend dependency versions, merged PRs, OpenAPI compatibility and latest green CI on the exact release commit.
2. Implement and securely configure the real OTP provider, trusted backend ingress, pre-auth CSRF and rate limits before enabling any public account login route.
3. Verify cookie scope, Secure/HttpOnly/SameSite, session expiry/revocation and cross-account data isolation end-to-end.
4. Run real-database guest request → seller accept/decline → status/notification journeys, including cancellation windows, idempotent retries, stale responses and unauthorized access.
5. Test kk/ru localization, keyboard accessibility, mobile layout, error/empty/loading states, and PWA/Capacitor separately.
6. Confirm KZ data residency, secrets management, privacy-safe logging, monitoring, rollback and staging smoke tests.

## Local development

Node.js 22.12+, Corepack:

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
# http://localhost:3000/kk or /ru
```

Before release:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Passing local commands alone does not replace CI, integration or staging verification.

## Ownership boundaries

Backend enforces identity, seller ownership, authorization, transactional request transitions and data protection. Frontend handles presentation, localization, accessibility and SEO, without trusting browser-provided role claims. Capacitor must use a static mobile shell rather than running Next.js SSR inside a WebView.
