# Internal verified guest create BFF adapter

This module prepares the **server-to-server create step** after the guest
has already verified a contact. It intentionally does NOT add a public
Next.js route and cannot yet submit a live request: the backend's public
`POST /guest-requests` is not mounted, and an approved OTP provider,
network-level budgets, and a reviewed BFF route remain prerequisites.

## Flow

1. A future private BFF route validates the browser's secure CREATE_REQUEST
   session, CSRF synchronizer and exact Origin/Fetch Metadata.
2. `sendVerifiedGuestCreate` sends a strict
   `{service_offer_id,note?,consent_to_contact:true}` JSON body over HTTPS
   to `SERVICES_API_BASE_URL/guest-requests`, with a 5-second timeout,
   `Idempotency-Key`, and `Guest-Capability` (never browser cookies).
   It rejects invalid input before I/O and checks exact committed response
   shape `{id,state:'pending',request_capability,expires_at}`.
3. `submitVerifiedGuestRequest` seals `request_capability` into the
   request-ID-bound, HttpOnly READ_CANCEL session and prepares the
   CREATE_REQUEST cookie for removal. Only `{id,state}` appears in the
   browser-facing receipt. The caller **must** set both cookie instructions
   and must not return the internal response or the CSRF token accidentally.

The internal backend transaction currently returns camelCase
`requestCapability` and `expiresAt`; when a real HTTP controller is built
it MUST map to the canonical OpenAPI snake_case response above. The adapter
does not guess alternate shapes or silently treat OTP verification as a
committed ServiceRequest.

## Outstanding gates

- Approved Kazakhstan-resident SMS/email provider and reconciled delivery.
- Network/device throttling and secure BFF OTP issuance/verification endpoints.
- BFF request body size, per-IP budgets, session rotation, CSRF transport,
  Origin and same-site handling, anti-enumeration, and deployment topology.
- Real backend create endpoint under reviewed guest capability ACL.
- E2E create/retry, ambiguous COMMIT, double-submit, provider failure,
  expiry, recovery, cancellation and notification-delivery coverage.
- No user-specific request data in SSR/CDN caches or analytics.

Until then no public submission button is enabled. Unit tests verify strict
response parsing, confidential server-side headers, idempotency, timeout
configuration and absence of a public route.
