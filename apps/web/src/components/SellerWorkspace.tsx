'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import type {SellerRequestSummary} from '@/lib/seller-requests';
import {SellerRequestList} from './SellerRequestList';

type Decision='accept'|'decline';
type Page={items:SellerRequestSummary[];next_cursor:string|null;csrf_token:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF=/^[A-Za-z0-9_-]{43}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const validDate=(value:unknown):value is string=>typeof value==='string'&&
  ISO.test(value)&&Number.isFinite(Date.parse(value))&&
  new Date(value).toISOString()===value;
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
      !validDate(r.createdAt)||
      r.desiredStartAt!==null)throw Error('invalid');
 }
 if(new Set(data.items.map((r:SellerRequestSummary)=>r.id)).size!==data.items.length)
   throw Error('invalid');
 return data as unknown as Page;
}
export function SellerWorkspace({locale}:{locale:Locale}){
 const [items,setItems]=useState<SellerRequestSummary[]>([]);
 const [csrf,setCsrf]=useState('');
 const [cursor,setCursor]=useState<string|null>(null);
 const [moreBusy,setMoreBusy]=useState(false);
 const [moreError,setMoreError]=useState(false);
 const [status,setStatus]=useState<'loading'|'ready'|'unauthorized'|'error'>('loading');
 const generation=useRef(0);
 const pendingKeys=useRef(new Map<string,string>());
 const seenCursors=useRef(new Set<string>());
 const pageLock=useRef(false);
 const refreshLock=useRef(false);
 const load=useCallback(async()=>{
   if(refreshLock.current)return;
   refreshLock.current=true;
   const current=++generation.current;
   pageLock.current=false;
   setMoreBusy(false);
   setMoreError(false);
   try{
     const response=await fetch('/api/seller/requests?limit=50',{
       credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},
     });
     if(response.status===401){if(current===generation.current){
       setItems([]);setCursor(null);setCsrf('');setStatus('unauthorized');}
       throw Error('unauthorized');}
     if(!response.ok)throw Error('unavailable');
     const page=parsePage(await response.json());
     if(current!==generation.current)return;
     seenCursors.current.clear();
     if(page.next_cursor)seenCursors.current.add(page.next_cursor);
     setItems(page.items);setCursor(page.next_cursor);
     setCsrf(page.csrf_token);setStatus('ready');
   }catch(error){if(current===generation.current){
     if(!(error instanceof Error&&error.message==='unauthorized')){
       setItems([]);setCursor(null);setCsrf('');setStatus('error');
     }
   }
   throw error;
   }finally{refreshLock.current=false;}
 },[]);
 useEffect(()=>{void load().catch(()=>{});return ()=>{generation.current++;};},[load]);
 const loadMore=useCallback(async()=>{
   if(!cursor||pageLock.current||refreshLock.current)return;
   pageLock.current=true;
   const current=generation.current;
   setMoreBusy(true);setMoreError(false);
   try{
     const response=await fetch('/api/seller/requests?limit=50&cursor='+encodeURIComponent(cursor),{
       credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},
     });
     if(response.status===401){
       if(current===generation.current){
         setItems([]);setCursor(null);setCsrf('');setStatus('unauthorized');
       }
       return;
     }
     if(!response.ok)throw Error('unavailable');
     const page=parsePage(await response.json());
     if(current!==generation.current)return;
     if(page.next_cursor&&(page.next_cursor===cursor||
       seenCursors.current.has(page.next_cursor)))throw Error('cursor_loop');
     if(page.next_cursor)seenCursors.current.add(page.next_cursor);
     setItems(previous=>{
       const byId=new Map(previous.map(item=>[item.id,item]));
       for(const item of page.items){
         const old=byId.get(item.id);
         if(!old||item.version>old.version)byId.set(item.id,item);
       }
       return [...byId.values()];
     });
     setCursor(page.next_cursor);setCsrf(page.csrf_token);
   }catch{if(current===generation.current)setMoreError(true);}
   finally{pageLock.current=false;if(current===generation.current)setMoreBusy(false);}
 },[cursor]);

 const decide=useCallback(async(id:string,version:number,decision:Decision)=>{
   if(!csrf)return 'unauthorized' as const;
   const key=id+':'+version+':'+decision;
   let idempotencyKey=pendingKeys.current.get(key);
   if(!idempotencyKey){idempotencyKey=crypto.randomUUID();pendingKeys.current.set(key,idempotencyKey);}
   try{
     const response=await fetch('/api/seller/requests/'+encodeURIComponent(id)+'/'+decision,{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({version,csrf_token:csrf,idempotency_key:idempotencyKey}),
     });
     if(response.status===401)return 'unauthorized' as const;
     if(response.status===403)return 'forbidden' as const;
     if(response.status===409)return 'conflict' as const;
     if(!response.ok)return 'unavailable' as const;
     const result=await response.json();
     if(result?.outcome==='ok'){pendingKeys.current.delete(key);return 'ok' as const;}
     return 'unavailable' as const;
   }catch{return 'unavailable' as const;}
 },[csrf]);
 const message=locale==='kk'?
   {loading:'Өтінімдер жүктелуде…',unauthorized:'Кіру қажет.',
    error:'Өтінімдерді жүктеу мүмкін болмады.',retry:'Қайта жүктеу',
    more:'Тағы көрсету',moreError:'Келесі бетті жүктеу мүмкін болмады.'}:
   {loading:'Загрузка заявок…',unauthorized:'Требуется вход.',
    error:'Не удалось загрузить заявки.',retry:'Повторить',
    more:'Показать ещё',moreError:'Не удалось загрузить следующую страницу.'};
 return <section>
   {status==='loading'&&<p role="status">{message.loading}</p>}
   {(status==='unauthorized'||status==='error')&&<>
     <p role="alert">{message[status]}</p>
     <button type="button" onClick={()=>void load().catch(()=>{})}>{message.retry}</button>
   </>}
   {status==='ready'&&<>
     <SellerRequestList locale={locale} requests={items} sellerContext="professional"
       onDecision={decide} onRefresh={load}/>
     <SellerRequestList locale={locale} requests={items} sellerContext="organization"
       onDecision={decide} onRefresh={load}/>
     {moreError&&<p role="alert">{message.moreError}</p>}
     {cursor&&<button type="button" disabled={moreBusy} onClick={()=>void loadMore()}>
       {message.more}</button>}
   </>}
 </section>;
}
