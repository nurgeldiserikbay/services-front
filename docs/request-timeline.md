# Customer-facing request status timeline

This component renders a server-authoritative lifecycle state, localized in kk and ru, and does not invent a booking confirmation, a scheduled date, a delivered phone message, or a completed service. It does not initiate HTTP requests, create client-only state, or store private request data.

It is intentionally not mounted on public offers. A server-authorized private request detail route and verified guest recovery/capability transport must exist first. The seller accept/decline operation uses separate ACL and optimistic version handling. The final request receipt must be tied to a committed backend record, never to an OTP UI callback.
