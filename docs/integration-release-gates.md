# Frontend integration release gates

Status: **unverified / default off**. A merged feature does not imply an enabled user journey.

## Gate F1 — account login
- Backend trusted OTP endpoint, provider and ingress restrictions approved before exposing login UI/routes.
- Only server-held service credentials reach private backend; no bearer, OTP or token in browser JSON, URLs, logs or local storage.
- Session cookie: Secure, HttpOnly, SameSite and appropriate path/domain; reject unsafe redirects and forged CSRF/origin.
- Test missing/expired/revoked sessions, replay, repeated OTP attempts, oversized/invalid backend replies, timeouts and cross-account isolation.

## Gate F2 — request and seller workflows
- Real backend integration: discovery → professional/organization page → guest verification → request → status → seller accept/decline → notifications → cancellation.
- Confirm kk/ru UI and accessibility, keyboard operation, mobile widths and failure/loading/empty states.
- Seller inbox must clear private data on 401/logout, stale pagination, account switch and malformed responses.
- Keep idempotency key stable for ambiguous retries; never show success on unverified acknowledgement.
- Verify cancellation policy is enforced by backend, not only client time.

### Prepared registered-customer request creation BFF (2026-11-23)
- Frontend branch `feat/account-request-create-bff-20261123`: a separate default-off `POST /api/account/requests` uses the existing authenticated sealed `__Host-services_account_web` session and strict origin/Fetch Metadata + CSRF checks. Request JSON is capped at 1200 streamed bytes, strictly decoded and field-allowlisted; only `service_offer_id`, `note` and `consent_to_contact` are accepted. A stable `Idempotency-Key` is forwarded by server-only HTTPS transport with backend session bearer; no bearer, contact, PII, request notes or backend error bodies are returned to browsers.
- Requires both frontend `SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF=enabled` and `SERVICES_WEB_ENABLE_CUSTOMER_REQUEST_CREATE=enabled`, as well as backend `SERVICES_ENABLE_REGISTERED_REQUEST_CREATE_HTTP=enabled`. All flags remain disabled in defaults. A 503 means uncertain commit: the browser should retry with the **same idempotency key**, never assume failure or create a fresh key automatically.
- This is **not** complete F2 acceptance: no registered-customer creation UI or authenticated real-browser staging journey is shown, and production abuse limits, edge ingress, provider and operator security sign-off are still pending. CI passing does not authorize enabling the flags.

