'use client';

import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {SellerInboxList,type SellerInboxEntry} from './SellerInboxList';
import {parseSellerInboxPage} from '@/lib/seller-inbox-ui-core.mjs';

type Page={items:SellerInboxEntry[];next_cursor:string|null};
type Receipt={id:string;state:'accepted'|'declined';version:number;replayed:boolean};
const copy={
  kk:{load:'Өтінімдерді жүктеу',more:'Тағы көрсету',refresh:'Жаңарту',
    loading:'Жүктелуде…',error:'Өтінімдерді жүктеу мүмкін болмады. Қайта көріңіз.'},
  ru:{load:'Загрузить заявки',more:'Показать ещё',refresh:'Обновить',
    loading:'Загрузка…',error:'Не удалось загрузить заявки. Попробуйте снова.'},
} as const;

/** Authenticated adapters must be injected by a secure parent/BFF.
 * Never accepts session tokens or contacts as props.
 */
export function SellerInboxPanel({locale,loadPage,decide}:{
  locale:Locale;
  loadPage:(cursor:string|null)=>Promise<unknown>;
  decide:(id:string,action:'accept'|'decline',version:number,key:string)=>Promise<Receipt>;
}){
  const t=copy[locale];
  const locked=useRef(false);
  const [items,setItems]=useState<SellerInboxEntry[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  async function load(next:string|null){
    if(locked.current)return;
    locked.current=true;setBusy(true);setError(false);
    try{
      const page=parseSellerInboxPage(await loadPage(next)) as Page;
      setItems(previous=>next===null?page.items:[
        ...previous,...page.items.filter(item=>!previous.some(old=>old.id===item.id)),
      ]);
      setCursor(page.next_cursor);setLoaded(true);
    }catch{setError(true);}
    finally{locked.current=false;setBusy(false);}
  }
  function onSuccess(id:string,result:Receipt){
    setItems(previous=>previous.map(item=>item.id===id&&
      item.version+1===result.version?{...item,state:result.state,version:result.version}:item));
  }
  return <div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
      <button type="button" disabled={busy} onClick={()=>void load(null)}>
        {busy?t.loading:loaded?t.refresh:t.load}
      </button>
    </div>
    {error&&<p role="alert">{t.error}</p>}
    {loaded&&<SellerInboxList locale={locale} items={items}
      onDecision={decide} onSuccess={onSuccess}/>}
    {loaded&&cursor&&<button type="button" disabled={busy}
      onClick={()=>void load(cursor)}>{busy?t.loading:t.more}</button>}
  </div>;
}
