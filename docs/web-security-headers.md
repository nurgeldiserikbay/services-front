# Public web security response headers

The public Next.js web app now provides baseline response hardening:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`
- `Permissions-Policy` denying ambient camera, microphone and geolocation
- `Cross-Origin-Opener-Policy: same-origin`
- Production-only CSP with self-only scripts, styles and connections, disallowing
  object embedding and foreign form destinations.

Next.js may emit inline bootstrap scripts and styles. The current CSP permits
`unsafe-inline` to preserve rendering; moving to nonce/hash-based CSP requires
a dedicated SSR review and browser test. Development remains CSP-unrestricted
for the framework's development runtime. The headers do **not** implement
authentication, CSRF protection, OTP throttling or secure guest sessions.

Public profiles and offers remain indexable. Do not add blanket `noindex`
or `Cache-Control: no-store` to all website pages. Confidential request
routes must opt into private caching policies when built.

Before production release, smoke-test actual deployed response headers,
Next.js hydration, public search, kk/ru navigation and third-party assets.
If a future captcha, map, payment, image CDN or analytics origin is required,
explicitly review and add only that origin to the relevant CSP directive;
never use `*` as a shortcut. Revisit a nonce-based strict CSP separately.
