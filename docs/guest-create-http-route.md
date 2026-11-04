# Gated guest request create BFF route

`POST /api/guest-requests` is a Next.js **server-only**, **default-off**
route, guarded by `SERVICES_WEB_ENABLE_GUEST_CREATE_HTTP=enabled`.
It does not mount the guest wizard on published offer pages.

The accepted JSON shape is exactly:
`csrf_token`, `idempotency_key`, `service_offer_id`,
`consent_to_contact=true`, optional `note` (up to 1000 characters).
Both declared and actual request size are bounded to **2048 bytes**,
with strict UTF-8/JSON parsing and an allowlist that excludes seller
IDs, untrusted capabilities, and contact data.

The route calls the existing `submitVerifiedGuestRequest` use case:
it authenticates a short-lived CREATE_REQUEST capability in a
`__Host-services_guest_create` HttpOnly cookie, verifies synchronizer
CSRF and exact configured Origin / Fetch-Metadata, then sends the
idempotent request to the Backend over private server-to-server HTTP.
The Backend must have its separate
`SERVICES_ENABLE_GUEST_CREATE_HTTP=enabled` gate.

Only after the Backend confirms a committed request (HTTP 201)
does the BFF set a distinct request-bound `__Host-services_guest_request`
READ_CANCEL HttpOnly cookie, clear the CREATE_REQUEST cookie and return
**only** `{id,state:'pending'}`. The capability, provider response,
recipient and cookie values never appear in JSON response bodies.

Failed or uncertain requests return a generic no-store 503 and do
**not** clear the CREATE_REQUEST cookie. A browser retry must reuse
the **same idempotency key** to avoid double creation. The backend
enforces idempotency; this route never guesses that a failed call
committed or did not commit.

The endpoint stays disabled pending trusted ingress deployment,
approved OTP delivery with Kazakhstan processing/residency,
rate limiting/spend budgets, cookie/CSRF/Origin penetration tests,
user-facing BFF orchestration and full E2E (OTP → create → status →
cancel → notifications). It must not be switched on merely because
CI passes.
