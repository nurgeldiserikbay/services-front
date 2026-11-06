'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import type {SellerRequestSummary} from '@/lib/seller-requests';
import {loadSellerInbox,sendSellerDecision} from '@/lib/seller-bff-client.mjs';
import styles from './SellerRequestList.module.css';

type Page={items:SellerRequestSummary[];nextCursor:string|null;csrf:string};
const labels={
 kk:{heading:'Өтінімдер',load:'Жүктеу',more:'Тағы көрсету',refresh:'Жаңарту',
   loading:'Жүктелуде…',empty:'Өтінім жоқ',failed:'Өтінімдерді жүктеу мүмкін болмады.',
   accept:'Қабылдау',decline:'Бас тарту',professional:'Маман',organization:'Компания',
   conflict:'Өтінім өзгерген. Тізім жаңартылады.',forbidden:'Бұл әрекетке рұқсат жоқ.',
   notice:'Өтінімді қабылдау уақытты автоматты түрде растамайды.'},
 ru:{heading:'Заявки',load:'Загрузить',more:'Показать ещё',refresh:'Обновить',
   loading:'Загрузка…',empty:'Заявок нет',failed:'Не удалось загрузить заявки.',
   accept:'Принять',decline:'Отклонить',professional:'Специалист',organization:'Компания',
   conflict:'Заявка изменилась. Список обновляется.',forbidden:'Недостаточно прав.',
   notice:'Принятие заявки не подтверждает время автоматически.'},
} as const;

/**
 * Account-wide inbox, not a single seller's workspace. Records are
 * authorized upstream; seller-kind badges distinguish personal/company
 * contexts. Mounted only after registered-account login release gates pass.
 */
export function SellerAccountInbox({locale}:{locale:Locale}){
 const t=labels[locale];
 const [page,setPage]=useState<Page|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [pendingId,setPendingId]=useState<string|null>(null);
 const [blocked,setBlocked]=useState<Record<string,number>>({});
 const run=useRef(false);
 const epoch=useRef(0);
 const current=useRef<Page|null>(null);
 const retry=useRef(new Map<string,string>());
 const load=useCallback(async(next=false)=>{
   if(run.current)return false;
   run.current=true;setBusy(true);setMessage('');
   const seq=++epoch.current;
   const previous=current.current;
   try{
     const response=await loadSellerInbox({cursor:next?previous?.nextCursor??null:null});
     if(seq!==epoch.current)return false;
     const merged=next&&previous?[...previous.items,...response.items]:response.items;
     const newer=new Map<string,SellerRequestSummary>();
     for(const item of merged){
       const old=newer.get(item.id);
       if(!old||item.version>old.version)newer.set(item.id,item);
     }
     const updated={items:[...newer.values()],nextCursor:response.nextCursor,csrf:response.csrf};
     current.current=updated;setPage(updated);
     return true;
   }catch{
     if(seq===epoch.current)setMessage(t.failed);
     return false;
   }finally{run.current=false;setBusy(false);}
 },[t.failed]);
 useEffect(()=>{
   // An account/session boundary must unmount this component on logout.
   void load();
   return ()=>{epoch.current++;current.current=null;retry.current.clear();};
 },[load]);

 async function decide(item:SellerRequestSummary,decision:'accept'|'decline'){
   if(run.current||pendingId||item.state!=='pending'||
      blocked[item.id]===item.version||!page?.csrf)return;
   const key=item.id+':'+item.version+':'+decision;
   let nonce=retry.current.get(key);
   if(!nonce){nonce=crypto.randomUUID();retry.current.set(key,nonce);}
   setPendingId(item.id);setMessage('');
   try{
     const outcome=await sendSellerDecision({requestId:item.id,version:item.version,
       decision,csrf:page.csrf,idempotencyKey:nonce});
     if(outcome==='ok'||outcome==='conflict'||outcome==='forbidden'){
       setBlocked(prev=>({...prev,[item.id]:item.version}));
       if(outcome==='forbidden')setMessage(t.forbidden);
       if(outcome==='conflict')setMessage(t.conflict);
       retry.current.delete(key);
       await load();
     }else setMessage(t.failed); // Same key retained for retry after ambiguous failure.
   }catch{setMessage(t.failed);}
   finally{setPendingId(null);}
 }
 return <section className={styles.wrap} aria-label={t.heading}>
   <h2>{t.heading}</h2><p>{t.notice}</p>
   <button type="button" className={styles.refresh}
     disabled={busy||pendingId!==null} onClick={()=>void load()}>{busy?t.loading:t.refresh}</button>
   {message&&<p role="alert">{message}</p>}
   {!page&&!busy&&!message&&<p role="status">{t.empty}</p>}
   {page&&page.items.length===0&&<p role="status">{t.empty}</p>}
   {page&&<ul className={styles.list}>{page.items.map(item=>
     <li key={item.id} className={styles.item}>
       <strong>{item.title}</strong>
       <small>{t[item.sellerKind]} · {item.createdAt.slice(0,10)}</small>
       <span>{item.state}</span>
       {item.state==='pending'&&<div className={styles.actions}>
         <button type="button" disabled={busy||pendingId!==null||blocked[item.id]===item.version}
           onClick={()=>void decide(item,'accept')}>{t.accept}</button>
         <button type="button" disabled={busy||pendingId!==null||blocked[item.id]===item.version}
           onClick={()=>void decide(item,'decline')}>{t.decline}</button>
       </div>}
     </li>)}</ul>}
   {page?.nextCursor&&<button type="button" className={styles.refresh}
     disabled={busy||pendingId!==null} onClick={()=>void load(true)}>{t.more}</button>}
 </section>;
}
