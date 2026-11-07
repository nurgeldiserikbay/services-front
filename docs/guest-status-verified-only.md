# Private guest status: verified-only display

This change is stacked on frontend PR #44, which connects the shared request timeline to the private guest status check. It must be integrated after that parent PR.

## Stage 1 — no assumed request state

Before any successful same-origin, private, request-bound BFF status response, the status component displays a localized instruction to check the status, not the speculative `pending` state. A response must be parsed for the exact committed request/offer and contain an allowlisted state with a valid version. The timeline appears only when both a verified state and version are present. A rejected or failed subsequent fetch clears the old private status and shows a retry error rather than an apparently fresh last-known result. Manual refresh and abort-on-unmount are preserved.

## Stage 2 — canonical UTC timestamp input

Private guest status rejects malformed, non-UTC, calendar-invalid and noncanonical `created_at` timestamps. Only fully specified `YYYY-MM-DDTHH:mm:ss.sssZ` timestamps corresponding to an actual instant are accepted. No extra backend fields, contact data or request capabilities are serialized to the UI.

## Stage 3 — regression tests

Tests cover premature pending-state prevention, clearing private stale state, localization and strict timestamp parsing. Existing timeline-integration tests now assert the explicit verified state+version gate.

No polling, public guest lookup, new login route, payment negotiation or automatic booking confirmation is added. Production still requires a vetted OTP delivery provider and browser E2E for cookie expiry, backend errors, request authorization, and status transitions.
