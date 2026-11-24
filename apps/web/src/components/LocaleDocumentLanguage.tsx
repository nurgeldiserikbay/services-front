'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import type {Locale} from '@/lib/i18n';

/**
 * Next.js retains the root layout during client-side navigation. The server
 * header-derived <html lang> is correct on a full load but otherwise stays
 * stale when switching /kk to /ru. Synchronize document language after route
 * changes and keep the keyboard skip link's visible label in the same locale.
 */
export function LocaleDocumentLanguage({initialLocale}:{initialLocale:Locale}){
  const pathname=usePathname();
  const segment=pathname?.split('/')[1];
  const locale:Locale=segment==='ru'?'ru':segment==='kk'?'kk':initialLocale;

  useEffect(()=>{
    document.documentElement.lang=locale;
  },[locale]);

  return <a className="skipLink" href="#main-content">
    {locale==='ru'?'Перейти к содержимому':'Негізгі мазмұнға өту'}
  </a>;
}
