# Account notification screen: bounded reads and meaningful labels

## Phase 1 — bounded browser response

AccountNotificationsInbox no longer calls unbounded Response.text() prior to checking its size. readNotificationBrowserReply enforces HTTP 200, application/json, Content-Length when supplied and an actual 32KiB streamed byte limit. It rejects invalid UTF-8, invalid JSON, extra PII-bearing fields and unsafe redirects. The component discards previously displayed notifications on failures; the server BFF still rechecks backend session per request.

## Phase 2 — localized notification topics

Recognized internal service request event topics render reviewed kk/ru titles. Unknown or unsupported topics never render raw topic strings, account identities or private request notes. These are safe labels only; not claims of SMS/email delivery or confirmed appointments.

## Phase 3 — guarded navigation and tests

The seller requests workspace links to account notifications only when the notifications feature flag is enabled. The notifications page links to seller requests only when the seller workspace flag is enabled. Both pages retain their pre-existing backend session checks, default-off settings and no-store behavior. Unit tests cover streamed oversize/malformed cases, localized topic mapping and guarded links.

Registered web login and real OTP provider remain disabled. This work improves an already-gated feature, not production availability.
