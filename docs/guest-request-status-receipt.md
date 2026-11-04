# Guest request receipt: private manual status refresh

This change adds a small **manual status refresh** to the existing
guest request receipt. It reuses the server-only, request-bound
`GET /api/guest-requests/{id}/status` Route Handler and does not add
polling or notification delivery.

The component only appears if:
1. The published offer explicitly permits `guest_request`.
2. The existing wizard and OTP/create HTTP feature gates are enabled.
3. `SERVICES_WEB_ENABLE_GUEST_STATUS_HTTP=enabled` is configured.

All gates default off. The browser sends ordinary same-origin
HttpOnly cookies; it must not receive the READ_CANCEL capability.
The BFF checks the cookie's request scope, calls the backend privately
and returns a strict five-field allowlisted status DTO. The UI
checks that the result matches both the committed receipt's request ID
and the original service offer ID. Unknown fields, unexpected status
values, redirects, invalid dates and oversized JSON are rejected.
`version` is monotonic to avoid displaying an older server status.
No PII or OTP is written to local/session storage or query parameters.

The button uses one in-flight request at a time, aborts on unmount,
uses no-store and never performs background polling. State labels are
localized for kk/ru, including provider/customer/mutual cancellation,
declined and expired. A failed/expired cookie shows a generic error,
not a fabricated state or a seller identity.

**Intentionally absent:** cancellation button. There is not yet an
approved/implemented guest cancellation HTTP route to call. A UI
button would be misleading and could bypass cancellation terms.
Cancellation requires a separate, authenticated Backend transaction
with fixed accepted-time terms, provider/customer reliability and
two outbox notification intents per ADR-0004.

This PR is not a production rollout approval: the OTP provider, trusted
edge integration, full E2E and notification delivery remain blocking.
