# Authenticated seller inbox — scoped server boundary

## Three-stage hardening

1. **Scope checking:** `assertSellerInboxScope` requires every backend item to match the server-authorized seller identity (both immutable seller ID and kind). Mixed-result pages are rejected wholesale. Never trust a seller selector from browser input as authentication. Organization membership and professional ownership MUST still be verified by the backend.
2. **Server-only composition:** `readAuthorizedSellerInbox` combines protected bearer transport, scope validation and the existing PII-minimizing `parseSellerInboxPage`. Raw backend DTOs are never returned to UI callers. No public routes or session issuers are introduced.
3. **Regression checks:** Node unit tests exercise mixed-seller rejection and the server-only/allowlist boundary.

## Still blocked for production

Implement a verified registered-account login/session lifecycle and same-origin HttpOnly session boundary. Resolve active professional/organization workspace on the **server**, with per-resource ACL and Origin/CSRF on mutations. Mount this module only in a protected server route after verifying the active workspace. Use strict cache isolation across account/workspace changes, revalidate pagination and maintain idempotency. Guest OTP is not registered-account authentication. Run real PostgreSQL integration, cross-account isolation and browser E2E tests before release.

This change does not claim logged-in seller UI, production login, or live booking flow.
