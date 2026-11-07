import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {isLocale} from '@/lib/i18n';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getAccountWebSessions} from '@/lib/account-session-bff.server';
import {AccountDeviceSessions} from '@/components/AccountDeviceSessions';

export const dynamic='force-dynamic';
export const revalidate=0;

/**
 * Protected, default-off account settings surface. The encrypted cookie is
 * insufficient by itself: the backend revalidates ACTIVE account/session.
 * Never expose account devices through a public marketplace page.
 */
export default async function AccountDevicesPage({
 params,
}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!isLocale(locale)||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_DEVICES_PAGE!=='enabled')
  notFound();
 const cookie=(await cookies()).get(ACCOUNT_WEB_COOKIE)?.value;
 try{
  await getAccountWebSessions(cookie);
 }catch{
  // Do not render private device controls for absent/revoked bearer or a
  // backend outage. Actual sign-in routing needs a reviewed login flow.
  notFound();
 }
 const kk=locale==='kk';
 return <main className="shell">
  <header className="header">
   <Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link>
   <nav aria-label={kk?'Навигация':'Навигация'}>
    <Link href={'/'+locale}>{kk?'Каталогқа қайту':'Вернуться в каталог'}</Link>
   </nav>
  </header>
  <section aria-label={kk?'Аккаунт қауіпсіздігі':'Безопасность аккаунта'}>
   <p className="eyebrow">{kk?'АККАУНТ':'АККАУНТ'}</p>
   <h1>{kk?'Сессияларды басқару':'Управление сеансами'}</h1>
   <p className="intro">{kk
    ?'Өзіңіздің басқа құрылғылардағы сессияларыңызды тексеріп, қажет болса тоқтатыңыз.'
    :'Проверьте и при необходимости завершите сеансы на других устройствах.'}</p>
   <AccountDeviceSessions locale={locale}/>
  </section>
 </main>;
}
