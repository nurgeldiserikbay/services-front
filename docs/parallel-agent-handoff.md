# Frontend parallel work handoff

Canonical coordination: https://github.com/nurgeldiserikbay/services/blob/main/docs/parallel-delivery-board.md

**Ownership:** public discovery, professional/company pages, guest requests/status, seller inbox, account BFF, localization, accessibility and PWA. Backend owns authorization and request transitions; admin UI belongs elsewhere.

## Current slice
1. Run `pnpm typecheck && pnpm test && pnpm build` on exact main SHA and fix regressions.
2. Independently improve request/status and seller inbox UX using contract-derived mock responses: unauthorized, 409, 429, 5xx, timeout, stale data, double-submit and account switch.
3. Keep trusted OTP BFF/login default off until backend provider, pre-auth CSRF, rate limits, cookie/ingress security and real session revocation are verified.
4. Maintain kk/ru, mobile-first keyboard accessibility and explicit error/loading/empty states.
5. Flag mismatched DTOs in shared contracts rather than inventing backend fields.

**Done when:** CI green, browser E2E with mock and staging API, no browser-exposed secrets, exact SHA and reviewed API version. Follow docs/integration-release-gates.md.
