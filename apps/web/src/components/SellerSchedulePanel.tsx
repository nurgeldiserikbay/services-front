'use client';
import {useRef,useState} from 'react';
import type {ActiveScheduleView} from '@/lib/account-session-transport.mjs';
import {CustomerScheduleProposal} from './CustomerScheduleProposal';
import {ScheduleResolution} from './ScheduleResolution';
import {RequestMutationGate,useRequestMutationGate} from './RequestMutationGate';

type Props={id:string;version:number;csrf:string;locale:'kk'|'ru';onChanged:()=>void;disabled:boolean};
export function SellerSchedulePanel(props:Props){
 return <RequestMutationGate key={props.id+':'+props.version}><SellerSchedulePanelContent {...props}/></RequestMutationGate>;
}
function SellerSchedulePanelContent({id,version,csrf,locale,onChanged,disabled}:Props){
 const gate=useRequestMutationGate();
 const kk=locale==='kk';
 const [view,setView]=useState<ActiveScheduleView|null>(null);
 const [status,setStatus]=useState<'idle'|'busy'|'ready'|'unavailable'|'changed'>('idle');
 const inFlight=useRef(false);
 const load=async()=>{
  if(disabled||gate?.locked||inFlight.current||status==='changed')return;
  inFlight.current=true;setView(null);setStatus('busy');
  try{
   const response=await fetch('/api/account/requests/'+encodeURIComponent(id)+'/schedule-proposals/active',{
    credentials:'same-origin',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000),
   });
   if(response.status!==200||!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control')??'')||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??'')||
    /(?:^|,)\s*(?:public|s-maxage\s*=)/i.test(response.headers.get('cache-control')??''))
    throw new Error('unavailable');
   const row:ActiveScheduleView=await response.json();
   if(row.request_id!==id||row.request_version!==version||row.actor!=='seller')throw new Error('stale');
   setView(row);setStatus('ready');
  }catch{setStatus('unavailable');}
  finally{inFlight.current=false;}
 };
 const changed=()=>{setView(null);setStatus('changed');onChanged();};
 return <div>
  <button type="button" disabled={disabled||!!gate?.locked||status==='busy'||status==='changed'} onClick={()=>void load()}>
   {kk?'Уақыт ұсыныстарын көру':'Посмотреть предложения времени'}
  </button>
  {status==='unavailable'&&<p role="status">{kk?'Күйді жаңартып көріңіз.':'Обновите список заявок.'}</p>}
  {view&&<fieldset disabled={disabled}>
   <ScheduleResolution view={view} csrf={csrf} locale={locale} onChanged={changed}/>
   {view.can_propose&&<CustomerScheduleProposal requestId={id} version={version} csrf={csrf} locale={locale} actor="seller" onChanged={changed}/>}
  </fieldset>}
 </div>;
}