- Verified frontend [PR #157](https://github.com/nurgeldiserikbay/services-front/pull/157), exact PR head `daf01a817ca7ea7e51850bd6927c2d94cee0b6da`, [Frontend foundation CI #45147357285 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45147357285), squash merge `d5ad3b7a18e2161607e565d7de388b635606f13b`. This verifies default-off frontend code, unit tests and the existing pinned-backend CI scope; it does **not** prove the new create route against backend PR #449 in a cross-repository authenticated browser E2E or private staging.

### Registered customer request creation UI (2026-11-23, CI verified)
- Branch `feat/registered-customer-request-ui-20261123`: the published service offer page conditionally mounts a localized kk/ru registered-customer creation form only when both frontend account-session/create feature gates are enabled **and** the existing account-web cookie is revalidated by the backend session inventory. The backend bearer never appears in the browser. The form sends service offer ID, trimmed optional note and consent only through the existing same-origin CSRF-protected BFF.
- Unknown network/503 or malformed response must **freeze note and consent** and retry the exact same idempotency key; the form reports success only after checking the 201, private no-store, strictly bounded, allowlisted committed receipt. A confirmed 404/409 blocks automatic retries and directs customers to review request status. Unit tests cover negative receipt validation and required SSR/client boundaries.
- **Not staging acceptance**: real authenticated backend PR #449 → frontend PR #157 → browser creation/inventory end-to-end, login issuance, mobile UX accessibility, rate budgets and deployment sign-off remain outstanding; flags stay disabled by default. No master checklist acceptance increment.
- Verified [frontend PR #158](https://github.com/nurgeldiserikbay/services-front/pull/158), exact tested head `93b7fe526e8ecc70baa3ea87f719c60f52ec5bee`, [Frontend foundation CI #45149571213 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45149571213), squash merge `7c63d2624f88b04f217b09254641ce0b21240668`. Earlier failing head was corrected for UUID receipt validation before the green rerun. This confirms CI coverage, not production staging or live registered-create cross-repo E2E.

### 2026-11-23 — registered account create-to-inventory cross-repo CI (verified)
- Frontend CI pins reviewed backend merge commit `2739ab76bfb38d4501da1a57d0caae59da599aef` (backend PR #449) instead of the prior older backend baseline. A CI-only backend and isolated Next.js instance explicitly enable registered request creation. A disposable SQL fixture creates active account bearers and a published organization offer; a real sealed web session reaches Next.js SSR and CSRF BFF, then HTTPS backend and PostgreSQL. The test verifies denial for missing/forged CSRF, foreign Origin, cross-site Fetch Metadata and user-controlled identity; one PENDING request with exactly one outbox, audit and seller notification; same-key idempotent replay and changed-input conflict; own-account inventory visibility, foreign-account isolation, no bearer/note leakage, and revoked session denial.
- This is **local CI E2E evidence only**; the test manufactures disposable signed sessions and does not exercise a real OTP provider/login issuance or KZ private staging. No production feature flags are enabled, and all mandatory staging, abuse budget, origin/TLS/network and operator sign-offs stay OPEN. Do not mark the top-level authenticated request flow complete from this evidence alone.
- Verified [frontend PR #159](https://github.com/nurgeldiserikbay/services-front/pull/159), exact tested head `879a72ba3e273350b22b49befa4c43bff82f3b3e`, [Frontend foundation CI #45150895050 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45150895050), including real registered create-to-own-inventory PostgreSQL gate and full frontend build/browser suite. Squash merge `e6cd8a0c1ea8b8bdabfe7cdc63c388d1232a2ea1`. The earlier run failed because a Node `.mjs` test mistakenly contained TypeScript query generics; the corrected PR head passed. Staging/operator approval and real OTP login remain OPEN.

### 2026-11-23 — registered customer creation real Chrome uncertain-retry regression (verified CI)
- Extend the existing **disposable, authenticated SSR fixture** to launch a real headless Chrome instance, load the protected offer form with a test-only `__Host-` HttpOnly+Secure cookie, verify mobile viewport and accessible controls, type a note via Chrome input, and exercise the actual hydrated React submit button. In this **browser-only retry test**, intercept POST inside the isolated Chrome tab to return a simulated 503 followed by a strict 201 committed receipt; assert the note and consent stay frozen on uncertain outcome, a manual retry uses the exact same idempotency key and body, and success appears only after verified receipt. The server-side sibling test still independently proves real backend/PostgreSQL creation and list isolation.
- This test **does not simulate an actual network timeout after PostgreSQL COMMIT**, trusted OTP provider login, production CSRF ingress or staging approval. Do not claim the browser POST mock itself wrote to a database, and keep production switches default-off.
- Verified [frontend PR #160](https://github.com/nurgeldiserikbay/services-front/pull/160), exact PR head `4666e1aef8a5f71702f016d99f7c230b49125269`, [Frontend foundation CI PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45154669221), and squash merge `e1742ef6f243be7514ff2a4c0c96f8188b907e47`. The full suite covered real headless Chrome React 503 → frozen input → same-key 201, alongside the existing live backend/PostgreSQL request-and-inventory E2E. Staging and real OTP login remain open; no master acceptance count change.

### 2026-11-23 — registered customer null-note cross-repo parity (verified CI)
- The localized registered request form submits explicit `note:null` when the optional comment is empty. Previously frontend BFF accepted that input but the pinned backend rejected it with HTTP 400. Backend [PR #451](https://github.com/nurgeldiserikbay/services-back/pull/451) corrected the nullable contract and passed [backend CI](https://github.com/nurgeldiserikbay/services-back/actions/runs/45156482330) (merge `3e8e10a55bbfdb2d1bd529652c58b0845e195440`).
- Frontend CI now pins that reviewed backend commit. The existing real sealed-session Next.js → CSRF BFF → HTTPS backend → PostgreSQL → own inventory E2E adds a second create with `note:null`, checks persisted SQL NULL, safe same-key replay, one audit/outbox/notification and same-account visibility with foreign-account isolation. No production flag is enabled.
- CI fixture verification is **not** production/staging acceptance: real OTP provider/session issuance, KZ private ingress security, abuse budgets, user-device accessibility, operations and owner sign-off remain OPEN.
- Verified [frontend PR #161](https://github.com/nurgeldiserikbay/services-front/pull/161), exact tested head `fd4f07403b65529b660ad9588ed11c2b7154bbfd`, [Frontend foundation CI #45157407895 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45157407895) with live Next.js/HTTPS backend/PostgreSQL null-note creation E2E and complete frontend/browser suite. Squash merge `90c4747ef1b4dc238f4282fa2e6e363c7899e41a`. Both backend and frontend production flags remain default-off.

### 2026-11-23 — registered customer create HTTP 429 BFF/UI parity (verified CI)
- Frontend branch `feat/registered-request-429-safe-retry-20261123` recognizes audited backend [PR #452](https://github.com/nurgeldiserikbay/services-back/pull/452)'s per-account transactional issuance budget. Server-only transport maps upstream HTTP 429 to a **body-free** `rate_limited` result; the same-origin CSRF BFF returns sanitized `429 {"code":"RATE_LIMITED"}` with private no-store headers and no upstream error payload, retry token or identity exposure.
- The localized kk/ru form shows a distinct rate-limited message and allows **deliberate later retry with the same idempotency key and immutable form contents**, rather than incorrectly labelling a definite budget denial an uncertain backend commit. Network failures or malformed responses remain `uncertain`, while successful prior-key replay remains valid. No client-controlled retry timer or automatic polling is added.
- CI now pins verified backend merge `ae68cb3b19467b03f6ac9d22fb24a49c2128a53e` and exercises real sealed-account Next.js → BFF → backend → PostgreSQL: create two real requests, seed three disposable requests, deny the sixth with HTTP 429 and no idempotency ledger, recover existing completed receipt at the ceiling, then revoke the account session with no extra write. Per-account budget is **not** an IP/network/bot budget; trusted ingress, real OTP, KZ staging, user/device UX acceptance, operational limits and rollout approval remain OPEN. Feature flags stay default-off.
- Verified [frontend PR #162](https://github.com/nurgeldiserikbay/services-front/pull/162), exact tested head `ffa6cb6bf10f309ba14bc993195a8c5d247ffac6`, [Frontend foundation CI #45160961004 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45160961004), including 429 BFF/PostgreSQL E2E and full browser/security suite; squash merge `b3a3e9fb086be173df81cd168b549a2e012c2a8b`. Frontend and backend production flags remain disabled pending approved real OTP and KZ staging acceptance.

### 2026-11-23 — private OTP initiation transport prepared (verified CI)
- Frontend CI pins reviewed backend [PR #453](https://github.com/nurgeldiserikbay/services-back/pull/453) merge `0811e7005f47795b7faf42c54359f39a735b9b7d`. The private server-only account OTP initiation adapter targets `POST /v1/auth/private/account/challenges` and requires a canonical independent BFF secret, a strictly structured **trusted ingress-signed network proof**, fixed channel/purpose/locale/contact allowlist, HTTPS in production, no cookies or redirects, and a five-second timeout. It refuses unexpected response status, cache policy, content-type, oversize/truncated/malformed response, unexpected keys and incorrect TTL; returns only verified challenge ID and 300-second TTL, never OTP or contact.
- The internal wrapper requires **both** `SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF=enabled` and independently default-off `SERVICES_WEB_ENABLE_ACCOUNT_OTP_INIT_BFF=enabled`. **No browser route is mounted and no actual OTP delivery is enabled.** The trusted edge must supply signed network proof; a browser header or user-controlled IP must not be accepted as the source. The wrapper is not wired to an unreviewed caller and the backend provider remains deliberately disabled.
- Follow-up security gates remain OPEN: real provider and KZ residency/DPA, trusted ingress proof stripping/signing, safe browser pre-auth Origin + CSRF + anti-enumeration and per-network budget, challenge-to-verification state binding and HttpOnly cookie issuance, real browser + PostgreSQL OTP login journey, and release owner acceptance. No top-level checklist increase from transport-only code.
- Verified [frontend PR #163](https://github.com/nurgeldiserikbay/services-front/pull/163), exact tested head `9d1637457f6fb14dde296288c2736d6b10e6f587`, [Frontend foundation CI #45164311169 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45164311169), including security lint, bounded OTP initiation transport unit tests, typecheck, production build, existing pinned-backend PostgreSQL E2E, Chrome accessibility and Lighthouse checks; squash merge `b503ebe44428810a5ce35d0f26457429e7fd3ac7`. No actual OTP vendor, public login route or production enablement is claimed.

### 2026-11-23 — independent account OTP challenge cookie (verified CI)
- Account OTP verification now has a prepared **server-only** signed-proof boundary distinct from guest sessions, normal logged-in account cookies, and guest OTP challenge cookies. A separate canonical 32-byte base64 `SERVICES_WEB_ACCOUNT_OTP_CHALLENGE_KEY` seals a secure HttpOnly SameSite=Strict `__Host-services_account_otp_challenge` with AES-256-GCM, account-specific AAD, challenge UUID, channel, 32-byte CSRF synchronizer and maximum 300-second TTL. Verification requires an exact challenge and channel match and constant-time CSRF token comparison before calling private backend OTP verify.
- The challenge token cannot supply an account identity or backend bearer, and no OTP/code/contact/provider payload is embedded in the cookie. Unit regressions cover wrong keys, tampering, channel swaps, other IDs, expiration, malformed cookies/TTLs and server-only source contracts.
- This **does not open public login**, make OTP delivery available, or prove browser/network ingress pre-auth anti-enumeration. Provider approval, real trusted edge/network proof, rate budgets, browser route CSRF bootstrap, login-to-HttpOnly issuance, KZ staging evidence and release signoff are still OPEN. Flags remain disabled; do not increment strict checklist acceptance.
- Verified [frontend PR #164](https://github.com/nurgeldiserikbay/services-front/pull/164), exact tested head `c43de5bda6d33c6075cf746fec30b31d0344b017`, [Frontend foundation CI #45166061630 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45166061630), including security lint, account-challenge cookie unit tests, frontend typecheck/build, real backend/PostgreSQL customer flow and full mobile Chrome/Lighthouse checks; squash merge `c47ab99a7398a2195f8ddd20178b17b837367e3f`. Earlier CI detected a transient Chrome focus issue during React hydration in the existing registered-create journey; test now waits for a connected, enabled textarea before asserting genuine keyboard focus. This is code/CI verification only, not real OTP staging approval.

### 2026-11-23 — account OTP pre-auth CSRF bootstrap (verified CI)
- Independently disabled `GET /api/account/otp/bootstrap` can issue **only** a 300-second per-browser CSRF synchronizer with a dedicated AES-256-GCM HttpOnly Secure SameSite=Strict `__Host-services_account_otp_preauth` cookie; it cannot issue a backend OTP challenge, call a provider, exchange OTP codes, or authenticate the user. Separate canonical 32-byte server key `SERVICES_WEB_ACCOUNT_OTP_PREAUTH_KEY` and AAD are not reused for guest OTP, account OTP challenge or authenticated session.
- Requires both `SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF=enabled` and independently default-off `SERVICES_WEB_ENABLE_ACCOUNT_OTP_BOOTSTRAP=enabled`, plus `Sec-Fetch-Site: same-origin` (missing header fails closed) and canonical configured origin; the optional `Origin` header, if present, must match exactly. Query strings, request bodies and transfer encoding are rejected; no-store, no-referrer and noindex responses are mandatory. A real browser must use a same-origin fetch; cross-site or direct navigation does not issue a cookie.
- Node tests cover cookie tampering, expiration, independent key, strict origin/Fetch Metadata denial and no OTP provider/login route in source. **Not a complete login flow:** no browser OTP start/verification POST, no trusted signed edge proof integration, no real approved delivery provider or KZ staging acceptance. Feature switches remain default-off; do not increment strict project acceptance.
- Verified [frontend PR #165](https://github.com/nurgeldiserikbay/services-front/pull/165), tested head `cffd6c90070104fd927010b44fd0750307d02f66`, [Frontend foundation CI #45167560738 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45167560738), including unit/security checks, TypeScript/production build, real backend/PostgreSQL scenario and Chrome/Lighthouse gates; squash merge `746994a8252a9d362ac5594ec3eb42c2c8daeda9`. This validates a default-off CSRF bootstrap only, not OTP issuance, login, staging or production authorization.

### 2026-11-23 — separately gated browser account OTP verification boundary (verified CI)
- Prepared `POST /api/account/otp/verify`, separately default-disabled by `SERVICES_WEB_ENABLE_ACCOUNT_OTP_VERIFY_BFF` and requiring the existing `SERVICES_WEB_ENABLE_ACCOUNT_LOGIN_BFF` gate. Requires explicit same-origin `Origin` and `Sec-Fetch-Site`, bounded strict four-field JSON `{challenge_id,channel,code,csrf_token}`, and the independent secure HttpOnly account challenge cookie that binds **exact** UUID, channel and constant-time CSRF. Existing session cookie cannot be silently overwritten. Both local account challenge and authenticated session encryption keys are validated before consuming the one-time backend OTP.
- Server-only exchange calls backend private verify; upon a confirmed successful response, only `AUTHENTICATED` and new browser CSRF are serialized, with a Secure HttpOnly account session cookie and clearing preauth/challenge cookies. The raw backend bearer is never serialized. Invalid OTP returns generic `VERIFICATION_FAILED` without a new session; unknown upstream outcome is a no-store `503`, clears the challenge cookie and must **not** automatically replay a potentially consumed code.
- This route cannot issue challenges: a valid challenge cookie requires the separately gated server-only initiation pipeline with an approved OTP provider and trusted network proof, neither production-enabled. Before use: real provider approval, trusted ingress proof, preauth CSRF bootstrap-to-issue HTTP wiring, account session revocation controls, real Chrome login E2E and private KZ staging/operator signoff. **No production rollout** and no top-level strict checklist increment.
- Verified [frontend PR #166](https://github.com/nurgeldiserikbay/services-front/pull/166), exact tested head `e68fb613acc9e155963e71138e7a522cb8d6fb91`, [Frontend foundation CI #45171223434 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45171223434), including unit/security tests, TypeScript, production build, pinned-backend PostgreSQL customer regression, Chrome and Lighthouse. Squash merge `b31527e52922c933ad10dce0d7780f4f12cf8352`. Initial CI #45170973724 had a unit test source-regex mismatch on the sanitized 401 response; corrected before exact-head green run. This is code safety validation, not a real OTP provider/login staging pass.

### 2026-11-23 — trusted account OTP start private orchestration (verified CI)
- The server-only `startTrustedAccountOtp` composes the existing independently gated account OTP pre-auth session, an exact strictly validated five-field issuance payload, trusted private network attestation, private backend dispatch, and AES-256-GCM challenge cookie issuance. Before any provider dispatch it rejects invalid contact/channel/locale/purpose/CSRF, an existing account login cookie or challenge cookie, missing/untrusted network proof, invalid pre-auth CSRF and unavailable challenge encryption keys. Streamed JSON is capped at 512 bytes with fatal UTF-8 decoding.
- On a confirmed backend dispatch receipt, the caller receives only the opaque challenge UUID, a *new* challenge-specific CSRF synchronizer and Secure HttpOnly cookie instructions. The contact, backend BFF key, network proof and provider reference are never returned. Source/behavior tests prove fail-before-dispatch and no challenge cookie on failed provider response.
- **Not exposed to browsers:** no `POST /api/account/otp/start` is mounted until the approved edge is proved to remove user-provided network/forwarded headers and supply a trusted signed attestation; server-side origin checking, per-network budgets, anti-enumeration, real delivery provider, Chrome E2E and KZ staging/operator approvals also remain OPEN. Both OTP delivery and public login are still default-off. No top-level checklist increment.
- Verified [frontend PR #167](https://github.com/nurgeldiserikbay/services-front/pull/167), exact tested head `9e2cf0cf5e37fc71066816dbd815f4d7928b0e93`, [Frontend foundation CI #45172630256 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/45172630256): security lint, account OTP start unit/negative tests, TypeScript, production build, pinned-backend PostgreSQL regressions and Chrome/Lighthouse gates. Squash merge `006f9be2ee7ee9f21a18a38a3d1e5e68427cf4c7`. This proves internal orchestration safety only, not actual OTP vendor delivery or staging acceptance.

## Gate F3 — release evidence
- Exact commit: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`.
- E2E against a real staging backend/database, with negative permission and concurrency cases.
- Validate CSP, cookies, caching of private responses, no exposed secrets and monitoring/error redaction.
- PWA offline and Capacitor native shell are separate acceptance targets; never claim them from Next.js SSR build alone.
- Record backend/frontend commit SHAs, API contract version, CI links and staging sign-off.


## Verified CI evidence — 2026-11-09

| Component | Commit | CI result |
| --- | --- | --- |
| Backend | `d61979f0474e77083a39026595383846c040bf95` | [passed](https://github.com/nurgeldiserikbay/services-back/actions/runs/42564674158) |
| Frontend | `1759838c73dc64b3c9801c3f000ae48e4e38a171` | [passed](https://github.com/nurgeldiserikbay/services-front/actions/runs/42566470762) |
| Admin | `10af6d84bfd7a37c230215cdbcc049dc7842e993` | [passed](https://github.com/nurgeldiserikbay/services-admin/actions/runs/42562591327) |

The frontend workflow checks a real PostgreSQL-backed backend and production Next.js
server for Kazakh/Russian public search, specialist and organization profiles,
and unpublished/missing profile isolation. Next.js streaming not-found responses
can carry HTTP 200; the E2E gate requires a `noindex` marker and absence of
published-profile content in that case.

**This is not a staging or production sign-off.** The historical evidence table above
records earlier runs, before the backend was pinned. Frontend CI now checks out
backend commit `f9728c425d782bd261788eb048800cc95e493818` for a reproducible
cross-repository integration baseline (Frontend commit `fadff9ed7c573f6ba5844b6d35cc343663a40c0b`).
To adopt a later backend release: select a backend commit whose audit and
build-and-test jobs both passed; update the checkout `ref` in
`.github/workflows/ci.yml`; rerun frontend build, unit and live public-journey
integration checks; and record both exact SHAs with CI links. This pin is not
an automatic compatibility guarantee when the backend is updated.
Admin is not included in that public journey.
The full authenticated request lifecycle, OTP provider integration, cancellation,
notifications, role/permission boundaries, concurrency, PWA offline and
Capacitor/device acceptance still require end-to-end evidence before enabling
the corresponding release gates.

## Dependencies
F1 depends on backend OTP provider, pre-auth CSRF, rate limiting and trusted ingress. F2 depends on backend request state machine, notification outbox and tested DB migrations. Do not enable default-off features to bypass gates.

## Backend baseline refresh — 2026-11-09

- The previously pinned Backend commit `60fa93314c7251b8a261a4f8f5090a8da6665305` is superseded by `321bb1a523c5194d2d20cc9a34eaebacc4d2f32c` after its independent [successful dependency-audit and build-and-test run](https://github.com/nurgeldiserikbay/services-back/actions/runs/42655722090).
- Frontend CI checks out this **immutable** backend SHA, migrates PostgreSQL, boots the API and runs Next.js build, tests and its real search-to-profile HTTP journey.
- This refresh validates public journey compatibility with a newer backend, not the future admin login/MFA or the complete guest-to-seller transactional lifecycle. Staging sign-off remains outstanding.

## Backend compatibility refresh — 2026-11-10

- Re-pin the frontend integration API to backend `f9728c425d782bd261788eb048800cc95e493818`, which passed both [Backend audit and build/test CI](https://github.com/nurgeldiserikbay/services-back/actions/runs/42834020490).
- The earlier reviewed `321bb1a523c5194d2d20cc9a34eaebacc4d2f32c` remains historical CI evidence, not the current workflow dependency.
- Extend live API checks to ensure guest status is not anonymously accessible and seller accept/decline refuse missing authorization or missing mutation preconditions.
- This is a negative authorization and public discovery acceptance gate, **not** evidence that the full verified guest → seller decision → notification journey works in a deployed environment.

## Pinned backend authorization refresh — 2026-11-10

- Frontend CI now checks out backend `3b8957274c718ef3e0f1ec89ae4dbb9adf31eed6`, independently verified by [Backend CI #42836562004](https://github.com/nurgeldiserikbay/services-back/actions/runs/42836562004).
- This backend adds PostgreSQL-backed cross-account seller isolation regression coverage. The frontend live HTTP boundary also checks forged bearer tokens with mandatory `If-Match` and `Idempotency-Key` preconditions and a test-only account-session HMAC key.
- Frontend commit `bf743528484f463ae34696b9d7ad537e03096d60` passed [Frontend CI #42839951881](https://github.com/nurgeldiserikbay/services-front/actions/runs/42839951881), including the pinned PostgreSQL-backed backend HTTP boundaries, unit tests, production build, and public search-to-profile journey. This is **not** staging sign-off or evidence of a complete authenticated request lifecycle.

## Notification and cancellation integration baseline — 2026-11-10

- Current frontend workflow pins backend `3dd9ce7b142be0cb329c4b57fd82be43d43bd702`, verified by [Backend CI #42843725076](https://github.com/nurgeldiserikbay/services-back/actions/runs/42843725076).
- Backend regression coverage includes cancellation outbox/notification deduplication, late cancellation reliability proposal idempotency, in-app delivery retry deduplication, cross-account notification isolation, and session revocation without deleting notification intents.
- The refreshed frontend cross-repository CI must pass before this pin can be treated as a verified integration pair. The authenticated browser-to-backend request lifecycle and staging approval remain open release gates.

## Seller cross-account negative-side-effect baseline — 2026-11-10

- Frontend CI now pins backend `73f77a7b85772b8f794ae8acd36c01290ac86537`, independently verified by [Backend CI #42848147427](https://github.com/nurgeldiserikbay/services-back/actions/runs/42848147427).
- PostgreSQL seller authorization tests verify an unrelated verified account cannot accept or decline an organization's request; rejected decisions preserve the pending request and emit no acceptance/decline outbox or corresponding notification intents.
- Cross-repository Frontend CI must pass with this pin before integration compatibility is confirmed. This remains separate from full authenticated HTTP journey and staging release sign-off.

## Canonical seller mutation HTTP header baseline — 2026-11-10

- CI pins backend `73f77a7b85772b8f794ae8acd36c01290ac86537` (green [Backend run #42848990121](https://github.com/nurgeldiserikbay/services-back/actions/runs/42848990121)).
- The backend contract tests require a canonical bearer token, normalize valid uppercase UUID request identifiers, and reject ambiguous bearer formatting before seller decisions.
- This pin update is a compatibility check only; authenticated HTTP lifecycle and staging sign-off remain separate release gates.

## Private OTP failed-attempt session isolation — 2026-11-10

- Frontend CI pins backend `73f77a7b85772b8f794ae8acd36c01290ac86537` ([Backend CI #42850380295](https://github.com/nurgeldiserikbay/services-back/actions/runs/42850380295), green).
- Backend PostgreSQL-backed private login tests assert that a rejected OTP attempt increments attempt tracking without issuing a session, before a later successful single-use verification.
- Frontend CI passing with the pin is still required to establish cross-repository compatibility; full authenticated HTTP E2E and staging gates are not implied.

## Untrusted private BFF OTP boundary — 2026-11-10

- Integration workflow pins backend `73f77a7b85772b8f794ae8acd36c01290ac86537`, independently green in [Backend CI #42875132027](https://github.com/nurgeldiserikbay/services-back/actions/runs/42875132027).
- PostgreSQL-backed private-login regression verifies an untrusted BFF credential cannot consume or increment attempts on a valid delivered OTP challenge; subsequent invalid-code tracking and single-use valid login remain covered.
- This does not replace a complete authenticated customer-to-seller HTTP journey or staging approval.

## OTP consumed-proof replay audit — 2026-11-10

- Frontend CI pins backend `73f77a7b85772b8f794ae8acd36c01290ac86537` (green [Backend CI #42879267010](https://github.com/nurgeldiserikbay/services-back/actions/runs/42879267010)).
- PostgreSQL-backed OTP sign-in test verifies replay of a consumed challenge is rejected and counted as an additional verification attempt, without issuing another session or invalidating the original active session.
- Cross-repository integration CI and a full authenticated customer/seller HTTP E2E remain separate gates.

## Backend compatibility refresh — 2026-11-12

- Frontend CI now defaults to immutable backend commit `60ad786189834b2b2958202a68ac61e0cf551b26`, independently verified by [Backend CI #43185879567](https://github.com/nurgeldiserikbay/services-back/actions/runs/43185879567) (audit and build-and-test successful).
- A manual workflow dispatch may select another 40-character SHA, and CI verifies the exact checked-out revision before integration tests. This does not authorize deployment or change runtime feature flags.
- [Frontend CI #43186523463](https://github.com/nurgeldiserikbay/services-front/actions/runs/43186523463) reached frontend tests after backend migration; three frontend test assertions failed and are being updated. Compatibility is **not yet verified** until a subsequent complete frontend CI run succeeds.

## Verified cross-repository CI pair — 2026-11-12

| Component | Immutable commit | CI result |
| --- | --- | --- |
| Backend | `60ad786189834b2b2958202a68ac61e0cf551b26` | [passed — #43185879567](https://github.com/nurgeldiserikbay/services-back/actions/runs/43185879567) |
| Frontend | `60b71770a5d3305334a800ca9fdddb5da7c8b7ec` | [passed — #43197678529](https://github.com/nurgeldiserikbay/services-front/actions/runs/43197678529) |
| Admin | `893d2640618c0621fd3377871016767f40b449c1` | [passed — #43185274621](https://github.com/nurgeldiserikbay/services-admin/actions/runs/43185274621) |

The frontend run completed the pinned-backend PostgreSQL migration, private admin and guest/seller authorization boundary checks, 249/249 frontend tests, TypeScript checking, production Next.js build, and live public search-to-profile journey. The backend and admin passed their independent CI workflows. **No staging deployment or authenticated end-to-end acceptance is claimed.**

### Remaining release gates (not yet verified)

- [ ] Trusted account login and MFA provisioning, session and CSRF behavior tested through browser and backend.
- [ ] Authenticated guest request → seller decision → notification → cancellation journey, including concurrency and cross-account isolation.
- [ ] Admin onboarding, role-scoped moderation, audited write operations and verified logout, with default-off flags kept closed until approval.
- [ ] PWA offline/installability and Capacitor device acceptance, including accessibility, performance, and kk/ru usability.
- [ ] Staging migration rehearsal, backup/restore, monitoring/alerts, rollback, secret management and data-residency review.
- [ ] Production deployment approval based on signed staging evidence and a repeatable release/rollback procedure.

## Backend logout compatibility refresh — 2026-11-12

- Backend commit `20c0372ace9d45eca2a2b7d49ce9a2e23a737f12` passed [backend CI #43226445173](https://github.com/nurgeldiserikbay/services-back/actions/runs/43226445173), including the explicit admin logout HTTP 200 response contract.
- Frontend workflow pins this immutable revision for PostgreSQL migrations, backend tests, API startup and public search-to-profile HTTP integration.
- Admin enabled-flag negative-access HTTP smoke tests passed [admin CI #43226148133](https://github.com/nurgeldiserikbay/services-admin/actions/runs/43226148133).
- This does **not** prove authenticated admin MFA/login, positive moderation permission paths, or staging acceptance. Keep feature flags disabled pending those gates.

## Live admin logout HTTP compatibility — 2026-11-12

- Backend `79819828f7d7783e9ae577e0b06654e17c445477` passed [backend CI #43229603248](https://github.com/nurgeldiserikbay/services-back/actions/runs/43229603248), including a real Nest HTTP test of admin logout status 200, no-store, bearer rejection and redacted response.
- Frontend CI now pins this immutable backend revision and re-runs the migrated PostgreSQL API/public browser journey. A green frontend run is still required for this new pin.
- This is a contract and negative authorization check; real admin login/MFA, successful permissioned moderation, and staging release approval remain open.

## Backend default-off admin logout refresh — 2026-11-12

- Backend `651bed63f41fe29613ff6cde90bb6a8c15c01446` passed [CI #43230423041](https://github.com/nurgeldiserikbay/services-back/actions/runs/43230423041), including HTTP regression verifying that disabled admin logout cannot query the database.
- Previous Frontend [CI #43230228890](https://github.com/nurgeldiserikbay/services-front/actions/runs/43230228890) passed against backend `79819828f7d7783e9ae577e0b06654e17c445477`; new pinned baseline requires a separate frontend CI pass.
- Admin [CI #43228571347](https://github.com/nurgeldiserikbay/services-admin/actions/runs/43228571347) passed the raw/parsed cookie consistency security regression.
- Authenticated end-to-end admin onboarding/MFA and staging approval are **not** satisfied by these CI runs.

## Current immutable integration default — 2026-11-15

- The frontend CI currently checks out backend `d39d196f7ceedd9df13a253834e3737ad5c120fd` (as specified in `.github/workflows/ci.yml`). This entry records the **actual default**, not a claim of backend CI approval.
- [Frontend CI #43710794087](https://github.com/nurgeldiserikbay/services-front/actions/runs/43710794087) failed on an expiry test fixture that exceeded the allowed 24-hour guest capability TTL by 123 ms. Frontend [commit `1fdd457`](https://github.com/nurgeldiserikbay/services-front/commit/1fdd457a08333f41e1a9af11df98832a346d79f3) corrected that fixture.
- A subsequent unit-test run revealed out-of-date expectations for CI ordering and fail-closed seller-decision retries, plus release status punctuation handling. Changes to those tests must keep the actual cross-repository CI and staging security gates intact.
- Do not enable any rollout flags or mark the cross-repository compatibility/staging gate complete until the full workflow succeeds and independent acceptance evidence is recorded.

## Verified backend CI pin refresh — 2026-11-15

- Default backend integration SHA: `d39d196f7ceedd9df13a253834e3737ad5c120fd` ([Backend CI #43723300416](https://github.com/nurgeldiserikbay/services-back/actions/runs/43723300416): **dependency-audit** and **build-and-test** both passed).
- Earlier frontend CI [#43723802467](https://github.com/nurgeldiserikbay/services-front/actions/runs/43723802467) passed frontend unit tests and dependency audit, then failed at a PostgreSQL test in the older backend `69861edc670b731145dab861436b76e45f40f356` (registered-customer IN_APP notification trigger, SQLSTATE 23514). That older backend is no longer the default compatibility pin.
- **Frontend cross-repository compatibility remains unverified** until a new full frontend workflow succeeds on the refreshed immutable pin. Staging acceptance and feature flags remain unchanged.

## Current backend inventory and completion integration pin — 2026-11-20

- The frontend CI's reviewed default backend SHA is now `2cebdc94a9ab574f7f6ca3011729ce6c97982a45`, from merged [services-back PR #359](https://github.com/nurgeldiserikbay/services-back/pull/359), whose [independent backend CI passed](https://github.com/nurgeldiserikbay/services-back/actions/runs/44676315167). This includes the authenticated registered-customer inventory and completion routes.
- A new disposable real Next.js + HTTPS backend + PostgreSQL E2E CI gate exercises an actual sealed test account: own/other request isolation, accepted-to-completed transition, page refresh, CSRF/origin and stale-version denial, revocation, one experience and one notification. All production customer BFF/page flags remain **default-off**.
- This is code-level CI evidence, not a real OTP/login, complete guest journey, staging release, domain/TLS security acceptance, or production deployment. Record the passing frontend workflow and exact SHA before marking a checklist item complete.

## 2026-11-20 guest → seller accept → guest scoped status cross-repository CI gate

- Dedicated `private-bff-guest-seller-full-journey.e2e.mjs` uses disposable CI-only PostgreSQL rows, signed guest CREATE_REQUEST proof and independent seller account test session; verifies real Next.js and pinned backend HTTP: guest request creation and issuance of request-scoped HttpOnly READ_CANCEL cookie, seller inbox visibility and authorized acceptance, guest observes `accepted` and version 2, forged CSRF/foreign guest status denial, one client EMAIL notification and no PII in outbox. This joins product steps previously only tested independently.
- The test runs against pinned backend `2cebdc94a9ab574f7f6ca3011729ce6c97982a45` and isolated CI-only feature-enabled BFF; it never enables production access or proves real OTP delivery, production identity verification, guest completion, service fulfillment, staging, or mobile acceptance. Merge only after full frontend CI succeeds and record exact run evidence.

## Backend guest completion BFF preparation pin — 2026-11-20

- Frontend CI now independently checks merged backend [PR #364](https://github.com/nurgeldiserikbay/services-back/pull/364), SHA `83261556433d43b0037ced0d165de541ed8e1aa6`, [backend workflow #44694523864 PASS](https://github.com/nurgeldiserikbay/services-back/actions/runs/44694523864). The previous historical 2026-11-20 customer/guest E2E reports were run against `2cebdc94a9ab574f7f6ca3011729ce6c97982a45` and should not be misrepresented as evidence for a newer SHA.
- New default-off guest completion BFF routes compose signed network proof + request-bound READ_CANCEL session to start OTP, seal challenge and independent COMPLETE_REQUEST capability in purpose-specific HttpOnly cookies, require same-origin CSRF, strong If-Match and strict bounded JSON, and return only a safe completion status to the browser. Upstream secrets remain server-only.
- **Not a user-facing release:** no real OTP provider, trusted production edge ingress, full current-backend real browser OTP→completion E2E, staging/Capacitor or security sign-off is included. Both backend and frontend flags remain disabled outside separately reviewed CI. No lifecycle acceptance count changes.

## Live guest → seller → completion OTP cross-repository CI gate (2026-11-20)

- The existing **single-request** guest-create → seller-accept → guest status E2E now continues through a real separate Next.js BFF and NestJS backend using **disposable CI-only** completion OTP delivery. It asserts a fresh code is delivered to the same originally verified contact, wrong CSRF or forged ingress network attestation cannot start OTP, wrong OTP fails, a valid OTP yields only a sealed `HttpOnly` guest completion cookie (never a browser bearer), READ_CANCEL cannot authorize completion, and strong If-Match/one-use versioning creates exactly one `service_request.completed` event and one seller notification. The original guest status cookie subsequently reads `completed` with version 3; no guest review entitlement is created.
- CI's helper backend process runs only under `CI=true`, has its own port, an in-process OTP adapter, and a mode-gated OTP file with 0600 permissions in the disposable runner; no provider or bypass is added to the production app. Production routes and feature flags remain disabled by default.
- **Remaining acceptance gates:** licensed/approved KZ data-resident OTP provider, trusted edge stripping/re-signing network attestation, real-user browser UI / CSRF token distribution and mobile/Capacitor, staging ingress/security review and owner rollout authorization. This is a real HTTP/PostgreSQL *test-fixture* E2E, not production OTP verification evidence. Checklist remains 21/117 pending complete acceptance.

## Guest completion backend security pin refresh — 2026-11-20 (verified in frontend CI #1868)

- The frontend workflow now pins reviewed backend merge `29daa7ff5645ae5628a09092cc0a167326fd9505` from [services-back PR #371](https://github.com/nurgeldiserikbay/services-back/pull/371), independently verified by [backend CI #4135](https://github.com/nurgeldiserikbay/services-back/actions/runs/44716969945) (build, database integration, dependency audit PASS).
- The live disposable guest → seller → OTP → completion Next.js/BFF/PostgreSQL integration from [frontend PR #150](https://github.com/nurgeldiserikbay/services-front/pull/150) now must re-run against the latest secured completion backend rather than prior backend `83261556433d43b0037ced0d165de541ed8e1aa6`.
- **Verified test-pair compatibility:** [frontend PR #151](https://github.com/nurgeldiserikbay/services-front/pull/151) merged as `36537cce86d762c1f724c736c6ed1e501637c250` after [frontend CI #1868 PASS](https://github.com/nurgeldiserikbay/services-front/actions/runs/44717834337). Production feature flags stay disabled. Real OTP delivery provider, ingress header stripping, staging security review, mobile and owner sign-off are not covered by this isolated CI test.

## Sealed completion stale ETag live frontend BFF regression — 2026-11-20 (verification pending)

- Branch `test/guest-completion-bff-stale-version-20261120` extends the real disposable guest → seller → OTP → completion frontend/backend/PostgreSQL CI journey. A valid-but-stale strong `If-Match: "1"` must return the BFF's privacy-preserving 503 (upstream 409 is intentionally masked), *without consuming the sealed one-use write proof*, emitting a completed outbox event, or changing accepted status. The same sealed cookie and actual `If-Match: "2"` subsequently complete once.
- Frontend CI #1873 exposed a formerly flaky cookie-tampering unit test: alternate noncanonical Base64URL encodings can represent identical AES-GCM tag bytes. The completion-cookie reader now rejects noncanonical encoding of IV, ciphertext and auth tag, and the test deterministically flips an unused tag bit to prove that no equivalent textual alias is accepted. Updated PR-head CI and merge pending.
- Full frontend PR-head CI and merge are pending. Production flags remain default-off. This is **not** real-provider, production ingress, user UI, staging, mobile or owner acceptance.

- Frontend CI #1879: isolated full browser/backend/PostgreSQL E2E failed because the new assertion expected exposed 409 instead of intentionally mapped safe 503. Test assertion corrected to the existing privacy contract; unchanged production BFF behavior. Fresh full CI required before merge.

## Guest completion receipt CSRF bootstrap — 2026-11-20 (CI pending)

- Branch `feat/guest-completion-csrf-bootstrap-20261120`: add disabled-by-default same-origin `GET /api/guest-requests/:id/completion/bootstrap` to obtain **only** a request-bound CSRF nonce using the existing sealed HttpOnly READ_CANCEL cookie. Never returns the capability, sends an OTP, or changes database state. Fail closed with the same 404 for missing, foreign, expired and cross-site requests; no cache or index.
- Existing disposable guest → seller → OTP → completion **real Next.js + backend + PostgreSQL** CI exercise now checks bootstrap succeeds for the authorized receipt but fails for missing/foreign/cross-site sessions. No client-side token storage or network-proof signing is added.
- This unlocks a future client-side completion form **only after** the trusted edge injects server-signed network proof and security approval. It does not bypass provider, ingress, staging, device or owner acceptance. PR-head CI and merge pending.

## Guest request completion receipt UI — 2026-11-20 (PR CI pending)

- Branch `feat/guest-completion-ui-default-off-20261120`: localized Kazakh/Russian client UI for explicitly confirmed `accepted` guest request only. After the status BFF authenticates the request-bound receipt, the user may manually bootstrap a CSRF token, request a completion OTP, enter the six-digit OTP, and explicitly confirm service completion at the current strong If-Match version. No automatic request polling, OTP replay or auto-confirm.
- All responses are strict, no-store, bounded and allowlisted. Read-only READ_CANCEL session and completion proof remain purpose-separated HttpOnly cookies; OTP and CSRF stay in short-lived mounted component state, never URLs, logs or browser storage. An unknown commit outcome moves the UI to `uncertain` and asks for private status refresh rather than silently retrying.
- UI requires **all three separate gates** `SERVICES_WEB_ENABLE_GUEST_COMPLETION_UI=enabled`, `SERVICES_WEB_ENABLE_GUEST_COMPLETION_BFF=enabled`, and `SERVICES_WEB_ENABLE_GUEST_STATUS_HTTP=enabled`; all are default-off. Frontend does not and must not mint `X-Services-Network-Proof`; approved trusted ingress must strip forged browser headers and inject a newly signed proof before OTP issue.
- **Pending:** frontend PR-head CI and merge; approved live OTP delivery, real ingress re-signing, device/browser acceptance, staging security review and owner rollout. Do not enable the flags from this test-only UI preparation alone.

## Guest completion ambiguous acknowledgement recovery — 2026-11-20 (CI pending)

- An unacknowledged completion POST intentionally locks its UI in `uncertain` and does **not** retry its one-use capability. Previously a successful manual status refresh to the **same** accepted version kept the same React subtree mounted, so the user could not restart a fresh OTP flow without navigating away.
- A verified, request-scoped status refresh reporting `accepted` at the same version now resets the mounted completion UI to its initial state, discarding the previous component's CSRF/OTP/challenge memory. A stale/older version, a newer version, or any failed/unauthorized status refresh never unlocks the old uncertain flow. No automatic OTP dispatch or completion retry is added.
- Existing default-off UI/BFF/status feature flags and the approved trusted-edge, delivery-provider, staging and security rollout gates remain mandatory. This change does not provide production acceptance. PR-head CI and merge pending.

## Guest completion browser-response boundary tightening — 2026-11-20 (PR CI pending)

- Branch `fix/guest-completion-ui-response-boundary-20261120`: reject malformed completion challenge UUIDs before browser fetch, even when they superficially match a 36-character route; keep request UUID scoped to the receipt.
- The guest completion UI's bounded JSON decoder now rejects contradictory `public` / `s-maxage` cache directives even when `no-store` also appears; malformed chunks and overflow fail closed. On overflow or truncated/bad streams, cancel the response body rather than retaining an unnecessary reader.
- Unit regressions assert URL scope, strict cache policy, malformed UTF-8/JSON, and cancellation. No production feature toggle changes and no OTP provider or trusted ingress acceptance. Require full PR-head CI before merge.
