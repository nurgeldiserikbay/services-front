# Seller BFF account session expiry contract

## Stage 1 — upstream session validity

When the account bearer is expired, revoked, or its owner is no longer ACTIVE, the backend's seller inbox or decision API returns HTTP 401. The server transport now recognizes this separately from a network outage, redirect, invalid body or 5xx status. A 403 still means missing seller permission, a 409 means a request version conflict, and failures remain fail-closed.

## Stage 2 — same-origin BFF response

The private seller inbox BFF responds with a narrow 401 `{code:"AUTH_REQUIRED"}` for missing/invalid web cookies or backend authentication rejection. The mutation BFF likewise returns 401 on an invalid web session or backend rejection. No cookie, bearer or upstream response body is returned to the browser, and existing no-store, default-off, Origin/CSRF, idempotency and seller ACL protections are retained. No new login issuance endpoint is introduced.

## Stage 3 — browser UX and regression tests

The browser decision client returns the new `unauthorized` outcome on 401; the seller request component displays localized kk/ru session-expired messaging. This is distinct from `forbidden`, `conflict` and `unavailable`. The inbox client still fails closed when authentication is unavailable and requires the parent to arrange login navigation; it does not create credentials or auto-retry with a new idempotency key. Regression tests cover backend status mapping, BFF boundary and browser outcome.

## Launch gates

Real registered-account OTP delivery and BFF cookie issuance remain separately gated. Logout and session expiry must be tested in actual browser E2E; UI must avoid automatically resubmitting a mutation after reauthentication. On an uncertain result, refresh server state before retrying with the original stable idempotency key. Never store a backend bearer in browser JavaScript or localStorage.
