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
