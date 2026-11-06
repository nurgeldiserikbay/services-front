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
