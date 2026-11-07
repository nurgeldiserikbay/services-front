# Account device sessions — browser client and reusable UI

This is a **stacked PR** depending on services-front PR #39 and services-back PR #68. It must be merged after the underlying BFF and backend route are merged and verified.

## Stage 1 — strict same-origin account device browser client

`loadAccountDevices` fetches `GET /api/account/sessions` with same-origin credentials and no-store. It rejects oversized/malformed responses, unknown fields, duplicate IDs, missing or multiple current session records and secret-bearing response objects. The browser never receives or sends the backend bearer. The returned CSRF token is only supplied as the `x-services-csrf` header for `DELETE /api/account/sessions/:id`, where 204 is the sole confirmed logout response.

## Stage 2 — lightweight Kazakh/Russian device management

`AccountDeviceSessions` is a reusable responsive client component, for a **future authenticated account settings page only**. It shows current session, optional device labels, last used and expiry times; offers refresh and a remote logout button only for non-current sessions. It serializes mutations, disables controls during requests, and reloads server state after confirmation rather than optimistically removing a session. Errors and status are accessible; no client-side bearer, device fingerprint or localStorage is used.

This change does not install the component on the public marketplace or expose a public session-issuance flow.

## Stage 3 — test and production integration gates

Tests verify strict response shape, same-origin credential policy, CSRF-only DELETE, status mapping, no raw Authorization, Kazakh/Russian labels and post-mutation refresh. Before deploying, merge backend PR #68, merge frontend PR #39, connect real registered-account OTP login and HttpOnly cookie issuance, mount the component behind an authenticated route, verify expired/foreign sessions and CSRF in real browser E2E, and approve Kazakhstan data residency/privacy decisions.

The displayed last-used time is approximate (the existing backend updates it at a bounded cadence) and should not be presented as an exact audit trail.
