# Internal BFF OTP transport — not publicly mounted

This change implements a strict server-to-server client for the two
existing Backend OTP HTTP endpoints. It is **not** a browser component,
public Route Handler, or a production-ready OTP service.

- **Issue** sends a verified, bounded `channel/contact/locale` payload
  only to the configured backend. It accepts HTTP 202 and exact
  `{challenge_id}`, without leaking the recipient or OTP.
- **Verify** sends a six-digit code for an exact challenge UUID. It accepts
  HTTP 200 and exact `{guest_capability,expires_at}`, with a proof
  expiring within 15 minutes. The raw proof is for server-only use;
  production BFF must immediately seal it in the existing
  `__Host-services_guest_create` HttpOnly cookie.
- Both use configured HTTPS in production, no forwarded browser cookies,
  no redirects, no shared caches, 5s timeout, bounded JSON and generic errors.

**Remaining launch gates:** approved KZ-resident SMS/email provider,
trusted-ingress network/IP budgets, public BFF session initiation,
CSRF/Origin and Fetch-Metadata guards *before OTP issue and verify*,
cookie issuance/rotation in a secure Next.js route handler, and
end-to-end delivery, create, status, cancellation and notification tests.

No user-facing OTP endpoint is enabled by this PR. In particular, do
not allow a browser to receive the CREATE_REQUEST bearer proof.
