import {dictionary,isLocale} from '@/lib/i18n';

type Props={params:Promise<{locale:string}>};

export default async function Loading({params}:Props) {
  const {locale}=await params;
  const message=isLocale(locale)?dictionary[locale].profileLoading:'Loading…';
  return <main className="shell publicDetail" aria-busy="true">
    <p role="status" aria-live="polite" className="message">{message}</p>
  </main>;
}
