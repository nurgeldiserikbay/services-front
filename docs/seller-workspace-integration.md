# Services seller workspace integration (not yet mounted)

## Stage 1 — reconcile PR #34 with main

PR #34 was merged into the former PR #33 feature branch, not main. Although its CI passed, `seller-bff-client.mjs`, its TypeScript declaration and tests were absent on main. This PR copies those files to a main-targeting branch and hardens the browser-side item allowlist: unexpected private fields cause a fail-closed response.

## Stage 2 — account-wide inbox composition

`SellerAccountInbox` uses the existing same-origin BFF's GET and accept/decline endpoints. It marks each row's professional or company context; the underlying API is an account-wide authorized inbox, **not** a single seller workspace, and no client seller ID grants permissions.

The component handles loading, pagination, cursor-cycle avoidance, request-version reconciliation, refresh, per-action busy state, stable retry idempotency UUID per (request, version, action), and stale-version locks after confirmed/conflicting decisions. Failed/ambiguous mutations retain the same key for retries. No optimistic status transition.

## Stage 3 — regression and rollout gates

Added browser-adapter strict-schema and workspace source tests. The component stays **unmounted**: there is still no verified registered-account OTP login/session issuance, logout/revocation flow, seller-workspace routing or end-to-end staging evidence. Do not enable `SERVICES_WEB_ENABLE_SELLER_BFF` publicly until backend login is completed, account session rotation/revocation is tested, backend ACL is verified with real identities, CSRF/Origin and rate limiting pass review, and full browser/PostgreSQL E2E covers requests, cancellations and notifications.

The account-wide inbox may include several distinct organizations and professionals; seller-kind labels do not uniquely identify them. A future explicit workspace route should return seller IDs only through a vetted authorized projection, with server-side membership verification and independent cache keys. Do not treat the current UI component as that final per-workspace solution.
