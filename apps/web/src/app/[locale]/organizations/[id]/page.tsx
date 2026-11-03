import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dictionary, isLocale } from '@/lib/i18n';
import { getPublicOrganization, ProfileNotFound } from '@/lib/public-profiles';

type Props={params:Promise<{locale:string;id:string}>};

export default async function OrganizationPage({params}:Props) {
  const {locale,id}=await params;
  if(!isLocale(locale)) notFound();
  const t=dictionary[locale];
  let organization;
  try { organization=await getPublicOrganization(id); }
  catch(e) {
    if(e instanceof ProfileNotFound) notFound();
    return <main className="shell profilePage">
      <Link href={'/'+locale}>{t.brand}</Link><p role="status">{t.unavailable}</p>
    </main>;
  }
  return <main className="shell profilePage">
    <nav><Link href={'/'+locale}>{t.brand}</Link></nav>
    <article className="publicProfile">
      <span className="profileType">{t.resultKinds.organization}</span>
      <h1>{organization.name}</h1>
      <p>{t.profileInfo}</p>
      <p className="profileMeta">{t.profileUnavailableContacts}</p>
    </article>
    <Link className="backLink" href={'/'+locale}>{t.backToSearch}</Link>
  </main>;
}
