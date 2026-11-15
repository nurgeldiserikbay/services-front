import type { NextConfig } from 'next';

// Public-facing pages stay indexable. Do not add a global noindex or no-store:
// published offers/profiles must be eligible for discovery and SEO.
const securityHeaders = [
  {key: 'X-Content-Type-Options', value: 'nosniff'},
  {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
  {key: 'X-Frame-Options', value: 'DENY'},
  {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
  {key: 'Cross-Origin-Opener-Policy', value: 'same-origin'},
] as const;

const productionCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...securityHeaders,
          ...(process.env.NODE_ENV === 'production'
            ? [{key: 'Content-Security-Policy', value: productionCsp}]
            : []),
        ],
      },
      {
        // A stale worker could keep serving obsolete navigation logic.
        // Browsers must revalidate the worker script on every check.
        source: '/sw.js',
        headers: [
          {key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate'},
          {key: 'Service-Worker-Allowed', value: '/'},
          {key: 'X-Content-Type-Options', value: 'nosniff'},
        ],
      },
      {
        // Never let a CDN accidentally turn the generic offline page into
        // a long-lived public response. The SW owns its explicit offline cache.
        source: '/offline.html',
        headers: [{key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate'}],
      },
    ];
  },
};

export default config;
