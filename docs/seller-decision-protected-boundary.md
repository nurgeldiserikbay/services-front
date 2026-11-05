# Seller decision — protected frontend server boundary

## Stage 1 — Back-end decision adapter

`performAuthorizedSellerDecision` invokes the existing server-to-server seller transport and converts a safe typed outcome into the `SellerRequestList.onDecision` result shape. It uses the backend's quoted If-Match/version precondition, bearer-only account authentication, idempotency ledger and per-resource ACL. It never updates an authoritative request state locally.

## Stage 2 — Failure mapping

A 409 conflict is explicitly surfaced. A 403 is not disguised as success: the user gets a permission error. Missing/unknown requests, malformed responses, transport failures and errors yield unavailable. Callers must re-fetch after success and conflict; permission revocations should trigger session/workspace revalidation.

## Stage 3 — Test and rollout gates

Node regression tests validate all safe outcomes and ensure the adapter is server-only. Before connecting a browser UI, add real account login/issuance, a secure HttpOnly web session, Origin/CSRF checks and seller-context ACL in a same-origin BFF. Generate one idempotency key per action and preserve it for retries; do not regenerate it on timeout. Do not allow a browser-supplied bearer token or seller ID to bypass backend authorization. Guest OTP is not account authentication.

Still unimplemented in this PR: account login and session lifecycle, protected API routes, live seller workspace, end-to-end notifications, integration/browser E2E, and production release review.
