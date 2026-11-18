'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ProfessionOption} from '@/lib/api';
export default function CreateProfileForm({kk,csrf,professions}:{kk:boolean;csrf:string;professions:ProfessionOption[]}){
 const router=useRouter();const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const attempt=useRef<{profession:string;key:string}|null>(null);const inFlight=useRef(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current||!selected)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   if(attempt.current?.profession!==selected)attempt.current={profession:selected,key:crypto.randomUUID()};
   const response=await fetch('/api/account/profiles',{method:'POST',headers:{'Content-Type':'application/json','x-services-csrf':csrf,'Idempotency-Key':attempt.current.key},body:JSON.stringify({profession_id:selected}),credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.status===201){attempt.current=null;setSelected('');setMessage(kk?'Профиль жасалды.':'Профиль создан.');router.refresh();}
   else if(response.status===409){setMessage(kk?'Профиль бар немесе сұраныс қайшы.':'Профиль уже существует или запрос конфликтует.');router.refresh();}
   else setMessage(kk?'Қайта көріңіз.':'Повторите попытку.');
  }catch{setMessage(kk?'Қайта көріңіз.':'Повторите попытку.');}finally{inFlight.current=false;setBusy(false);}
 }
 return <form onSubmit={submit}>
  <label htmlFor="profile-profession">{kk?'Мамандық':'Профессия'}</label>
  <select id="profile-profession" required value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>
   <option value="">{kk?'Таңдаңыз':'Выберите'}</option>
   {professions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
  <button type="submit" disabled={busy||!selected}>{kk?'Профиль жасау':'Создать профиль'}</button>
  <p role="status" aria-live="polite">{message}</p>
 </form>;
}
