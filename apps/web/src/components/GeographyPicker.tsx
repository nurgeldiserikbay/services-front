'use client';

import {useEffect,useState} from 'react';
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
  const [error,setError]=useState(false);
  const [busy,setBusy]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/geography/countries',{signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error('geography unavailable');return r.json()})
      .then((data:{items?:Country[]})=>{if(!controller.signal.aborted)setCountries(Array.isArray(data.items)?data.items:[])})
      .catch(()=>{if(!controller.signal.aborted)setError(true)})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(!countryId){return;}
    const controller=new AbortController();
    const query=new URLSearchParams({country_id:countryId});
    if(cityQuery.trim())query.set('q',cityQuery.trim().slice(0,140));
    fetch('/api/geography/cities?'+query,{signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error('cities unavailable');return r.json()})
      .then((data:{items?:City[]})=>{if(!controller.signal.aborted)setCities(Array.isArray(data.items)?data.items:[])})
      .catch(()=>{if(!controller.signal.aborted)setError(true)});
    return ()=>controller.abort();
  },[countryId,cityQuery]);
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
          const id=e.target.value;setCountryId(id);setCityId('');setCityQuery('');setCities([]);setScope(id?'country':'global');
        }}>
          <option value="">{busy?t.loading:t.chooseCountry}</option>
          {countries.map(c=><option key={c.id} value={c.id}>{c.name} ({c.iso2})</option>)}
        </select>
      </label>
      {countryId&&<label>{t.searchCity}
        <input type="search" value={cityQuery} onChange={e=>{
          setCityQuery(e.target.value);setCityId('');if(scope==='city')setScope('country');
        }} placeholder={t.hint} maxLength={140} />
      </label>}
      {countryId&&<label>{t.city}
        <select name="city_id" value={cityId} onChange={e=>{
          const value=e.target.value;setCityId(value);setScope(value?'city':'country');
        }}>
          <option value="">{t.chooseCity}</option>
          {cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>}
    </div>
    {error&&<p role="status" className="geoError">{t.unavailable}</p>}
  </fieldset>;
}
