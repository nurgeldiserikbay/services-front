# Seller BFF browser client and action concurrency

This feature stacks on `feat/seller-bff-http-20261106` (PR #33). Merge PR #33 before this PR, or keep this PR based on the parent until then.

## Three stages

1. **Safe same-origin browser adapter:** `loadSellerInbox` reads the default-off account BFF using same-origin cookies, explicit no-store and redirect rejection. It validates the BFF response with an allowlisted, bounded shape including an authenticated per-session CSRF token, safe request summaries and pagination cursor. Backend account bearer never appears in the browser adapter, URL or client headers.
2. **Decisions with stable retry identity:** `sendSellerDecision` sends only the request ID/version, action, CSRF and a caller-supplied idempotency UUID. It preserves the key rather than generating a new one after a timeout. Responses map 409 -> conflict, 403 -> forbidden, and malformed/unknown responses -> unavailable. It never claims the request state changed until a subsequent server refresh.
3. **UI concurrency and regression:** Both accept/decline buttons are disabled while any action or refresh is pending, rather than permitting overlapping decisions from separate rows. Tests cover bad responses, off-origin credential leaks, malformed filters, duplicate requests, and action results.

## Not yet a live seller workspace

The component is still not mounted: a real account OTP login, backend account-session issuer, secure route deployment, active seller workspace selection and full browser + PostgreSQL E2E remain necessary. The server inbox endpoint returns account-authorized aggregate records; do not present the aggregate as a single seller ID. On account switch/logout, clear all cached pages and CSRF. For timeout retries, retain the **same idempotency key and payload**, and do not optimistically accept/decline. Never turn on `SERVICES_WEB_ENABLE_SELLER_BFF` publicly without verifying account login and all release gates.
