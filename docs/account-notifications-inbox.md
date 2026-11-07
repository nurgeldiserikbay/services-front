# Registered account notification inbox — guarded browser integration

## Stage 1: private server transport

A strict backend `GET /me/notifications?limit=30` transport requires a server-held, verified bearer token; rejects malformed origins/URLs, oversized JSON, unknown fields, invalid timestamps and redirects, and limits response size to 32 KiB. Backend returns only delivered IN_APP notifications belonging to the live session's person identity. No browser-supplied person ID is accepted.

## Stage 2: same-origin BFF and localized account screen

`GET /api/account/notifications` is default-off behind `SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS=enabled`, requires same-origin request metadata and a sealed HttpOnly registered-account cookie, and revalidates the underlying bearer against the backend on every call. Responses are `private, no-store`. The `/{kk|ru}/account/notifications` page is also disabled by default and requires a successful backend authorization before rendering. A localized client inbox shows a generic safe notification label and UTC date only; it never renders unreviewed event text as rich content and never claims SMS/email was sent. Refresh errors clear previous account-scoped data.

## Stage 3: regressions and rollout

Tests check strict JSON DTOs, bounded transport, revoked bearer, redirect behavior, server credential isolation, default-off route, and localized UI behavior.

**Not live until login exists:** The registered-account browser login and secure cookie issuance are still release gates. Do not enable this feature until account login is reviewed. The frontend BFF deliberately holds the bearer on the server; never forward it to JS or persist it in browser storage. Backend migration/notification pipeline and external providers are independent launch gates.
