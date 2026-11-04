import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { dictionary,isLocale } from '@/lib/i18n';
import { getPublishedServiceOffer,OfferNotFound } from '@/lib/public-offer';
import {ConnectedGuestRequestWizard} from '@/components/ConnectedGuestRequestWizard';

type Props={params:Promise<{locale:string;id:string}>};

export async function generateMetadata({params}:Props):Promise<Metadata> {
  const {locale,id}=await params;
  if(!isLocale(locale)) return {title:'Services',robots:{index:false}};
  try {
    const offer=await getPublishedServiceOffer(id);
    return {title:offer.title+' — Services',robots:{index:true,follow:true}};
  } catch {
    return {title:'Services',robots:{index:false,follow:false}};
  }
}

export default async function ServiceOfferPage({params}:Props) {
  const {locale,id}=await params;
  if(!isLocale(locale)) notFound();
  const t=dictionary[locale];
  let offer;
  try { offer=await getPublishedServiceOffer(id); }
  catch(error) {
    if(error instanceof OfferNotFound) notFound();
    return <main className="shell offerPage">
      <Link href={'/'+locale}>{t.brand}</Link><p role="status">{t.unavailable}</p>
    </main>;
  }
  const methods=offer.contact_methods.map(method=>t.contactMethods[method]);
  // UI and transport flags are independent: never show an actionable form
  // merely because a frontend route has been mounted.
  const guestEnabled=offer.contact_methods.includes('guest_request')&&
    process.env.SERVICES_WEB_ENABLE_GUEST_WIZARD==='enabled'&&
    process.env.SERVICES_WEB_ENABLE_GUEST_OTP_START_HTTP==='enabled'&&
    process.env.SERVICES_WEB_ENABLE_GUEST_OTP_VERIFY_HTTP==='enabled'&&
    process.env.SERVICES_WEB_ENABLE_GUEST_OTP_BFF==='enabled'&&
    process.env.SERVICES_WEB_ENABLE_GUEST_CREATE_HTTP==='enabled';
  return <main className="shell offerPage">
    <nav><Link href={'/'+locale}>{t.brand}</Link></nav>
    <article className="offerDetail">
      <span className="offerType">{t.resultKinds.offer}</span>
      <h1>{offer.title}</h1>
      <p className="offerSeller">{t.offerSeller}: {t.resultKinds[offer.seller_kind]}</p>
      {offer.price_label && <p className="offerPrice">{offer.price_label}</p>}
      <section aria-label={t.offerContact}>
        <h2>{t.offerContact}</h2>
        {methods.length ? <ul>{methods.map((label,idx)=><li key={offer.contact_methods[idx]}>{label}</li>)}</ul>
          : <p>{t.offerNoContact}</p>}
        <p className="offerNote">{t.offerContactPending}</p>
      </section>
      <p className="offerNote">{t.offerTimeNotice}</p>
      {guestEnabled&&<ConnectedGuestRequestWizard serviceOfferId={offer.id} locale={locale}/> }
    </article>
    <Link href={'/'+locale} className="offerBack">{t.backToSearch}</Link>
  </main>;
}
