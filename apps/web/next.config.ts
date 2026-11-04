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
    return [{
      source: '/:path*',
      headers: [
        ...securityHeaders,
        ...(process.env.NODE_ENV === 'production'
          ? [{key: 'Content-Security-Policy', value: productionCsp}]
          : []),
      ],
    }];
  },
};

export default config;
