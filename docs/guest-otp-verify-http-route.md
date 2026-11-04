# Guest OTP verification HTTP adapter — default off

The Next.js server route `POST /api/guest-requests/challenges/verify`
connects a previously issued guest OTP challenge to the existing
`confirmGuestChallenge` BFF use case.

The route is disabled unless both
`SERVICES_WEB_ENABLE_GUEST_OTP_VERIFY_HTTP=enabled` and
`SERVICES_WEB_ENABLE_GUEST_OTP_BFF=enabled`. The backend has its own
independent `SERVICES_ENABLE_GUEST_OTP_HTTP` gate.

JSON request fields must be exactly:
`challenge_id` (UUID), `csrf_token` (43-char session token),
and `code` (six ASCII digits). Streaming input is capped at 512 bytes
before allocation. An encrypted, 10-minute
`__Host-services_guest_challenge` HttpOnly cookie must already bind
the requested challenge to the submitted synchronizer token.
The BFF validates exact Origin and Fetch Metadata; the backend applies
per-challenge verification attempts and expiration.

On successful verification the backend's CREATE_REQUEST bearer proof is
sealed into the separate `__Host-services_guest_create` Secure,
HttpOnly, SameSite=Strict cookie. The challenge cookie is cleared.
The browser JSON response contains only `verified:true` and the
next CSRF synchronizer token (`csrf_token`), *never the bearer proof*.
Every response uses `private, no-store`, noindex and no-referrer.
Failure is generic, sets no cookies, and does not claim verification.

This **does not mount the OTP issue route**. Before public rollout,
implement and audit OTP issuance with an authenticated trusted-ingress
network quota identity, initial CSRF protection, provider spend limits,
real KZ-compatible SMS/email delivery, and complete E2E checks
(challenge → verify → create → status → cancel).

The existing guest request create/status Route Handlers remain subject
to their own default-off flags. Do not turn on any of these deployment
gates merely because CI succeeds.
