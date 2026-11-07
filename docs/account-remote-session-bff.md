# Account session device revocation BFF

## Stage 1 — narrow backend transport

The server-only `revokeBackendAccountSessionById` sends an opaque registered-account bearer to backend `DELETE /v1/auth/sessions/:id` and accepts only 204. It rejects redirects, non-204 status codes, invalid session UUIDs, malformed bearers and insecure production upstream base URLs. The browser does not receive the bearer or access backend credentials.

## Stage 2 — CSRF-protected remote-only browser route

`DELETE /api/account/sessions/:id` is disabled unless `SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF=enabled`. It requires an authenticated sealed HttpOnly cookie, an exact trusted Origin, same-origin Fetch Metadata, `x-services-csrf`, a strict session UUID and an empty body/query string. The BFF refreshes the backend's authenticated session list and permits only an owned, *non-current* session ID. The current session continues to use the existing `POST /api/account/logout` handler so the cookie gets cleared correctly. It returns 204 on confirmed remote logout; 404 for unknown or unauthorized targets, 409 for the current session, 503 if backend confirmation fails. Responses are private, no-store, noindex. No account email, token hash, bearer, device family or upstream body is disclosed.

## Stage 3 — test and rollout gates

Contract tests cover DELETE/204 transport, denied redirects/errors/malformed credentials and route source boundaries for CSRF, ownership check, current-session guard and no browser bearer. These are not deployed-browser E2E tests.

Backend PR #68 must merge before enabling the route. Web account session issuance remains default-off until actual approved OTP delivery and authenticated login/consent onboarding are complete. Server authorization rechecks ownership atomically in backend SQL; a BFF inventory preflight is only a UX guard. The UI must refresh session inventory after a 204, and should distinguish an uncertain 503 from a confirmed logout. In production require a reviewed KZ-compliant provider, secrets, base URL, HTTP cookie and CSRF deployment, threat assessment and browser E2E.
