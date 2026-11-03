import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dictionary, isLocale } from '@/lib/i18n';
import { getPublicProfessional, ProfileNotFound } from '@/lib/public-profiles';

type Props = {params: Promise<{locale:string;slug:string}>};

export default async function ProfessionalPage({params}:Props) {
  const {locale,slug}=await params;
  if(!isLocale(locale)) notFound();
  const t=dictionary[locale];
  let profile;
  try { profile=await getPublicProfessional(slug); }
  catch(e) {
    if(e instanceof ProfileNotFound) notFound();
    return <main className="shell profilePage">
      <Link href={'/'+locale}>{t.brand}</Link><p role="status">{t.unavailable}</p>
    </main>;
  }
  return <main className="shell profilePage">
    <nav><Link href={'/'+locale}>{t.brand}</Link></nav>
    <article className="publicProfile">
      <span className="profileType">{t.resultKinds.professional}</span>
      <h1>{profile.title || profile.slug}</h1>
      <p>{t.profileInfo}</p>
      <p className="profileMeta">{t.profileUnavailableContacts}</p>
    </article>
    <Link className="backLink" href={'/'+locale}>{t.backToSearch}</Link>
  </main>;
}
