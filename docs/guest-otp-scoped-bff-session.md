# Guest OTP challenge session: internal BFF composition

This change connects the backend challenge/verify transport to the existing
encrypted CREATE_REQUEST web session without exposing the CREATE_REQUEST
bearer token to browser JavaScript.

1. `startGuestChallenge` checks the exact canonical Origin and Fetch
   Metadata, then requests an OTP challenge through the internal backend
   adapter. It seals `challengeId` and a 256-bit synchronizer CSRF
   token into a separate `__Host-services_guest_challenge` Secure, HttpOnly,
   SameSite=Strict AES-256-GCM cookie (max 10 minutes).
2. `confirmGuestChallenge` checks Origin again, decrypts that cookie and
   requires the **same challenge ID** and CSRF token submitted by the
   private form. It verifies the code using server-to-server transport,
   then immediately encrypts the returned CREATE_REQUEST proof in the
   existing `__Host-services_guest_create` cookie. Only the CSRF token
   for the next private step and safe `verified:true` signal may reach
   browser UI.
3. Cookies use separate authenticated encryption domain identifiers
   (AAD) for challenge, create and READ_CANCEL scopes. Challenge
   expiration or swapping a different challenge fails closed.

**Not a public guest flow:** The application use cases have no Next.js
route mounted and require `SERVICES_WEB_ENABLE_GUEST_OTP_BFF=enabled`.
This flag is a fail-closed deployment gate, not access control.
Do **not** enable until a trusted proxy implements IP/network budgets,
an approved KZ-region provider is configured, the public route has
pre-issuance CSRF/Origin and anti-abuse defenses, and full E2E/secret
redaction tests are complete. The future route must set cookies
atomically with a no-store response and never serialize the entire
server-side return value or bearer tokens.

For browser delivery, return `challengeId`, TTL and CSRF for OTP
challenge UI. Never expose the `setCookie.value` payload as JSON.
On successful verification, return only `verified` and `csrf`
and apply the set/clear cookie commands on the server.
