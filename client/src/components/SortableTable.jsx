import {useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,ArrowUpDown} from 'lucide-react';

const get=(row,key)=>key.split('.').reduce((value,part)=>value?.[part],row);
export function useSortedRows(rows,initialKey='',initialDirection='asc'){
  const [sort,setSort]=useState({key:initialKey,direction:initialDirection});
  const sorted=useMemo(()=>{if(!sort.key)return rows;return [...rows].sort((a,b)=>{let av=get(a,sort.key),bv=get(b,sort.key);const aEmpty=av==null||av==='',bEmpty=bv==null||bv==='';if(aEmpty&&bEmpty)return 0;if(aEmpty)return 1;if(bEmpty)return-1;if(typeof av==='number'&&typeof bv==='number')return(sort.direction==='asc'?1:-1)*(av-bv);const result=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});return sort.direction==='asc'?result:-result;});},[rows,sort]);
  function toggle(key){setSort(current=>({key,direction:current.key===key&&current.direction==='asc'?'desc':'asc'}));}
  return{rows:sorted,sort,toggle};
}
export function SortableTh({label,field,sort,onSort,className=''}){const active=sort.key===field;const Icon=!active?ArrowUpDown:sort.direction==='asc'?ArrowUp:ArrowDown;return <th className={`sortable-th ${active?'active':''} ${className}`}><button type="button" onClick={()=>onSort(field)}>{label}<Icon size={13}/></button></th>;}
