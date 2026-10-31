# Services Frontend

Public website, PWA and Capacitor Android/iOS apps for the Services platform.
Authoritative business requirements and API contracts: [services documentation](https://github.com/nurgeldiserikbay/services).

## Intended workspace
- `apps/web`: Next.js SSR/SEO website and PWA for public discovery pages.
- `apps/mobile`: mobile runtime with Capacitor, statically bundled web assets.
- `packages/ui`, `packages/features`, `packages/api-client`, `packages/i18n`: shared UI/domain presentation logic.
- Personal, professional and organization workspaces all use a single user identity and distinct authorization contexts.

Do not assume a Next.js SSR server can run inside the Capacitor webview. Choose sharing boundaries explicitly.

## Status
Repository initialized; no frontend code or mobile builds yet.
