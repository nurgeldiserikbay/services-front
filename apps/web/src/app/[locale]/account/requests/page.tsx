import {cookies} from 'next/headers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {isLocale} from '@/lib/i18n';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getOwnSellerInbox} from '@/lib/seller-bff.server';
import {SellerAccountInbox} from '@/components/SellerAccountInbox';

export const dynamic='force-dynamic';
export const revalidate=0;

/**
 * Registered seller workspace, never a public catalog page.
 * A sealed cookie alone is not proof: before rendering, backend validates
 * the ACTIVE account and returns only the seller-scoped request inbox.
 * The page is disabled until a reviewed login/cookie issuance flow exists.
 */
export default async function AccountRequestsPage({
  params,
}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  if(!isLocale(locale)||
     process.env.SERVICES_WEB_ENABLE_SELLER_BFF!=='enabled'||
     process.env.SERVICES_WEB_ENABLE_SELLER_WORKSPACE!=='enabled')
    notFound();
  const cookie=(await cookies()).get(ACCOUNT_WEB_COOKIE)?.value;
  try{
    // Intentional backend revalidation, not just cookie decryption.
    await getOwnSellerInbox(cookie,{limit:1,state:null,cursor:null});
  }catch{
    // Login redirect is added only after real account login is available.
    // Deny by default and never render the seller UI on network failure.
    notFound();
  }
  const kk=locale==='kk';
  return <main className="shell">
    <header className="header">
      <Link className="brand" href={'/'+locale}>
        Services<span className="brandDot">.</span>
      </Link>
      <nav aria-label={kk?'Навигация':'Навигация'}>
        <Link href={'/'+locale}>{kk?'Каталогқа қайту':'Вернуться в каталог'}</Link>
        {process.env.SERVICES_WEB_ENABLE_ACCOUNT_NOTIFICATIONS==='enabled'&&<Link href={'/'+locale+'/account/notifications'}>{kk?'Хабарламалар':'Уведомления'}</Link>}
      </nav>
    </header>
    <section aria-label={kk?'Маманның жұмыс аймағы':'Рабочее место исполнителя'}>
      <p className="eyebrow">SERVICES / WORKSPACE</p>
      <h1>{kk?'Менің өтінімдерім':'Мои заявки'}</h1>
      <p className="intro">{kk
        ?'Жеке маман және компания өтінімдері бір жерде. Әр өтінім бойынша құқықтар серверде тексеріледі.'
        :'Личные и корпоративные заявки в одном месте. Права проверяются сервером для каждой заявки.'}</p>
      <SellerAccountInbox locale={locale}/>
    </section>
  </main>;
}
