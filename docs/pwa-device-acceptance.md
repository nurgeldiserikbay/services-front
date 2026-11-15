# PWA device acceptance — release gate

Automated tests are necessary but do not replace a real browser/device acceptance run. Record the test date, device model, OS, browser/version, frontend commit, staging URL, tester and screenshots/video in the release evidence. **Do not mark this gate complete without evidence.**

## Android Chrome (secure staging HTTPS origin)

- [ ] Open `/kk` and `/ru`, confirm localized page content and no horizontal overflow at narrow viewport widths.
- [ ] Inspect `/manifest.webmanifest` and `/icon.svg`; confirm the install prompt or browser installation flow works on the test device. If installability fails, record the reason (including icon requirements) instead of treating a manifest alone as proof.
- [ ] Install/open the app; confirm the icon, title, standalone display, initial `/kk` route and return from background.
- [ ] While online, open a public search page, a professional, organization and service profile; verify network content loads normally.
- [ ] Disable all connectivity, then navigate to `/kk`, `/ru` and a public profile URL. Confirm only the generic bilingual offline shell appears and its two retry links remain keyboard accessible.
- [ ] Re-enable connectivity and retry each language; confirm fresh server content replaces the offline shell.
- [ ] Confirm private `/kk/account/requests`, `/ru/account/notifications`, `/kk/seller/requests` and `/api/` calls never return a cached personalized response while offline. Do not copy private payloads into evidence.
- [ ] Deploy an updated service worker, refresh/relaunch, and confirm a new version activates without retaining old Services offline-shell caches.

## Desktop keyboard and assistive technology

- [ ] Navigate with Tab/Shift+Tab: skip link appears and lands on `#main-content` on both locales.
- [ ] Verify focus indicators for navigation, search, forms, selects, textareas and offline retry links.
- [ ] Check 200% browser zoom and Windows forced-colors/high-contrast mode: text, borders and controls remain perceivable.
- [ ] With a screen reader, verify one primary heading, main landmark, meaningful links and correct Russian pronunciation for text annotated `lang=ru`.

## Security and diagnostics

- [ ] In DevTools > Application > Cache Storage, confirm only the generic `/offline.html` response is cached by the Services service worker; no authenticated HTML, API payloads, tokens or search/profile data.
- [ ] Check network responses: private workspace routes have `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; public catalog remains indexable.
- [ ] Check production navigation during simulated 502/503/504 gateway failures: public pages show the generic fallback; 401/403/404/429/500 responses are not masked.
- [ ] Record any device/browser-specific issues and rerun after fixes.

**Release decision:** PWA device and accessibility acceptance remains **NO-GO** until all applicable items have recorded evidence and sign-off.
