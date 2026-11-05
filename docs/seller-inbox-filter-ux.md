# Seller inbox: local filters and stale action guards

This change extends the existing unmounted `SellerRequestList` presentation component, not seller authentication or backend request APIs.

## Scope (three incremental stages)

1. **Seller-scoped filter/count:** all, pending, accepted, closed (declined, cancelled, completed, expired) are applied only to data already supplied by an authenticated caller. Counters are **current-page-only**, not server totals. Filtering does not grant access or query other sellers.
2. **Safe decisions:** one in-flight mutation per request; successful and version-conflicting decisions block repeat actions on the same stale version until the caller provides a newer version. The backend remains the authority for ACL, concurrency, idempotency and state changes. An accepted request does not mean its time was confirmed.
3. **UX and regression checks:** kk/ru labels, keyboard-focusable native buttons, `aria-pressed`, empty filtered state, disabled actions and lightweight source-level tests.

## Still required before live rollout

Mount only after a real authenticated seller workspace and secure same-origin BFF session with CSRF/Origin checks exist. Always re-fetch the inbox after a decision. Use server cursor pagination; the counters shown here cover the loaded page only, and server-authoritative totals need their own contract. Cross-seller data and guest contact information must not be supplied as props. Test against backend with a real seller session; source-level tests are not end-to-end confirmation. No public page exposes the component.
