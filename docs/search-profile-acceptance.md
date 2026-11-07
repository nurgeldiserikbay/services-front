# Stage 2 — Search-to-profile user journey

Status: implementation pending verification.

## Scope
- Localized kk/ru mobile-first search and filter UI consumes reviewed `GET /v1/search` contract.
- SSR profile routes for specialist and organization, with canonical metadata and correct 404 for hidden/unpublished profiles.
- Preserve query parameters when navigating search results and returning to search.
- Distinguish empty results, network errors, validation errors and loading states.
- Accessible forms: labels, keyboard interaction, focus states, touch targets and no duplicate submissions.
- Never invent reviews, rating, pricing, phone numbers or calendar availability.

## Acceptance
1. Anonymous user searches by profession/city, opens a public profile, returns to the same result state.
2. Unpublished profiles do not render or get indexed.
3. Slow network, aborted request and duplicate taps are handled without stale UI.
4. kk/ru translations cover every state; no raw translation keys.
5. Mobile viewport and production build verified.
6. E2E uses real test API fixtures, not mocked success as proof of backend integration.

## Dependencies
Stage 1 reviewed OpenAPI, fixture and backend deployment URL. SSR must not be embedded into Capacitor WebView.
