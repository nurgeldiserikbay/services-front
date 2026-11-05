# Server-only seller transport boundary

This PR adds three stages without falsely claiming browser login exists.

1. **Inbox read**: server-side `fetchSellerInbox` calls `GET /v1/me/seller-requests` with an injected 256-bit account bearer. Bounded limit/state/cursor, HTTPS in production, no browser credentials, no redirects, no caching and bounded JSON size. The result is deliberately `unknown`: the authenticated caller must run `parseSellerInboxPage` before rendering, and discard data when invalid.
2. **Decision mutation**: server-side `decideSellerRequest` calls backend `POST /v1/requests/:id/accept|decline` with strong quoted `If-Match`, a caller-generated stable idempotency UUID and the account bearer. A 409/403/404 is reported as an outcome, all other unrecognized responses fail closed. The caller must generate the key once per user decision, retain it on retry, and re-fetch server state after success/conflict.
3. **Regression tests**: check the request headers, credential isolation, malformed inputs, server reply shape and failure conditions.

## Required integration gates

This module MUST run on a trusted Next.js server, never in a client component or a browser bundle. It intentionally does not create login, read account cookies, mint sessions, authenticate an actor, decide a seller scope, set CSRF cookies or expose a public API route. Those must be implemented via the canonical account session and an Origin/CSRF-protected same-origin BFF first. Backend must enforce active account, per-request seller ACL, valid transition and idempotency independently.

Transport response contains untrusted data; use `parseSellerInboxPage`, then scope by authenticated seller workspace. Do not pass contact information, opaque access tokens or upstream response directly to the UI. For Next.js callers, prevent caching and token logging. Test account switching, permission changes and concurrency with a real PostgreSQL staging backend before activating any connected inbox.

## References

- `services-back/src/modules/requests/seller-inbox.controller.ts`
- `services-back/src/modules/requests/seller-decision-http.controller.ts`
- `docs/seller-inbox-api-adapter.md` in this repository
