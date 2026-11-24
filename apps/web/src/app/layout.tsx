import type { Metadata, Viewport } from 'next';
import './globals.css';
import {headers} from 'next/headers';
import {OfflineRegistration} from '@/components/OfflineRegistration';
import {LocaleDocumentLanguage} from '@/components/LocaleDocumentLanguage';

export const metadata: Metadata = {
  title: 'Services — мамандар мен қызметтер',
  description: 'Қызмет көрсетушілер мен компанияларды табуға арналған ашық каталог',
};

// Keep the installed PWA browser chrome consistent with manifest.ts.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#167b72',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-services-locale');
  const documentLanguage = locale === 'ru' ? 'ru' : 'kk';
  return <html lang={documentLanguage}><body><LocaleDocumentLanguage initialLocale={documentLanguage}/>{children}<OfflineRegistration/></body></html>;
}
