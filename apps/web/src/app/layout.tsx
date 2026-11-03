import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Services — мамандар мен қызметтер',
  description: 'Қызмет көрсетушілер мен компанияларды табуға арналған ашық каталог',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="kk"><body>{children}</body></html>;
}
