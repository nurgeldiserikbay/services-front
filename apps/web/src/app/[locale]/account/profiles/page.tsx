import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {isLocale} from '@/lib/i18n';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import CreateProfileForm from './CreateProfileForm';
import {getPublicProfessions,type ProfessionOption} from '@/lib/api';
import {getProfessionalProfileCreationContext,getOwnProfessionalProfiles} from '@/lib/account-session-bff.server';
import type {OwnProfessionalProfile} from '@/lib/account-session-transport.mjs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
export default async function ProfilesPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!isLocale(locale)||process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILES!=='enabled')notFound();
 let profiles:OwnProfessionalProfile[];
 try{profiles=await getOwnProfessionalProfiles((await cookies()).get(ACCOUNT_WEB_COOKIE)?.value);}
 catch{notFound();}
 const kk=locale==='kk';
 let creation:{csrf:string;professions:ProfessionOption[]}|null=null;
 if(process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILE_CREATION==='enabled'){
  try{
   const context=await getProfessionalProfileCreationContext((await cookies()).get(ACCOUNT_WEB_COOKIE)?.value);
   const professions=await getPublicProfessions();
   const owned=new Set(context.profiles.map(p=>p.profession_id.toLowerCase()));
   creation={csrf:context.csrf,professions:professions.filter(p=>!owned.has(p.id.toLowerCase()))};
  }catch{/* read-only inventory remains available */}
 }
 const statuses={draft:kk?'Жоба':'Черновик',published:kk?'Жарияланған':'Опубликован',paused:kk?'Тоқтатылған':'На паузе',archived:kk?'Архивте':'В архиве'};
 return <main id="main-content" className="shell">
  <header className="header"><Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link>
   {process.env.SERVICES_WEB_ENABLE_ACCOUNT_HOME==='enabled'&&<Link href={'/'+locale+'/account'}>{kk?'Менің аккаунтым':'Мой аккаунт'}</Link>}
  </header>
  <h1>{kk?'Мамандық профильдерім':'Мои профессиональные профили'}</h1>
  {creation&&creation.professions.length>0&&<CreateProfileForm kk={kk} csrf={creation.csrf} professions={creation.professions}/>}
  {profiles.length===0?<p>{kk?'Профильдер әзірге жоқ.':'Пока нет профилей.'}</p>:
   <ul>{profiles.map(profile=><li key={profile.id}><article>
    <h2>{profile.title||profile.slug}</h2><p>{statuses[profile.lifecycle_status]}</p>
    {profile.about&&<p>{profile.about}</p>}
    <p>{kk?'Қызметтер':'Услуги'}: {profile.offers.length}</p>
   </article></li>)}</ul>}
 </main>;
}
