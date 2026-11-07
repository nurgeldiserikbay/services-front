import {notFound} from 'next/navigation';
import {isLocale} from '@/lib/i18n';
import {SellerWorkspace} from '@/components/SellerWorkspace';

export const dynamic='force-dynamic';
export const revalidate=0;
export default async function SellerRequestsPage({
 params,
}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!isLocale(locale))notFound();
 return <main className="shell">
   <h1>{locale==='kk'?'Менің өтінімдерім':'Мои заявки'}</h1>
   <SellerWorkspace locale={locale}/>
 </main>;
}
