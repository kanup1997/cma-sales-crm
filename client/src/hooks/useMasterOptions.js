import {useEffect,useState} from 'react';
import {api} from '../api';

let cache=null;
let revision=0;
// Invalidate once per change, even when no dropdown is currently mounted.
window.addEventListener('masters:changed',()=>{cache=null;revision+=1;});

export function useMasterOptions(){
  const token=localStorage.getItem('cma_crm_token');
  const [options,setOptions]=useState(()=>cache?.token===token?cache.options:{});
  useEffect(()=>{
    let active=true;
    function load(){
      if(cache?.token===token){setOptions(cache.options);return;}
      const requestedRevision=revision;
      // api() shares this request across all mounted dropdowns.
      api('/masters/options').then(data=>{
        if(requestedRevision!==revision||token!==localStorage.getItem('cma_crm_token'))return;
        cache={token,options:data.options};
        if(active)setOptions(data.options);
      }).catch(()=>{});
    }
    load();
    window.addEventListener('masters:changed',load);
    return()=>{active=false;window.removeEventListener('masters:changed',load);};
  },[token]);
  return options;
}
