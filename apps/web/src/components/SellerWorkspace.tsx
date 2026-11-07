'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import type {SellerRequestSummary} from '@/lib/seller-requests';
import {SellerRequestList} from './SellerRequestList';

type Decision='accept'|'decline';
type Page={items:SellerRequestSummary[];next_cursor:string|null;csrf_token:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF=/^[A-Za-z0-9_-]{43}$/;
const states=new Set(['pending','accepted','declined','cancelled_by_customer',
  'cancelled_by_provider','cancelled_mutual','completed','expired']);
function parsePage(raw:unknown):Page{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid');
 const data=raw as Record<string,unknown>;
 if(Object.keys(data).length!==3||
    Object.keys(data).some(k=>!['items','next_cursor','csrf_token'].includes(k))||
    !Array.isArray(data.items)||data.items.length>50||
    typeof data.csrf_token!=='string'||!CSRF.test(data.csrf_token)||
    !(data.next_cursor===null||typeof data.next_cursor==='string'&&
      /^[A-Za-z0-9_-]{1,256}$/.test(data.next_cursor)))throw Error('invalid');
 for(const value of data.items){
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid');
   const r=value as Record<string,unknown>;
   if(Object.keys(r).length!==8||
      Object.keys(r).some(k=>!['id','serviceOfferId','title','state','version',
        'createdAt','sellerKind','desiredStartAt'].includes(k))||
      typeof r.id!=='string'||!UUID.test(r.id)||
      typeof r.serviceOfferId!=='string'||!UUID.test(r.serviceOfferId)||
      typeof r.title!=='string'||r.title.length>500||
      !states.has(r.state as string)||
      !Number.isSafeInteger(r.version)||Number(r.version)<1||
      (r.sellerKind!=='professional'&&r.sellerKind!=='organization')||
      typeof r.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(r.createdAt)||
      r.desiredStartAt!==null)throw Error('invalid');
 }
 if(new Set(data.items.map((r:SellerRequestSummary)=>r.id)).size!==data.items.length)
   throw Error('invalid');
 return data as Page;
}
export function SellerWorkspace({locale}:{locale:Locale}){
 const [items,setItems]=useState<SellerRequestSummary[]>([]);
 const [csrf,setCsrf]=useState('');
 const [status,setStatus]=useState<'loading'|'ready'|'unauthorized'|'error'>('loading');
 const generation=useRef(0);
 const load=useCallback(async()=>{
   const current=++generation.current;
   try{
     const response=await fetch('/api/seller/requests?limit=50',{
       credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},
     });
     if(response.status===401){if(current===generation.current){
       setItems([]);setCsrf('');setStatus('unauthorized');}return;}
     if(!response.ok)throw Error('unavailable');
     const page=parsePage(await response.json());
     if(current!==generation.current)return;
     setItems(page.items);setCsrf(page.csrf_token);setStatus('ready');
   }catch{if(current===generation.current){
     setItems([]);setCsrf('');setStatus('error');}}
 },[]);
 useEffect(()=>{void load();return ()=>{generation.current++;};},[load]);
 const decide=useCallback(async(id:string,version:number,decision:Decision)=>{
   if(!csrf)return 'unauthorized' as const;
   try{
     const response=await fetch('/api/seller/requests/'+encodeURIComponent(id)+'/'+decision,{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({version,csrf_token:csrf,idempotency_key:crypto.randomUUID()}),
     });
     if(response.status===401)return 'unauthorized' as const;
     if(response.status===403)return 'forbidden' as const;
     if(response.status===409)return 'conflict' as const;
     if(!response.ok)return 'unavailable' as const;
     const result=await response.json();
     return result?.outcome==='ok'?'ok' as const:'unavailable' as const;
   }catch{return 'unavailable' as const;}
 },[csrf]);
 const message=locale==='kk'?
   {loading:'Өтінімдер жүктелуде…',unauthorized:'Кіру қажет.',
    error:'Өтінімдерді жүктеу мүмкін болмады.',retry:'Қайта жүктеу'}:
   {loading:'Загрузка заявок…',unauthorized:'Требуется вход.',
    error:'Не удалось загрузить заявки.',retry:'Повторить'};
 return <section>
   {status==='loading'&&<p role="status">{message.loading}</p>}
   {(status==='unauthorized'||status==='error')&&<>
     <p role="alert">{message[status]}</p>
     <button type="button" onClick={()=>void load()}>{message.retry}</button>
   </>}
   {status==='ready'&&<>
     <SellerRequestList locale={locale} requests={items} sellerContext="professional"
       onDecision={decide} onRefresh={load}/>
     <SellerRequestList locale={locale} requests={items} sellerContext="organization"
       onDecision={decide} onRefresh={load}/>
   </>}
 </section>;
}
