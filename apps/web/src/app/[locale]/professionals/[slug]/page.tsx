import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {getPublicProfessional,PublicResourceNotFound} from '@/lib/api';
import {dictionary,isLocale} from '@/lib/i18n';
import {PublicOffers} from '@/components/PublicOffers';

type Params={params:Promise<{locale:string;slug:string}>};
async function load(slug:string) {
  try{return await getPublicProfessional(slug)}
  catch(err){if(err instanceof PublicResourceNotFound)notFound();return null}
}
export async function generateMetadata({params}:Params):Promise<Metadata> {
  const {locale,slug}=await params;
  if(!isLocale(locale))return {robots:{index:false,follow:false}};
  try {
    const professional=await getPublicProfessional(slug);
    return {title:(professional.title??professional.slug)+' — Services',
      robots:{index:true,follow:true}};
  } catch {return {robots:{index:false,follow:false}}}
}
export default async function ProfessionalPage({params}:Params) {
  const {locale,slug}=await params;
  if(!isLocale(locale))notFound();
  const t=dictionary[locale];
  const profile=await load(slug);
  return <main className="shell publicDetail">
    <header className="header"><Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link>
      <Link href={'/'+locale}>{t.backToSearch}</Link></header>
    {profile ? <>
      <section className="publicDetailHero">
        <p className="eyebrow">{t.resultKinds.professional}</p>
        <h1>{profile.title??profile.slug}</h1>
        <p className="intro">{t.publicOnlyNotice}</p>
      </section>
      <PublicOffers locale={locale} offers={profile.offers}/>
    </> : <p role="alert" className="message">{t.profileUnavailable}</p>}
  </main>;
}
