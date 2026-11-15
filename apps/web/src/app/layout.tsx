import type { Metadata } from 'next';
import './globals.css';
import {headers} from 'next/headers';
import {OfflineRegistration} from '@/components/OfflineRegistration';

export const metadata: Metadata = {
  title: 'Services — мамандар мен қызметтер',
  description: 'Қызмет көрсетушілер мен компанияларды табуға арналған ашық каталог',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-services-locale');
  const documentLanguage = locale === 'ru' ? 'ru' : 'kk';
  return <html lang={documentLanguage}><body><a className="skipLink" href="#main-content">{documentLanguage === 'ru' ? 'Перейти к содержимому' : 'Негізгі мазмұнға өту'}</a>{children}<OfflineRegistration/></body></html>;
}
