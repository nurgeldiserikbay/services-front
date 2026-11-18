'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {OwnProfessionalProfile} from '@/lib/account-session-transport.mjs';
export default function EditProfileForm({kk,csrf,profile}:{kk:boolean;csrf:string;profile:Pick<OwnProfessionalProfile,'id'|'version'|'title'|'about'>}){
 const router=useRouter();const [title,setTitle]=useState(profile.title??'');const [about,setAbout]=useState(profile.about??'');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [stale,setStale]=useState(false);const [version,setVersion]=useState(profile.version);const inFlight=useRef(false);
 const [saved,setSaved]=useState({title:profile.title??'',about:profile.about??''});
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current||stale)return;
  const body={...(title!==saved.title?{title}:{}),...(about!==saved.about?{about}:{})};
  if(!Object.keys(body).length)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/account/profiles/'+profile.id,{method:'PATCH',headers:{'Content-Type':'application/json','x-services-csrf':csrf,'If-Match':'"'+version+'"'},body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.status===200){setSaved({title,about});setVersion(v=>v+1);setMessage(kk?'Сақталды.':'Сохранено.');router.refresh();}
   else if(response.status===409){setStale(true);setMessage(kk?'Профиль өзгерген. Соңғы нұсқаны жүктеңіз.':'Профиль изменился. Загрузите актуальную версию.');}
   else setMessage(kk?'Сақтау расталмады. Қайта тексеріңіз.':'Сохранение не подтверждено. Проверьте снова.');
  }catch{setMessage(kk?'Сақтау расталмады. Қайта тексеріңіз.':'Сохранение не подтверждено. Проверьте снова.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <form onSubmit={submit}>
  <label htmlFor={'title-'+profile.id}>{kk?'Атауы':'Название'}</label>
  <input id={'title-'+profile.id} maxLength={180} value={title} disabled={busy||stale} onChange={e=>setTitle(e.target.value)}/>
  <label htmlFor={'about-'+profile.id}>{kk?'Сипаттама':'Описание'}</label>
  <textarea id={'about-'+profile.id} maxLength={3000} value={about} disabled={busy||stale} onChange={e=>setAbout(e.target.value)}/>
  <button type="submit" disabled={busy||stale||(title===saved.title&&about===saved.about)}>{kk?'Сақтау':'Сохранить'}</button>
  {stale&&<button type="button" onClick={()=>window.location.reload()}>{kk?'Жаңарту':'Обновить'}</button>}
  <p role="status" aria-live="polite">{message}</p>
 </form>;
}
