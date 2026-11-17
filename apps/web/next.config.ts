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
            ? [
                {key: 'Content-Security-Policy', value: productionCsp},
                // Host-only HSTS: do not force HTTPS on unrelated subdomains
                // or preload a staging hostname without a deployment review.
                {key: 'Strict-Transport-Security', value: 'max-age=31536000'},
              ]
            : []),
        ],
      },
      ...['guest-requests','seller','account'].map(section=>({
        // Route config headers take precedence over an API handler's headers.
        // Override the public referrer policy for all private BFF endpoints.
        source: '/api/'+section+'/:path*',
        headers: [{key: 'Referrer-Policy', value: 'no-referrer'}],
      })),
      ...['kk','ru'].flatMap(locale=>['account','seller'].map(section=>({
        // Private workspaces must never be cached or indexed, regardless of
        // which account feature flags are enabled at deployment time.
        source: '/'+locale+'/'+section+'/:path*',
        headers: [
          {key: 'Cache-Control', value: 'private, no-store, max-age=0'},
          {key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive'},
        ],
      }))),
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
        headers: [
          {key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate'},
          {key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive'},
          {key: 'X-Content-Type-Options', value: 'nosniff'},
        ],
      },
    ];
  },
};

export default config;
