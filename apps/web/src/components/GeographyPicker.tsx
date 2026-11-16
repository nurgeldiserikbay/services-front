'use client';

import {useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';

type Country = {id:string;iso2:string;name:string};
type City = {id:string;country_id:string;area_id:string|null;name:string;timezone:string};
type Scope = 'global'|'country'|'city';
type Props = {locale:Locale;initialCountryId:string;initialCityId:string;initialScope:Scope};

const copy = {
  kk: {region:'Іздеу аймағы',world:'Бүкіл әлем',country:'Ел',city:'Қала',chooseCountry:'Елді таңдаңыз',chooseCity:'Қаланы таңдаңыз',searchCity:'Қала атауы',loading:'Жүктелуде...',unavailable:'Географиялық каталог қазір қолжетімсіз',hint:'Қаланы табу үшін атауын енгізіңіз',allCities:'Ел бойынша іздеу'},
  ru: {region:'Регион поиска',world:'Весь мир',country:'Страна',city:'Город',chooseCountry:'Выберите страну',chooseCity:'Выберите город',searchCity:'Название города',loading:'Загрузка...',unavailable:'Географический каталог сейчас недоступен',hint:'Введите название, чтобы найти нужный город',allCities:'Поиск по стране'},
} as const;

/** No precise location requests. Server checks canonical UUIDs for each selected scope. */
export function GeographyPicker({locale,initialCountryId,initialCityId,initialScope}:Props) {
  const t=copy[locale];
  const [countries,setCountries]=useState<Country[]>([]);
  const [cities,setCities]=useState<City[]>([]);
  const [countryId,setCountryId]=useState(initialCountryId);
  const [cityId,setCityId]=useState(initialCityId);
  const [scope,setScope]=useState<Scope>(initialScope);
  const [cityQuery,setCityQuery]=useState('');
  const [debouncedCityQuery,setDebouncedCityQuery]=useState('');
  const [queryPending,setQueryPending]=useState(false);
  const [error,setError]=useState(false);
  const [busy,setBusy]=useState(true);
  const [citiesBusy,setCitiesBusy]=useState(false);
  const [cityError,setCityError]=useState(false);
  const [cityRequestVersion,setCityRequestVersion]=useState(0);
  const [countryRequestVersion,setCountryRequestVersion]=useState(0);
  const [cityResultsReady,setCityResultsReady]=useState(false);
  const cityInputGeneration=useRef(0);
  useEffect(()=>{
    const controller=new AbortController();
    setError(false);
    setBusy(true);
    fetch('/api/geography/countries',{signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error('geography unavailable');return r.json()})
      .then((data:{items?:Country[]})=>{if(!controller.signal.aborted)setCountries(Array.isArray(data.items)?data.items:[])})
      .catch(()=>{if(!controller.signal.aborted)setError(true)})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    return ()=>controller.abort();
  },[countryRequestVersion]);
  useEffect(()=>{
    const timer=setTimeout(()=>{setDebouncedCityQuery(cityQuery);setQueryPending(false)},250);
    return ()=>clearTimeout(timer);
  },[cityQuery]);
  useEffect(()=>{
    if(!countryId){setCities([]);setCitiesBusy(false);setCityError(false);setCityResultsReady(false);return;}
    const controller=new AbortController();
    const generation=cityInputGeneration.current;
    const isCurrent=()=>!controller.signal.aborted&&generation===cityInputGeneration.current;
    setCitiesBusy(true);
    setCityResultsReady(false);
    setCities([]);
    setCityError(false);
    const query=new URLSearchParams({country_id:countryId});
    if(debouncedCityQuery.trim())query.set('q',debouncedCityQuery.trim().slice(0,140));
    fetch('/api/geography/cities?'+query,{signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error('cities unavailable');return r.json()})
      .then((data:{items?:City[]})=>{if(isCurrent()){setCities(Array.isArray(data.items)?data.items:[]);setCityResultsReady(true)}})
      .catch(()=>{if(isCurrent())setCityError(true)})
      .finally(()=>{if(isCurrent())setCitiesBusy(false)});
    return ()=>controller.abort();
  },[countryId,debouncedCityQuery,cityRequestVersion]);
  return <fieldset className="geoPicker">
    <legend>{t.region}</legend>
    <div className="geoControls">
      <label>{t.region}
        <select name="scope" value={scope} onChange={e=>setScope(e.target.value as Scope)}>
          <option value="global">{t.world}</option>
          {countryId&&<option value="country">{t.allCities}</option>}
          {cityId&&<option value="city">{t.city}</option>}
        </select>
      </label>
      <label>{t.country}
        <select name="country_id" value={countryId} disabled={busy} onChange={e=>{
          const id=e.target.value;cityInputGeneration.current++;setCountryId(id);setCityId('');setCityQuery('');setDebouncedCityQuery('');setQueryPending(false);setCities([]);setScope(id?'country':'global');
        }}>
          <option value="">{busy?t.loading:t.chooseCountry}</option>
          {countryId&&!countries.some(c=>c.id===countryId)&&<option value={countryId}>{t.country}</option>}
          {countries.map(c=><option key={c.id} value={c.id}>{c.name} ({c.iso2})</option>)}
        </select>
      </label>
      {countryId&&<label>{t.searchCity}
        <input type="search" value={cityQuery} onChange={e=>{
          cityInputGeneration.current++;setCityQuery(e.target.value);setQueryPending(true);setCityId('');if(scope==='city')setScope('country');
        }} placeholder={t.hint} maxLength={140} />
      </label>}
      {countryId&&<label>{t.city}
        <select name="city_id" value={cityId} onChange={e=>{
          const value=e.target.value;setCityId(value);setScope(value?'city':'country');
        }}>
          <option value="">{citiesBusy||queryPending?t.loading:t.chooseCity}</option>
          {cityId&&!cities.some(c=>c.id===cityId)&&<option value={cityId}>{t.city}</option>}
          {!queryPending&&cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>}
    </div>
    {error&&<p role="status" className="geoError">{t.unavailable} <button type="button" onClick={()=>setCountryRequestVersion(v=>v+1)}>{locale==='kk'?'Қайталау':'Повторить'}</button></p>}
    {countryId&&cityResultsReady&&!citiesBusy&&!queryPending&&!cityError&&cities.length===0&&<p role="status" className="geoError">{locale==='kk'?'Қала табылмады':'Города не найдены'}</p>}
    {!queryPending&&cityError&&<p role="status" className="geoError">{t.unavailable} <button type="button" onClick={()=>setCityRequestVersion(v=>v+1)}>{locale==='kk'?'Қайталау':'Повторить'}</button></p>}
  </fieldset>;
}
