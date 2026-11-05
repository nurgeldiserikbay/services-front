# Account web session foundation — frontend

This branch adds **three stages** without creating a fictitious account login:

1. An account-only encrypted authenticated AES-256-GCM web cookie (separate purpose/AAD from guest OTP), with a strict 12-hour maximum lifetime, 256-bit backend account bearer and random CSRF synchronizer token. Session expiry is bounded by the caller's verified backend issuance TTL; caller must never extend it beyond the backend expiry.
2. A `server-only` Next.js adapter with `__Host-` Secure/HttpOnly/SameSite=Strict cookie flags, exact Origin and per-session CSRF validation for mutations, and cookie clearing. The token never belongs in JS bundles or URL/query strings.
3. Unit regression tests for tampering, timeout, wrong keys, bad token, cross-origin requests and server-only boundaries.

## Blockers and release gates

**No public login, logout or BFF routes are added in this PR.** `issueAccountWebSession` must only be called after real account OTP verification and backend account-session issuance. Web key `SERVICES_WEB_ACCOUNT_SESSION_KEY` is a dedicated 32-byte base64 secret, rotated securely. Backend session invalidation/revocation is authoritative: a cryptographically valid web cookie does **not** grant ongoing access if the backend session has been revoked or the seller role has changed. CSRF tokens must only be delivered on an authenticated, no-store private form/endpoint, not public pages. The real seller BFF must also validate session/identity/workspace, strict Origin+CSRF, idempotency and backend seller ACL.

Required next: verified account login/session issuer with rate limits, provider delivery and audit; revoke backend session on logout and invalidate local cookie; key-rotation strategy; production/staging E2E with actual users; full KZ data handling review. Never treat guest verification as a registered account login.
