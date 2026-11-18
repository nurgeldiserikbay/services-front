import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {isLocale} from '@/lib/i18n';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getOwnProfessionalProfilePreview} from '@/lib/account-session-bff.server';
export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
export default async function ProfilePreviewPage({params}:{params:Promise<{locale:string;id:string}>}){
 const {locale,id}=await params;
 if(!isLocale(locale)||process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILES!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_PREVIEW!=='enabled')notFound();
 const kk=locale==='kk';
 let preview;
 try{preview=await getOwnProfessionalProfilePreview((await cookies()).get(ACCOUNT_WEB_COOKIE)?.value,id);}
 catch{notFound();}
 const title=kk?'Профильді алдын ала көру':'Предпросмотр профиля';
 return <main id="main-content" className="shell">
  <header className="header"><Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link>
   <Link href={'/'+locale+'/account/profiles'}>{kk?'Профильдерім':'Мои профили'}</Link>
  </header>
  <h1>{title}</h1>
  <p>{kk?'Өзгерістер жарияланбайды.':'Изменения не публикуются.'}</p>
  <section aria-label={kk?'Өңделетін нұсқа':'Черновик'}>
   <h2>{kk?'Өңделетін нұсқа':'Черновик'} · v{preview.draft.version}</h2>
   <h3>{preview.draft.title??preview.slug}</h3>
   {preview.draft.about&&<p>{preview.draft.about}</p>}
  </section>
  <section aria-label={kk?'Жарияланған нұсқа':'Опубликованная версия'}>
   <h2>{kk?'Жарияланған нұсқа':'Опубликованная версия'}</h2>
   {preview.published?<article>
    <p>v{preview.published.version}</p>
    <h3>{preview.published.title??preview.slug}</h3>
    {preview.published.about&&<p>{preview.published.about}</p>}
   </article>:<p>{kk?'Әлі жарияланбаған.':'Ещё не опубликован.'}</p>}
  </section>
 </main>;
}
