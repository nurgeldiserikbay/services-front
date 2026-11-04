# Default-off OTP initiation + CSRF bootstrap

The two methods at `/api/guest-requests/challenges/start` prepare
the first stage of the guest request flow without exposing a raw
bearer proof or trusting client-supplied network headers.

## Bootstrap (GET)
Requires `SERVICES_WEB_ENABLE_GUEST_OTP_START_HTTP=enabled` and
`SERVICES_WEB_ENABLE_GUEST_OTP_BFF=enabled`. Otherwise returns 404.
Only same-origin Fetch Metadata (or a direct navigation with no Origin)
is accepted against the configured `SERVICES_WEB_ORIGIN`.
A fresh five-minute AES-256-GCM authenticated,
Secure/HttpOnly/SameSite=Strict `__Host-services_guest_otp_init`
cookie is issued, and the synchronizer `csrf_token` returned as
private, no-store JSON. The bootstrap doesn't send an OTP.

## Issuance (POST)
Requires the same feature gates, exact Origin and same-origin Fetch
Metadata, a valid encrypted initiation cookie and matching CSRF token.
Payload shape: `{channel:'sms'|'email',contact,locale:'kk'|'ru',
csrf_token}`. Unknown keys, network headers, malformed destinations,
invalid Unicode/JSON and any body above 512 bytes are rejected.
The body is read incrementally and terminated on overflow.

Only after validation does the BFF call existing
`startGuestChallenge`. On confirmed successful backend delivery
it issues the encrypted challenge cookie, returns only challenge ID,
expiry and a new synchronizer, and clears the initiation cookie.
Failures return generic no-store 503 without falsely claiming a code
was issued. A stateless CSRF cookie is not a one-time server nonce:
attempt counters and network/global spend quotas remain essential.

## Important fail-closed deployment boundary

**Do not enable the route simply because tests pass.**

Backend `POST /v1/guest-requests/challenges` requires a fresh,
signed `X-Services-Network-Proof` from a trusted reverse proxy.
The current BFF transport does **not** synthesize or forward this
header; a direct BFF-to-backend request therefore fails closed.
Only an approved proxy that authenticates the real remote address,
strips browser-supplied network headers, hashes stable IP prefixes
with a keyed secret and signs the assertion may be used. The gateway
must ensure the validated client identity survives the Web BFF hop
without trusting a browser-provided IP. Do not derive that identity
from `X-Forwarded-For` directly inside this route.

Other launch gates: KZ-resident SMS/email provider, verified ingress
deployment, abuse/spend budgets and provider delivery telemetry,
origin/cookie pen test, full OTP → create → status → cancel E2E,
notification delivery and operational monitoring. No live provider,
proxy infrastructure or user-facing wizard is enabled by this PR.
