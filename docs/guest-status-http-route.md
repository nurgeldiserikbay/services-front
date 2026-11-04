# Gated private guest request status route

This changes only the **read-only status** part of the guest workflow.

`GET /api/guest-requests/{id}/status`

The Next.js Route Handler is disabled unless
`SERVICES_WEB_ENABLE_GUEST_STATUS_HTTP=enabled`. All paths return
a generic no-store 404 while disabled.

When enabled, the route delegates to the existing server-only
`getPrivateGuestStatus` use case. That function decrypts the
`__Host-services_guest_request` Secure/HttpOnly/SameSite=Strict
cookie, checks that its READ_CANCEL capability matches the exact
requested ID, rejects cross-site Fetch Metadata and sends the
capability to the backend only in a private server-to-server header.

The browser response includes only `id`, `service_offer_id`,
`state`, `version` and `created_at`; never OTP, raw contact,
seller identity, or capability. Unknown, disabled, expired and
unauthorized requests all return 404. Both 200 and 404 responses
set private no-store/noindex and no-referrer headers and vary on
Cookie and Sec-Fetch-Site. This route does not change the existing
Backend `SERVICES_ENABLE_GUEST_STATUS_HTTP` deployment gate.

## Security/release conditions before setting the flag

- Provider and OTP delivery are verified with lawful KZ residency.
- Guest creation BFF seals the request-bound cookie after a committed
  backend request; no capability is serialized to browser JavaScript.
- Configure first-party HTTPS origin and private Backend ingress.
- Review cache/CDN behavior, replay, expired cookie, cross-site requests,
  multiple requests in one browser, and accessibility/offline states.
- Validate backend/Frontend E2E: OTP → create → status → cancel.
- Ensure the status response and request ID are not logged or indexed.

This feature does not mount any public OTP/create/cancel endpoints or
activate user-facing guest request submissions. It is a safe,
incremental HTTP adapter behind an explicit rollout gate.
