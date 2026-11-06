# Seller HTTP BFF foundation (default disabled)

This change builds on the existing account web cookie and server-only backend transport, without inventing a user login or trust in client-supplied seller IDs.

## Stages

1. **Authenticated inbox read**: `GET /api/seller/requests?limit=&state=&cursor=` accepts a strictly bounded query, verifies the encrypted account cookie on the server, fetches backend seller-authorized rows, validates their allowlisted public-safe UI projection, and returns only `items`, `next_cursor` and a per-session `csrf_token`. The last field must only be returned to an authenticated same-origin browser request, never cached or rendered to unauthenticated clients. Account may own several seller contexts: backend authorizes all returned rows; UI must not mislabel this aggregate as a single workspace.
2. **Protected decisions**: `POST /api/seller/requests/:id/:decision` (accept or decline) accepts ONLY `{version,csrf_token,idempotency_key}` and a small JSON body. The server validates Origin, CSRF and the authenticated cookie, then calls backend with the account bearer, strict If-Match and caller-provided stable idempotency key. Backend independently checks request ACL and account session validity; responses map to safe outcomes with no upstream data forwarded.
3. **Security regression tests**: query/body parsing, streamed byte limits, cross-site rejection and default-off route guards. Route and helper tests do not substitute for staging end-to-end verification.

## Release gates

**Routes are disabled by default** unless `SERVICES_WEB_ENABLE_SELLER_BFF=enabled`. Do not enable in any public deployment until verified account OTP login issuance is available, session revocation/rotation and seller ACL have passed integration tests, CSRF tokens are sent only on same-origin private views, and secure ingress and rate limiting are audited. Require a consistent verified backend session proof; never use guest OTP capability as an account bearer. Keep `SERVICES_WEB_ACCOUNT_SESSION_KEY` separate from other keys.

The existing `SellerRequestList` is intentionally not mounted as a live seller workspace here. A following integration must include authenticated workspace routing, cursor pagination, session switching cleanup, 401/403 handling, disabled duplicate actions, and a full frontend/backend/PostgreSQL E2E test before enabling this feature.

No claim of working production login, notifications or actual seller bookings.
