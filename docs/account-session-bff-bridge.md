# Account sessions web BFF — gated bridge

## Stage 1: server-to-server backend transport

`account-session-transport.mjs` calls the backend's existing bearer-only `GET /v1/auth/sessions` and `POST /v1/auth/logout`, never from the browser. It passes a validated opaque account bearer in a server-side Authorization header, disables redirects/caching/credentials, requires HTTPS in production, times out, and constrains the JSON inventory to 50 whitelisted session metadata records. Raw backend errors, tokens, hashes, family IDs, and contacts are never forwarded.

## Stage 2: web session endpoints

`GET /api/account/sessions` uses the existing server-only encrypted `__Host-services_account_web` cookie, checks same-origin fetch metadata, revalidates backend access and returns the sanitized inventory plus CSRF token on a private no-store response.

`POST /api/account/logout` accepts an empty request with exact same-origin Origin and `x-services-csrf` bound to the authenticated encrypted cookie. It revokes the backend's current session and clears the web cookie. If backend revocation is unavailable, it **still clears the local cookie** but returns 503 rather than incorrectly claiming successful revocation. On invalid Origin/CSRF it performs no revocation and does not touch the user's cookie.

Both routes are **default-off** under `SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF=enabled`. This flag is not a substitute for verified account login and operational controls. The browser never receives the bearer. No public login endpoint, session issuance, registration, OTP delivery or fake account is added.

## Stage 3: tests and launch gates

Unit tests cover strict bearer transport, TLS restrictions, redirect/status failure, response size, DTO allowlisting, cookie-only BFF boundaries, CSRF and disabled-route guards.

The backend PR #59 supplies native/server-to-server session inventory and logout. For web rollout: approved OTP provider, account enrollment and sign-in API, audited delivery of a real issued backend bearer to `issueAccountWebSession`, CSRF/Origin verification, trusted anti-abuse signals, cookie/key lifecycle and end-to-end session revocation tests must be complete. The already existing seller BFF remains default-off until those gates are met. Never expose or store session bearer in client JS, localStorage, URLs or logs. CORS on backend deliberately excludes direct browser Authorization/POST.

Policy: Services ADR-0005.

## Prepared owner professional publication (2026-11-18)
- Private BFF `POST /api/account/profiles/{id}/publish` is **default-off** unless `SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_PUBLICATION=enabled`; backend separately requires `SERVICES_ENABLE_PROFILE_PUBLISH=enabled`.
- Never enable either flag in production without moderation, seller eligibility, request concurrency and product/legal approval. The preview page renders a publication control only under the separate web publication flag and authenticated owner CSRF context.
- Server BFF validates same-origin session/CSRF, strong `If-Match`, canonical empty JSON body `{}` (max 16 bytes), and accepts only a strictly validated no-store backend publication receipt. Exposes only generic status codes to browsers; never returns backend bearer, moderation details or raw error.
- Published version is not proof of approval. Backend remains authoritative on completeness, active requests and publication readiness.

## Prepared professional moderation appeal (2026-11-18)
- Default-off `SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_APPEALS=enabled` adds owner-only BFF GET rejection lookup and CSRF-protected POST appeal intake. Backend independently requires `SERVICES_ENABLE_PROFILE_APPEALS=enabled`.
- The browser sees only an optional current-version rejection ID obtained server-side from the private backend; bearer secrets, reviewer identity and evidence stay server-only.
- An explicit consent checkbox and idempotent submission message are shown in the private preview. POST requires a live sealed session, CSRF, origin validation, strong version `If-Match`, bounded JSON and strict backend receipt. Failed or ambiguous responses never claim success.
- No appeal adjudication, deadline policy or automatic publication is implemented. Do not enable flags without legal/product/security and staging E2E approval.
