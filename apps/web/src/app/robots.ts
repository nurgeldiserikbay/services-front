import type { MetadataRoute } from 'next';

// Public catalog and published profiles stay crawlable. Private workspaces,
// internal endpoints and PWA infrastructure should not be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/kk', '/ru', '/kk/professionals/', '/ru/professionals/',
        '/kk/organizations/', '/ru/organizations/', '/kk/services/', '/ru/services/'],
      disallow: ['/api', '/api/', '/kk/account', '/kk/account/',
        '/ru/account', '/ru/account/', '/kk/seller', '/kk/seller/',
        '/ru/seller', '/ru/seller/', '/offline.html', '/sw.js'],
    }],
  };
}
