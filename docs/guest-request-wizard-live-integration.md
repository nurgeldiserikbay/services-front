# Guest request wizard — first public-offer composition (gated)

This change connects the **existing** presentation components
`GuestInquiryDraft` → `GuestOtpStep` → `GuestRequestReceipt`
through `ConnectedGuestRequestWizard`. It does not duplicate the
wizard or add a new backend domain model.

The server-rendered published service page includes this component
**only when** the published offer explicitly supports
`contact_methods: ['guest_request', ...]` AND all five environment
flags are enabled:

- `SERVICES_WEB_ENABLE_GUEST_WIZARD=enabled`
- `SERVICES_WEB_ENABLE_GUEST_OTP_START_HTTP=enabled`
- `SERVICES_WEB_ENABLE_GUEST_OTP_VERIFY_HTTP=enabled`
- `SERVICES_WEB_ENABLE_GUEST_OTP_BFF=enabled`
- `SERVICES_WEB_ENABLE_GUEST_CREATE_HTTP=enabled`

No flag is enabled by default. The backend has separate OTP/create
flags, database quotas and signer/provider gates.

## Browser flow

1. Validate contact and consent locally, keeping all drafts in React
   memory, not URL, localStorage, analytics or a client-side bearer.
2. GET the same-origin OTP-start endpoint to receive a short-lived
   synchronizer. POST the validated contact with that synchronizer;
   the backend must independently enforce its signed network quota.
3. The encrypted HttpOnly challenge session binds the exact ID.
   Verify six digits against it; only the BFF receives the scoped
   CREATE_REQUEST capability and seals it in an HttpOnly cookie.
4. Ask the user to explicitly confirm sending the request (OTP
   verification **alone** does not commit a booking). POST only the
   published offer ID, optional note, contact consent, synchronizer,
   and a stable idempotency key.
5. Show a receipt **only after** a 201 response with a validated
   pending request ID. The backend-issued READ_CANCEL capability
   remains in an HttpOnly cookie and never enters the UI.

Network failures retain the same idempotency key and do not invent a
committed receipt. Do not blindly resend an OTP on create retry.
The app uses kk/ru copy and the existing responsive, accessible
components. Private responses must remain uncached and nonindexable.

## Release conditions — still blocking

The live provider, end-to-end trusted ingress identity across the
browser → Next.js BFF → Backend hop, KZ residency/legal review, abuse
budgets, verified account recovery, cancellation/notification flows,
full staging end-to-end coverage and deployment monitoring **are not
implemented by this PR**. The deployment must not set these flags
until all gates are reviewed. A real OTP may not be delivered today.
