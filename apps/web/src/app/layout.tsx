import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Services — мамандар мен қызметтер',
  description: 'Қызмет көрсетушілер мен компанияларды табуға арналған ашық каталог',
};

export default async function RootLayout({ children, params }: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale?: string }>;
}>) {
  const {locale} = await params;
  const documentLanguage = locale === 'ru' ? 'ru' : 'kk';
  return <html lang={documentLanguage}><body>{children}</body></html>;
}
