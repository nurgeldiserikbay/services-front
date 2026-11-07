# Protected registered seller workspace

## Stage 1 — guarded application page

The registered seller inbox is mounted at `/kk/account/requests` and `/ru/account/requests` only when **both** `SERVICES_WEB_ENABLE_SELLER_BFF=enabled` and `SERVICES_WEB_ENABLE_SELLER_WORKSPACE=enabled` are explicitly configured. The page uses a sealed HttpOnly web-session cookie but must also revalidate that account with a backend seller-inbox request before rendering. Invalid locale, missing/revoked account, disabled flags, and backend outages fail closed. The page is dynamic and not cached. No link is added to the public marketplace.

The seller inbox is account-wide: authorized professional and organization requests share the same page without letting the browser choose a seller identity. Backend membership and per-request ACL remain authoritative.

## Stage 2 — expired session UX

The same-origin browser seller inbox client now classifies 401 as an authentication failure, not a server outage. On expired/revoked session, the client-side workspace clears old private request data and retained mutation retry keys. The mutation endpoint already propagates unauthorized status; the UI now handles it and displays localized Kazakh/Russian sign-in guidance. Uncertain network outcomes retain their original idempotency key for a safe retry after verification of fresh server state. No client-side backend bearer or localStorage is used.

## Stage 3 — regression and release dependencies

Automated tests check backend revalidation, default-off route flags, no public bearer, 401 vs 5xx classification, and stale inbox clearing. The new route is not a deployed-browser E2E test.

**Release gate:** Do not enable until real registered-account signup/login and vetted SMS/email OTP delivery/consent are complete, the secure HttpOnly cookie is issued by a trusted BFF, backend and frontend environment flags are reviewed, and browser E2E verifies no disclosure of other seller workspaces. A proper login redirect for expired sessions should be added only after a real login route exists. Showing a denied/404 page until then is intentional and safer than a nonfunctional redirect.

Service acceptance is a request status change only; it does **not** confirm a time slot or initiate price negotiation.
