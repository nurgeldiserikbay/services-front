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
