import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

export default function ToastViewport(){
  const [toasts,setToasts]=useState([]);
  useEffect(()=>{
    function show(event){
      const id=Date.now()+Math.random();
      setToasts(items=>[...items,{id,message:event.detail?.message||'Changes saved successfully'}]);
      setTimeout(()=>setToasts(items=>items.filter(item=>item.id!==id)),3500);
    }
    window.addEventListener('app:success',show);
    return()=>window.removeEventListener('app:success',show);
  },[]);
  return <div className="toast-viewport" aria-live="polite">{toasts.map(toast=><div className="success-toast" key={toast.id}><div className="toast-check"><CheckCircle2 size={17}/></div><div><strong>Success</strong><p>{toast.message}</p></div><button aria-label="Dismiss" onClick={()=>setToasts(items=>items.filter(item=>item.id!==toast.id))}><X size={14}/></button></div>)}</div>;
}
