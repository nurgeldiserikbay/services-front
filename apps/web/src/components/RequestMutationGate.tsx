'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';

type Gate={locked:boolean;acquire:()=>boolean};
const Context=createContext<Gate|null>(null);

// One request/version per provider. Keep the lock after any dispatched
// mutation, including unknown outcomes, until authoritative version changes
// or a full reload. A ref closes the gap before React renders disabled UI.
export function RequestMutationGate({children}:{children:ReactNode}){
 const [hydrated,setHydrated]=useState(false);
 useEffect(()=>setHydrated(true),[]);
 const held=useRef(false);
 const [locked,setLocked]=useState(false);
 const acquire=()=>{
  if(!hydrated||held.current)return false;
  held.current=true;setLocked(true);return true;
 };
 return <Context.Provider value={{locked:!hydrated||locked,acquire}}>{children}</Context.Provider>;
}
export function useRequestMutationGate(){return useContext(Context);}
