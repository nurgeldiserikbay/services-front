# AGENTS.md — Frontend

## Source of truth
The canonical human + AI specifications are in https://github.com/nurgeldiserikbay/services, also readable at https://nurgeldiserikbay.github.io/services/ . Read the following before implementation:
- docs/ru/13-functional-catalog.md (requirement IDs)
- docs/ru/15-permissions-matrix.md (ACL)
- docs/ru/16-state-machines.md (valid transitions and concurrency)
- docs/ru/17-database-design.md (domain data)
- docs/ru/18-api-design.md (API conventions)
- docs/ru/19-frontend-design-system.md (your architecture)
- docs/ru/22-delivery-roadmap.md (phase and dependencies)
- docs/ru/23-quality-tests-release.md (test cases)
- docs/ru/25-ai-development.md (agent workflow)
- docs/ru/26-acceptance-checklist.md (release criteria)
- contracts/openapi.yaml (partial draft; not complete production SDK contract)

## Shared invariants
- One professional profile per canonical profession per person, including archived/hidden/draft states.
- Professional reviews stay with the professional; organization/location reviews stay with their own immutable targets.
- Affiliation with company and assignment to each particular company service are separate and consensual.
- Separate public and private identity data and maintain per-resource authorization.
- Preserve history for bookings, reviews, affiliations and audits through lifecycle changes.

## Frontend specific
- Use pnpm workspace: Next.js web SSR/PWA, React/Vite/Capacitor mobile; shared ui, features, api-client, i18n and auth adapters.
- Capacitor uses statically bundled assets and calls HTTPS backend; never try to execute Next.js SSR in WebView.
- Public professional/company/service pages must be indexable when visible; private profiles and drafts must not be indexed.
- Workspace switch for client, multiple professions and organizations; never make separate accounts for each profession.
- Server-state cache dedupe, cancel obsolete requests, guard double clicks, Idempotency-Key to backend, handle 409/error/empty/loading/offline states.
- Fully localize kk/ru; implement responsive mobile-first accessible UI; do not fake reviews, company affiliations or verification badges.

## Collaboration & quality
Use feature branches / PRs in parallel work unless the owner explicitly requests main. Check existing code and shared components before creating duplicates. Small cohesive changes, proper tests, lint, types, CI. Sync API/domain changes with services docs first. Never commit secrets or customer PII. Never claim a feature works on Android/iOS or staging unless actually tested. Do not merge a PR without owner instruction.

## Global local-first discovery
See https://github.com/nurgeldiserikbay/services/blob/main/docs/adr/0002-global-local-discovery.md and GEO-01..10 in chapter 13. For every public frontend route implement global country/area/city switcher, local-first results for guest visitors, remembered manual choice, explicit global/online search. Never force login or browser GPS for discovery; exact geolocation only after user action and consent. kk/ru are initial locales, not fixed geographic restrictions. Reuse geo IDs from API and keep SEO, region and language independent.

## Overall system diagrams
Before implementing a feature, inspect the visual overview diagrams and their editable Mermaid sources: https://github.com/nurgeldiserikbay/services/tree/main/docs/diagrams . Business overview, seller-controlled inquiry flow, and technical architecture clarify ownership, permissions, responsibilities, and shared API boundaries. The authoritative domain rules remain the corresponding Markdown specification chapters.

## Owner-approved booking simplification (2026-11-01)
IMPORTANT PRODUCT OVERRIDE: https://github.com/nurgeldiserikbay/services/blob/main/docs/adr/0003-simple-booking-company-view.md. Do not build Quote, price negotiation, mandatory calendar or forced price. Independent profile CTA -> request to professional; professional's embedded card under company -> request to company. One profile, two page contexts, specialist allowlist AND company selected fields. Separate personal and company work allocations, avoid leaking other context busy details. Signed-in consumers may save profiles/organizations/offers and see history; anonymous clients can browse and submit guest requests. Distinguish statistics from real requests; WhatsApp clicks are not orders.

## Product baseline v0.6 — read before feature work
1. Canonical product blueprint: https://github.com/nurgeldiserikbay/services/blob/main/docs/ru/01-product.md
2. ACCEPTED vs OPEN decisions: https://github.com/nurgeldiserikbay/services/blob/main/docs/ru/12-roadmap-decisions.md (OPEN-01..14, TECH-01..08)
3. Implementation gates: https://github.com/nurgeldiserikbay/services/blob/main/docs/ru/22-delivery-roadmap.md
4. Owner-approved simple requests/company views: https://github.com/nurgeldiserikbay/services/blob/main/docs/adr/0003-simple-booking-company-view.md
Never implement proposed/open details as certain requirements. Do not claim implementation-ready before contract/UX/security gates. 
