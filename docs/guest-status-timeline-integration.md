# Guest request status — validated progress timeline

## Stage 1 — status UX linked to actual private backend state

The existing `GuestRequestStatusCheck` now renders the shared `RequestTimeline` component after a successful, bounded, allowlisted private status response for the exact committed request and service offer. It does **not** show a timeline for an unverified/no-response status. The guest's request-bound HttpOnly cookie, backend request capability, and same-origin status BFF already protect the underlying status; the timeline receives only the low-sensitivity state, never contact, OTP, or bearer credentials.

The status-check component remains manual-refresh only, default-off through `SERVICES_WEB_ENABLE_GUEST_STATUS_HTTP`, with no background polling, no per-request external analytics, and no storage of request capabilities in browser JavaScript.

## Stage 2 — shared semantics and mobile presentation

Reuse existing localized kk/ru RequestTimeline and its accessible ordered list/styles, instead of duplicating timeline rules. `pending` means waiting for seller action, `accepted` means seller accepted the request, not a confirmed appointment; `declined`, `expired`, and cancellations are resolved states. Do not infer seller acceptance from cancellation. Out-of-order older backend responses cannot replace a newer status (version monotonicity retained).

## Stage 3 — regression and release checklist

Tests assert timeline rendering is conditional on a validated response, uses the shared state component, preserves monotonic version handling and manual-only access, and does not fabricate a schedule. Before enabling the private status feature in production, validate a KZ-compliant OTP provider and secure guest capability issuance/expiry, run real browser E2E for pending → accepted and denied cross-request status, and ensure notifications and cancellation rules operate end to end.

No new pricing, payments, automatic time confirmation, account login, or public request-status endpoint is introduced.
