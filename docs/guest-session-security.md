# Server-only guest create session core

This is a **security primitive**, not a live OTP endpoint or an enabled guest
request form. The site deliberately keeps its request UI unmounted until
an approved SMS/email provider, server-side abuse budgets and end-to-end BFF
protection are available.

## Design
- `guest-session-core.mjs` creates short-lived (up to 15 minutes) AES-256-GCM
  authenticated, random-IV cookies with a purpose bound through additional
  authenticated data (AAD).
- A distinct 256-bit CSRF synchronizer token is generated inside the encrypted
  session. It can be shown in a private form; the guest create capability
  must never be given to browser JavaScript.
- `guest-session.server.ts` is Next.js server-only and uses
  `__Host-services_guest_create`, `Secure`, `HttpOnly`, `SameSite=Strict`,
  `Path=/`. It requires an exact configured
  `SERVICES_WEB_ORIGIN` and rejects cross-site Fetch Metadata. Production
  origin must use HTTPS.
- `SERVICES_WEB_GUEST_SESSION_KEY` is a **separate**, high-entropy 32-byte
  key in standard padded base64; must live in KZ-resident secret management.
  Never reuse backend OTP HMAC or contact encryption keys.

## Missing gates before usage

- Set the cookie only after successful server-side OTP verification; do not
  call `issueGuestCreateSession` in a public route without global/network
  and recipient quotas.
- BFF must validate session+CSRF+Origin on every write and forward capability
  over trusted TLS only, without making it a URL parameter, response body,
  public cache key, log or analytics event.
- Clear the create session on successfully created request. Creation failure
  must retain a valid proof to retry the create operation with the same
  Idempotency-Key; never repeat the consumed OTP verification.
- Limit request body size, log redaction, payload schema, abuse monitoring,
  and production cookie hostname/topology must be reviewed independently.
- Confirm Next.js hydration and production HTTPS cookie behavior on staging.
  Add replay, race and multi-tab integration tests for the actual BFF routes.

Runtime tests exercise cookie tamper resistance, expiry, CSRF and strict
origin checks. A passing unit test is not a production security assessment.
