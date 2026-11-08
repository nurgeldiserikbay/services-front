import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {getPublicOrganization,PublicResourceNotFound} from '@/lib/api';
import {dictionary,isLocale} from '@/lib/i18n';
import {PublicOffers} from '@/components/PublicOffers';

type Params={params:Promise<{locale:string;id:string}>};
async function load(id:string) {
  try{return await getPublicOrganization(id)}
  catch(err){if(err instanceof PublicResourceNotFound)notFound();return null}
}
export async function generateMetadata({params}:Params):Promise<Metadata>{
  const {locale,id}=await params;
  if(!isLocale(locale))return {robots:{index:false,follow:false}};
  try {
    const org=await getPublicOrganization(id);
    return {title:org.name+' — Services',robots:{index:true,follow:true}};
  } catch {return {robots:{index:false,follow:false}}}
}
export default async function OrganizationPage({params}:Params){
  const {locale,id}=await params;
  if(!isLocale(locale))notFound();
  const t=dictionary[locale];
  const organization=await load(id);
  return <main className="shell publicDetail">
    <header className="header"><Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link>
      <Link href={'/'+locale}>{t.backToSearch}</Link></header>
    {organization ? <>
      <section className="publicDetailHero">
        <p className="eyebrow">{t.resultKinds.organization}</p>
        <h1>{organization.name}</h1>
        <p className="intro">{t.publicOnlyNotice}</p>
      </section>
      <PublicOffers locale={locale} offers={organization.offers}/>
    </> : <p role="alert" className="message">{t.profileUnavailable}</p>}
  </main>;
}
