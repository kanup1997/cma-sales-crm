import {useEffect,useState} from 'react';import {api} from '../api';
let cache=null;let pending=null;
export function useMasterOptions(){const [options,setOptions]=useState(cache||{});useEffect(()=>{function load(force=false){if(force)cache=null;if(cache)return setOptions(cache);pending??=api('/masters/options').then(d=>{cache=d.options;return cache;}).finally(()=>{pending=null;});pending.then(setOptions).catch(()=>{});}load();const refresh=()=>load(true);window.addEventListener('masters:changed',refresh);return()=>window.removeEventListener('masters:changed',refresh);},[]);return options;}
