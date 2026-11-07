# Seller workspace session invalidation and private pagination

## Stage 1 — fail-closed paginated reads

If the live seller inbox cursor request fails due to backend downtime, invalid payload, cursor loop, or other error, the legacy paginated seller workspace no longer continues showing previously fetched private records. It clears rows, cursor and CSRF; a full authenticated refresh is required. This prioritizes privacy over an offline inbox cache. A 401 explicitly marks the user unauthorized and discards retained idempotency keys.

## Stage 2 — seller decision 401

A mutation can be the first request to discover that the account was revoked or its cookie expired. When a decision returns HTTP 401, clear all previously displayed private seller data, CSRF, cursor and retained keys, bump request generation to invalidate in-flight pagination responses and render the reauthentication state. It does not report a successful decision.

## Stage 3 — CI regression

Source-boundary tests assert account revocation handling in full refresh, cursor fetch, and decision API; session failure clears token/nonce state; ambiguous ordinary transport failures continue to preserve original idempotency keys for safe retry after a fresh authenticated read.

No login provider, public bearer, price negotiation, automatic appointment confirmation or refresh token storage has been introduced. Manual browser E2E for concurrent logout, expired cookies and flaky cursor fetch remains a launch gate.
