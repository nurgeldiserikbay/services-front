# Private guest request access session (READ_CANCEL)

This is an internal security primitive in the Next.js server, **not** a public
request-status or cancellation endpoint.

Upon a confirmed backend response to `POST /guest-requests`, the BFF will
eventually be able to replace the one-time CREATE_REQUEST cookie with a
request-scoped READ_CANCEL session. It binds a request UUID and an opaque
capability in authenticated AES-256-GCM ciphertext, never in JavaScript,
URL parameters, public caches, telemetry or HTML responses.

- Cookie: `__Host-services_guest_request`; Secure, HttpOnly,
  SameSite=Strict, Path=/, with expiry no later than the original backend
  capability expiry (maximum **24h** per ADR-0005).
- Requires exactly matching request ID, synchronizer CSRF token and
  same-origin request for mutations.
- Different authenticated-encryption associated data (AAD) from the
  CREATE_REQUEST session means the tokens cannot be swapped between scopes.
- No request status is loaded by guessing a request UUID; server-side
  authorization against the backend remains mandatory.
- One cookie slot is supported; issuing another request's access session
  replaces the previous one. Future multi-request navigation requires
  re-verification/recovery, not an unscoped token list in browser storage.
- Existing backend-issued READ_CANCEL tokens valid for 30 days are not
  retroactively revoked by the Backend PR shortening *new* tokens to 24h.

Before enabling endpoints, connect this adapter only to a secure BFF with
Origin+CSRF enforcement, network/provider rate limits, idempotent request
creation, server-side request validation, and a real READ_CANCEL authorized
backend resource. Clear CREATE_REQUEST on success, handle uncertain
COMMIT/retries and ensure no secret is returned in a client response.

Unit tests cover scope binding, expiry, tamper resistance, secret isolation,
and request ownership mismatch. CI success does not mean the guest request
flow is currently usable.
