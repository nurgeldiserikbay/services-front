import type { MetadataRoute } from 'next';

// Install metadata only. Offline caching and device acceptance are separate gates.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Services — мамандар мен қызметтер',
    short_name: 'Services',
    description: 'Мамандар мен компаниялардың ашық каталогы',
    lang: 'kk',
    start_url: '/kk',
    scope: '/',
    display: 'standalone',
    background_color: '#fafdfc',
    theme_color: '#167b72',
    icons: [{src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'}],
  };
}
