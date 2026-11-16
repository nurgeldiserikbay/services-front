# Frontend security lint gate

Run `pnpm lint` from the workspace root, or `pnpm --filter @services/web lint` for the web app. The command now runs both the security regex gate and a TypeScript compiler AST quality gate. Both scan `apps/web/src` by default.

The **security lint** fails on:

- dynamic `eval(...)` / `Function(...)` invocation;
- React `dangerouslySetInnerHTML` and direct `.innerHTML = ...` assignment;
- browser `localStorage.setItem` / `sessionStorage.setItem` (never store session capabilities or credentials there);
- `NODE_TLS_REJECT_UNAUTHORIZED=0` in application source.

Tests exercise positive and negative fixtures by passing a temporary directory to the script. Diagnostics identify source file, line, and rule. CI runs lint after frozen dependency installation, before unit tests.

The **TypeScript AST lint** (`apps/web/scripts/lint-ast.mjs`) additionally rejects `debugger` statements, `@ts-ignore` / `@ts-nocheck` suppression directives and parse diagnostics across TypeScript, TSX and JavaScript sources. It also recognizes straightforward computed-property forms of dynamic execution, browser-storage writes and direct HTML assignment (for example `window['eval'](...)`, `localStorage['setItem'](...)`, `element['innerHTML'] = ...`). Its fixture tests cover allowed TS/TSX and rejected constructs. The checker uses the project's existing TypeScript dependency without a new lockfile package.

**Limitations:** These are focused guards, **not** ESLint, a type-aware security audit, an XSS sanitizer, or a proof that all security-critical operations are safe. It cannot detect aliases, computed properties, obfuscated expressions, or other indirect uses, and may match strings/comments. Broad semantic JavaScript/React/Next.js linting and real-browser accessibility acceptance are still separate checklist gates. Do not mark the master `Frontend lint` acceptance item verified solely from this guard.

## Next.js semantic lint (2026-11-16)

`pnpm lint` additionally runs ESLint 9 over `apps/web/src` with Next.js 16 flat configs (`eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`). These cover React, hooks, accessibility, Core Web Vitals and TypeScript recommendations. Security and AST lint still run first. Acceptance requires a verified pnpm lockfile and green frontend foundation CI.

### Tracked React lint baseline

