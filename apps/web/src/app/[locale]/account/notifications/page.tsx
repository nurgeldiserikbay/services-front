import {cookies} from 'next/headers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {isLocale} from '@/lib/i18n';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getOwnAccountNotifications} from '@/lib/account-notifications-bff.server';
import {AccountNotificationsInbox} from '@/components/AccountNotificationsInbox';

export const dynamic='force-dynamic';
export const revalidate=0;

/** Account login remains release-gated. Fail closed until both cookie and
 * live backend session are valid; never render another person's inbox. */
export default async function AccountNotificationsPage({
 params,
}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!isLocale(locale)||process.env.SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS!=='enabled')
  notFound();
 try{
  await getOwnAccountNotifications((await cookies()).get(ACCOUNT_WEB_COOKIE)?.value);
 }catch{notFound();}
 const kk=locale==='kk';
 return <main className="shell">
  <header className="header">
   <Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link>
   <nav>{process.env.SERVICES_WEB_ENABLE_SELLER_WORKSPACE==='enabled'&&<Link href={'/'+locale+'/account/requests'}>
    {kk?'Өтінімдерге өту':'К заявкам'}</Link>}
    <Link href={'/'+locale}>{kk?'Каталог':'Каталог'}</Link></nav>
  </header>
  <AccountNotificationsInbox locale={locale}/>
 </main>;
}
