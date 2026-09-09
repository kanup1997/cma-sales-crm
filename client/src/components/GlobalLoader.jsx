import {useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
export default function GlobalLoader(){const [pending,setPending]=useState(0);useEffect(()=>{const start=()=>setPending(value=>value+1),end=()=>setPending(value=>Math.max(0,value-1));window.addEventListener('api:start',start);window.addEventListener('api:end',end);return()=>{window.removeEventListener('api:start',start);window.removeEventListener('api:end',end);};},[]);return pending?<div className="global-api-loader" role="status"><LoaderCircle size={17}/><span>Loading...</span></div>:null;}
