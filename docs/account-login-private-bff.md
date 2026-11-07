# Trusted account OTP verification — web integration foundation

## Stage 1 — server-only backend transport

`verifyBackendAccountOtp` calls the backend PR #81 `POST /v1/auth/private/account/verify` through a configured backend URL and independent 32-byte `SERVICES_WEB_ACCOUNT_LOGIN_BFF_KEY`. The POST has no browser credentials, redirects, or cache, a 5-second timeout, an exact request schema and a streamed 2 KiB response limit. Only an exact `session_token` and 1–43200 second TTL can be accepted. Provider errors and arbitrary JSON never reach the browser.

## Stage 2 — sealed HttpOnly session handoff

The default-off `exchangeVerifiedAccountOtpForCookie` function runs only on the server behind `SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF=enabled`. It exchanges a verified one-time account OTP for a backend bearer, then seals the bearer with the existing AES-GCM account cookie service. It returns only Secure, HttpOnly, SameSite=Strict cookie instructions and a synchronizer CSRF token. The raw backend bearer stays in server memory and is not returned from the bridge.

This PR **does not add a browser-accessible login route**. A public route must not invoke this bridge until there is a pre-auth challenge cookie, same-origin/CSRF proof, abuse controls, verified trusted ingress, rate limits, approved Kazakhstan OTP provider, logging redaction, and an explicit server-side setting that the backend private verification route is ready. The backend service key must never be exposed through a NEXT_PUBLIC variable or sent by the browser. Existing seller/account UI stays gated.

## Stage 3 — tests and remaining release conditions

Unit tests cover URL and service-key handoff, exact response validation, 401 denial, redirect denial, invalid input, encrypted browser cookie, and server-only feature gating. Merge backend PR #81 and confirm main green before enabling the web bridge. No real SMS/email provider, sign-up or interactive login page is activated by this change.

## Defensive transport hardening (2026-11-08)

Private OTP transport rejects noncanonical BFF service key material, URL credentials, query/fragment strings, percent-encoded or ambiguous path segments, and all non-HTTPS production URLs before any network request. Keep the backend URL controlled by server configuration only. Regression tests cover pre-network rejection, streamed responses exceeding 2 KiB without a declared length, cancellation, malformed JSON, invalid MIME and non-success statuses. These are defense-in-depth checks, not SSRF protection against a compromised configuration or a replacement for trusted ingress and deployment network egress policies.
