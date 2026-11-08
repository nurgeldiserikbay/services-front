# Frontend integration release gates

Status: **unverified / default off**. A merged feature does not imply an enabled user journey.

## Gate F1 — account login
- Backend trusted OTP endpoint, provider and ingress restrictions approved before exposing login UI/routes.
- Only server-held service credentials reach private backend; no bearer, OTP or token in browser JSON, URLs, logs or local storage.
- Session cookie: Secure, HttpOnly, SameSite and appropriate path/domain; reject unsafe redirects and forged CSRF/origin.
- Test missing/expired/revoked sessions, replay, repeated OTP attempts, oversized/invalid backend replies, timeouts and cross-account isolation.

## Gate F2 — request and seller workflows
- Real backend integration: discovery → professional/organization page → guest verification → request → status → seller accept/decline → notifications → cancellation.
- Confirm kk/ru UI and accessibility, keyboard operation, mobile widths and failure/loading/empty states.
- Seller inbox must clear private data on 401/logout, stale pagination, account switch and malformed responses.
- Keep idempotency key stable for ambiguous retries; never show success on unverified acknowledgement.
- Verify cancellation policy is enforced by backend, not only client time.

## Gate F3 — release evidence
- Exact commit: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`.
- E2E against a real staging backend/database, with negative permission and concurrency cases.
- Validate CSP, cookies, caching of private responses, no exposed secrets and monitoring/error redaction.
- PWA offline and Capacitor native shell are separate acceptance targets; never claim them from Next.js SSR build alone.
- Record backend/frontend commit SHAs, API contract version, CI links and staging sign-off.

## Dependencies
F1 depends on backend OTP provider, pre-auth CSRF, rate limiting and trusted ingress. F2 depends on backend request state machine, notification outbox and tested DB migrations. Do not enable default-off features to bypass gates.
