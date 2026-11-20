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

## Prepared registered-customer completion BFF (2026-11-20)

- Default-off endpoint: `POST /api/account/requests/:id/complete` (requires both `SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF=enabled` and `SERVICES_WEB_ENABLE_CUSTOMER_COMPLETION=enabled`).
- Reuses the sealed, HttpOnly account session and same-origin CSRF token. Requires strong `If-Match` and exact `{}` JSON body (2 bytes); ignores browser Authorization and customer-ID claims. Backend bearer stays server-side and calls `POST /v1/account/requests/:id/complete`.
- The backend account endpoint is customer-authoritative: only an ACTIVE account session with ownership may complete an accepted request. BFF verifies a tightly bounded no-store reply and suppresses upstream errors/secrets. An unknown upstream commit outcome returns 503, never a false completion; clients must refresh state rather than assume success.
- **Not a completed user journey:** no registered-customer request inventory/UI is wired by this PR; end-user login, backend/frontend current-SHA contract CI, staging browser E2E, secure ingress, mobile flows and guest completion remain separate release gates. Do not turn on either flag solely because unit tests pass.

## Prepared customer request list and completion UI (2026-11-20)

- Default-off localized page `/{kk|ru}/account/my-requests` shows only backend-authorized registered-customer request summaries (status, version and UTC creation time), with bounded 20-item pagination. Accessible from the account dashboard when `SERVICES_WEB_ENABLE_CUSTOMER_REQUESTS=enabled`.
- Accepted requests render an explicit completion button only with the separate `SERVICES_WEB_ENABLE_CUSTOMER_COMPLETION=enabled` flag. It sends the session's CSRF token and strong `If-Match` to the same-origin BFF; no raw backend bearer or customer ID is exposed. An uncertain upstream outcome prompts users to check status, never assumes completion.
- Backend dependency: `GET /v1/account/requests` in services-back PR #359. Frontend default CI uses an older pinned backend SHA; a green PR CI does **not** prove current backend integration. The page must remain off until PR #359 merges, cross-repo current SHA integration, real login/cookie issuance and browser/staging acceptance are verified.

## 2026-11-20 current backend/client completion cross-repo acceptance test

- Frontend CI's reproducible backend pin was advanced to merged `services-back` SHA `2cebdc94a9ab574f7f6ca3011729ce6c97982a45`, containing `GET /v1/account/requests` and the authenticated completion endpoint. The pin only advances again after separately reviewed backend changes.
- New CI-only live `private-bff-customer-completion.e2e.mjs` uses uniquely generated disposable PostgreSQL identities and a sealed **test-fixture** account session to exercise real Next.js `/{locale}/account/my-requests` and `POST /api/account/requests/:id/complete` through HTTPS backend. Verifies own/foreign request isolation, denied CSRF/cross-site access, accepted → completed, experience and notification recorded once, page refresh, stale replay rejection, invalid pending-state rejection and revoked-session denial.
- The frontend's isolated CI BFF server alone enables customer request and completion flags. These remain **default-off** in normal environments. This is **not** proof of real user OTP/login, staging/KZ ingress, Android/Capacitor lifecycle, or a production rollout. Record the passing workflow run before closing a checklist acceptance gate.

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

## Verify compatibility against current backend main

The frontend CI intentionally uses a pinned backend commit for reproducible default runs. A green default run therefore does **not** establish compatibility with the latest backend `main`.

Before each release, resolve the backend's current full commit SHA and manually dispatch the frontend CI with that SHA:

```bash
BACKEND_SHA="$(git ls-remote https://github.com/nurgeldiserikbay/services-back.git refs/heads/main | cut -f1)"
test "${#BACKEND_SHA}" -eq 40
printf 'Backend main SHA: %s\n' "$BACKEND_SHA"
gh workflow run ci.yml --repo nurgeldiserikbay/services-front --ref main -f backend_sha="$BACKEND_SHA"
```

Wait for the dispatched run to complete and verify its **Tested integration revisions** summary shows the intended frontend release SHA and backend SHA. Record the run URL and both SHAs in the release evidence. Do not treat a queued, missing, cancelled or failed run as proof of compatibility. The workflow exercises database migrations, backend authorization regression tests, API boundaries and a live public search-to-profile journey; separately verify the full authenticated guest/seller lifecycle, admin MFA and staging before production rollout.
