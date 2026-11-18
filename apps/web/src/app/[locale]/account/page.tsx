import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {isLocale} from '@/lib/i18n';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getAccountWebIdentity} from '@/lib/account-session-bff.server';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';

export default async function AccountPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!isLocale(locale)||process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_HOME!=='enabled')notFound();
 try{
  await getAccountWebIdentity((await cookies()).get(ACCOUNT_WEB_COOKIE)?.value);
 }catch{notFound();}
 const kk=locale==='kk';
 const links=[
  {enabled:process.env.SERVICES_WEB_ENABLE_PROFESSIONAL_PROFILES==='enabled',path:'profiles',label:kk?'Мамандық профильдері':'Профили специалиста'},
  {enabled:process.env.SERVICES_WEB_ENABLE_SELLER_BFF==='enabled'&&process.env.SERVICES_WEB_ENABLE_SELLER_WORKSPACE==='enabled',path:'requests',label:kk?'Өтінімдер':'Заявки'},
  {enabled:process.env.SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS==='enabled',path:'notifications',label:kk?'Хабарламалар':'Уведомления'},
  {enabled:process.env.SERVICES_WEB_ENABLE_ACCOUNT_DEVICES_PAGE==='enabled',path:'devices',label:kk?'Құрылғылар':'Устройства'},
 ];
 return <main id="main-content" className="shell">
  <header className="header"><Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link></header>
  <section>
   <h1>{kk?'Менің аккаунтым':'Мой аккаунт'}</h1>
   <p className="intro">{kk?'Аккаунт расталды.':'Аккаунт подтверждён.'}</p>
   <nav aria-label={kk?'Аккаунт бөлімдері':'Разделы аккаунта'}>
    {links.filter(item=>item.enabled).map(item=><Link key={item.path} href={'/'+locale+'/account/'+item.path}>{item.label}</Link>)}
    <Link href={'/'+locale}>{kk?'Каталогқа қайту':'Вернуться в каталог'}</Link>
   </nav>
  </section>
 </main>;
}
