'use client';

import {useParams} from 'next/navigation';
import {dictionary, isLocale} from '@/lib/i18n';

export default function Loading() {
  const params = useParams();
  const rawLocale = params?.locale;
  const locale = typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : 'kk';
  return <main id="main-content" className="shell publicDetail" aria-busy="true">
    <p role="status" aria-live="polite" className="message">{dictionary[locale].loading}</p>
  </main>;
}
