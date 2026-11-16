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

## Geographic search acceptance (both locales)

- [ ] On narrow Android Chrome and desktop keyboard, choose a country and then a city; submit the public search form and verify the resulting URL and displayed scope correspond to the chosen IDs (do not rely on the dropdown label alone).
- [ ] Switch from city to country scope and then to global scope; verify the results no longer apply a stale city restriction. Switch countries and confirm the prior city's ID cannot be submitted as a new-country city selection.
- [ ] Type a city query rapidly, then replace it before the 250 ms debounce finishes; with DevTools network throttling, confirm late responses do not restore stale options or a stale empty/error message.
- [ ] Simulate a country catalog failure and a city catalog failure independently. Verify each retry button repeats only the relevant lookup, the current search inputs remain intact, and the associated select exposes its error through `aria-invalid` and `aria-describedby`.
- [ ] Simulate a successful empty country catalog and a successful empty city lookup; verify the localized no-results message and retry button appear, rather than the unavailable/error message.
- [ ] With NVDA/VoiceOver or TalkBack, confirm loading status is announced without repeated disruptive announcements, the city search input is associated with its city select, and failed selections cannot be committed while the lookup is pending or errored.
- [ ] At 200% zoom and a 320 CSS-pixel viewport, verify country, city, retry buttons and validation messages remain readable and operable by touch and keyboard.

For every failed scenario record the exact request URL (without credentials), response status, locale, screenshot, browser/version and frontend SHA. Keep the checkbox open until tested on a real browser/device; source-regression tests alone are not acceptance evidence.

## Security and diagnostics

- [ ] In DevTools > Application > Cache Storage, confirm only the generic `/offline.html` response is cached by the Services service worker; no authenticated HTML, API payloads, tokens or search/profile data.
- [ ] Check network responses: private workspace routes have `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; public catalog remains indexable.
- [ ] Check production navigation during simulated 502/503/504 gateway failures: public pages show the generic fallback; 401/403/404/429/500 responses are not masked.
- [ ] Record any device/browser-specific issues and rerun after fixes.

**Release decision:** PWA device and accessibility acceptance remains **NO-GO** until all applicable items have recorded evidence and sign-off.
