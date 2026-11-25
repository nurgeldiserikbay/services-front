import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {isLocale} from '@/lib/i18n';
import {ACCOUNT_WEB_COOKIE} from '@/lib/account-web-session.server';
import {getOwnCustomerRequestPage,getActiveAccountSchedule} from '@/lib/account-session-bff.server';
import {CustomerCompletionAction} from '@/components/CustomerCompletionAction';

import {CustomerScheduleProposal} from '@/components/CustomerScheduleProposal';

import {ScheduleResolution} from '@/components/ScheduleResolution';

export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';

const LABELS:{
 [k:string]:{kk:string;ru:string};
}={
 pending:{kk:'Күтілуде',ru:'Ожидает'},
 accepted:{kk:'Қабылданды',ru:'Принята'},
 declined:{kk:'Қабылданбады',ru:'Отклонена'},
 cancelled_by_customer:{kk:'Клиент бас тартты',ru:'Отменена клиентом'},
 cancelled_by_provider:{kk:'Орындаушы бас тартты',ru:'Отменена исполнителем'},
 cancelled_mutual:{kk:'Екі жақ келісті',ru:'Взаимная отмена'},
 completed:{kk:'Аяқталды',ru:'Завершена'},
 expired:{kk:'Мерзімі өтті',ru:'Истекла'},
};

export default async function CustomerRequestsPage({
 params,searchParams,
}:{
 params:Promise<{locale:string}>;
 searchParams:Promise<{cursor?:string}>;
}){
 const [{locale},{cursor:rawCursor}]=await Promise.all([params,searchParams]);
 if(!isLocale(locale)||
    process.env.SERVICES_WEB_ENABLE_ACCOUNT_SESSION_BFF!=='enabled'||
    process.env.SERVICES_WEB_ENABLE_CUSTOMER_REQUESTS!=='enabled')notFound();
 if(rawCursor!==undefined&&
    (typeof rawCursor!=='string'||! /^[A-Za-z0-9_-]{1,180}$/.test(rawCursor)))
  notFound();
 const cookie=(await cookies()).get(ACCOUNT_WEB_COOKIE)?.value;
 let result:Awaited<ReturnType<typeof getOwnCustomerRequestPage>>;
 try{result=await getOwnCustomerRequestPage(cookie,rawCursor??null);}
 catch{notFound();}
 const kk=locale==='kk';
 const canSchedule=process.env.SERVICES_WEB_ENABLE_ACCOUNT_SCHEDULE==='enabled';
 const activeViews=new Map<string,Awaited<ReturnType<typeof getActiveAccountSchedule>>>();
 if(canSchedule){
  const accepted=result.items.filter(item=>item.state==='accepted');
  // Bound parallel upstream reads; a failed or stale view never exposes actions.
  for(let i=0;i<accepted.length;i+=5){
   await Promise.all(accepted.slice(i,i+5).map(async item=>{
    try{
     const view=await getActiveAccountSchedule(cookie,item.id);
     if(view.actor==='customer'&&view.request_version===item.version)activeViews.set(item.id,view);
    }catch{/* fail closed for this request */}
   }));
  }
 }
 const canComplete=process.env.SERVICES_WEB_ENABLE_CUSTOMER_COMPLETION==='enabled';
 return <main id="main-content" className="shell">
  <header className="header">
   <Link className="brand" href={'/'+locale}>Services<span className="brandDot">.</span></Link>
   <nav><Link href={'/'+locale+'/account'}>{kk?'Аккаунт':'Аккаунт'}</Link></nav>
  </header>
  <section aria-labelledby="customer-requests-heading">
   <p className="eyebrow">SERVICES / REQUESTS</p>
   <h1 id="customer-requests-heading">{kk?'Менің тапсырыстарым':'Мои заказы'}</h1>
   <p className="intro">{kk?'Өтінімдеріңіз тек сіздің аккаунтыңызға қолжетімді.':
    'Ваши заявки доступны только вашему аккаунту.'}</p>
   {result.items.length===0?<p role="status">{kk?'Тапсырыстар жоқ.':'Заказов нет.'}</p>:
    <ul className="resultList">
     {result.items.map(item=>{const view=activeViews.get(item.id);return <li key={item.id} className="resultItem">
      <strong>№ {item.id.slice(0,8)}</strong>
      <p>{LABELS[item.state]?.[kk?'kk':'ru']??item.state}</p>
      <p>{item.created_at.slice(0,16).replace('T',' ')} UTC</p>
      {canSchedule&&item.state==='accepted'&&(view?
       <ScheduleResolution key={item.id+':'+item.version+':resolution'} view={view} csrf={result.csrf} locale={locale}/>:
       <p>{kk?'Ұсыныс күйі қолжетімсіз. Бетті жаңартыңыз.':'Статус предложения недоступен. Обновите страницу.'}</p>)}
      {canSchedule&&view?.can_propose&&item.state==='accepted'&&
       <CustomerScheduleProposal key={item.id+':'+item.version} requestId={item.id} version={item.version}
        csrf={result.csrf} locale={locale}/>}
      {canComplete&&item.state==='accepted'&&
       <CustomerCompletionAction requestId={item.id} version={item.version}
        csrf={result.csrf} locale={locale}/>}
     </li>;})}
    </ul>}
   {result.next_cursor&&
    <nav className="pagination" aria-label={kk?'Беттер':'Страницы'}>
     <Link href={'/'+locale+'/account/my-requests?cursor='+
      encodeURIComponent(result.next_cursor)}>
      {kk?'Келесі бет':'Следующая страница'}
     </Link>
    </nav>}
  </section>
 </main>;
}