The initial full ESLint run ([CI #43832617953](https://github.com/nurgeldiserikbay/services-front/actions/runs/43832617953)) exposed 8 React hook errors in existing components. The `react-hooks/set-state-in-effect` rule is temporarily disabled **only** for AccountDeviceSessions, AccountNotificationsInbox, GeographyPicker, GuestRequestStatusCheck and SellerWorkspace. The SellerDecisionActions render-time ref access has been removed and its `react-hooks/refs` exemption lifted; the submit-time idempotency/ref guard is retained. These are explicit migration debts, not blanket suppression of React rules; removing each file-level exception requires restructuring the relevant component and a passing CI run. The remaining React/Next.js/TypeScript recommended rules continue to run.

### Seller decision lint exception removal (2026-11-16)

The seller decision action buttons now derive their disabled state from React state rather than reading the pending-key ref during render. The original submit handler retains the imperative idempotency guard. This removes the file-specific `react-hooks/refs` exception. Other existing effect-related exceptions remain tracked and must be addressed separately.

### Notification inbox effect lint cleanup (2026-11-16)

The initial inbox request is scheduled in a zero-delay timer instead of invoking the state-changing fetch directly in the React effect body; cleanup cancels a not-yet-started request and invalidates stale results. The `react-hooks/set-state-in-effect` exception for `AccountNotificationsInbox.tsx` has been removed, with a regression assertion for the cleanup behavior. The other four file-scoped effect exceptions still require migration. A green CI run remains required for acceptance.

### Device sessions effect lint cleanup (2026-11-16)

The initial device-sessions refresh now starts from a zero-delay timer scheduled by the effect, and the cleanup cancels that timer while invalidating the active request generation. The manual refresh/revoke handlers and server-confirmed revocation logic are unchanged. The `AccountDeviceSessions.tsx` file-scoped `react-hooks/set-state-in-effect` exception is removed, with a regression checking cancellation and server-confirmed refresh. The remaining exemptions are GeographyPicker, GuestRequestStatusCheck and SellerWorkspace, pending their separate migrations and CI acceptance.

### Seller workspace effect lint cleanup (2026-11-16)

The first seller inbox request is now scheduled outside the synchronous React effect callback and the cleanup cancels an unstarted request and invalidates any in-flight generation. The seller page's unauthorized-response clearing, stale-result rejection, retry and cursor safety checks remain unchanged. The file-scoped `react-hooks/set-state-in-effect` exception for `SellerWorkspace.tsx` has been removed; only `GeographyPicker.tsx` and `GuestRequestStatusCheck.tsx` remain excepted. A clean CI result is required to accept the change.

### Geography picker effect lint cleanup (2026-11-16)

Country and city catalog requests are scheduled after the synchronous React effect callback. Each effect cancels an unstarted timer and aborts any already-started request on cleanup. City response generation checks, strict catalog parsing, loading indicators and explicit retry behavior remain in place. The `GeographyPicker.tsx` file-scoped `react-hooks/set-state-in-effect` exception was removed and tested. The remaining exception is `GuestRequestStatusCheck.tsx`; receipt-switch privacy and synchronous stale-status clearing must be preserved when refactoring it. CI acceptance is pending.

### Final React Hooks exemption removal: guest receipt isolation (2026-11-16)

GuestRequestStatusCheck now renders a keyed `ReceiptStatusView` for each request ID and service offer ID. React remounts that stateful subtree during a receipt switch, before rendering any previous guest's private status for the new receipt. A layout-effect cleanup aborts outstanding private reads without performing synchronous state resets; the original manual-only status fetch, bounded parser, deadline, stale response and monotonic-version checks stay in place. The final `react-hooks/set-state-in-effect` exception has been removed from `eslint.config.mjs`. Existing source-contract tests now assert zero hook rule overrides and keyed receipt isolation. Acceptance requires a full green CI run, not merely a static assertion.

### Guest receipt React rendering regression (2026-11-16)

An executable regression test in `apps/web/tests/guest-status-react-render.test.mjs` transpiles the production guest status TSX with the workspace TypeScript compiler and renders the actual component through React's server renderer. It verifies that a request-ID or service-offer change changes the keyed receipt subtree, and that initial markup in Kazakh and Russian shows the unverified/idle state rather than another receipt's accepted status. This is real React rendering with mocked UI dependencies, **not** a mounted browser test: effect cleanup, DOM navigation and a live authenticated guest journey still require separate acceptance. The test is part of `pnpm test` and CI.

### Production service-worker private-route isolation E2E (2026-11-16)

`apps/web/tests/live-pwa-worker-isolation.e2e.mjs` fetches the **served production** `/sw.js` asset after Next.js starts in CI, runs the delivered worker inside an isolated event/Cache Storage harness, and checks that private guest/account/seller/API paths, encoded and noncanonical URLs, POST and CORS calls and cross-origin navigations are not intercepted. A public navigation may use only the generic cached `/offline.html` when simulated offline, while successful public navigations use fresh network responses and no runtime cache writes occur. This is an executable check of the delivered worker semantics, **not** actual mobile installation, Chromium service-worker lifecycle or accessibility acceptance.

### Signed seller account session to live PostgreSQL backend E2E (2026-11-16)

CI now provisions a random, isolated `SERVICES_WEB_ACCOUNT_SESSION_KEY` for the feature-enabled production BFF and stores the test key in the runner's private temporary directory. `apps/web/tests/private-bff-signed-session.e2e.mjs` creates a short-lived test bearer and matching PostgreSQL account-session fixture using the backend's canonical HMAC token-hash domain; the production account web session core seals a separate HttpOnly-compatible cookie. The test sends this cookie to the **real Next.js seller inbox route**, confirms the backend returns a valid empty own-inbox page with CSRF and private response headers, then revokes the PostgreSQL session and asserts the same web cookie receives `401`. The fixture is deleted in `finally` and no bearer is written to CI logs. [Frontend CI #43869181307](https://github.com/nurgeldiserikbay/services-front/actions/runs/43869181307) passed. This is a genuine BFF ↔ backend authorization/revocation integration test, but the fixture **is not an OTP-verified sign-in or populated seller decision flow**, which remain open for release acceptance.
