import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown,Search,X} from 'lucide-react';

export default function SearchableSelect({value='',options=[],onChange,placeholder='Select option',disabled=false,clearable=true}){
  const root=useRef(null);const menu=useRef(null);const selected=options.find(option=>String(option.value)===String(value));const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [position,setPosition]=useState({});
  function place(){const rect=root.current?.getBoundingClientRect();if(!rect)return;const width=Math.max(rect.width,240);const left=Math.min(rect.left,window.innerWidth-width-10);const above=window.innerHeight-rect.bottom<290&&rect.top>290;setPosition({left:Math.max(10,left),width,...(above?{bottom:window.innerHeight-rect.top+5}:{top:rect.bottom+5})});}
  useEffect(()=>{const close=e=>{if(!root.current?.contains(e.target)&&!menu.current?.contains(e.target)){setOpen(false);setQuery('');}};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[]);
  useEffect(()=>{if(!open)return;place();const reposition=()=>place();window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);return()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);};},[open]);
  const visible=useMemo(()=>{const q=query.trim().toLowerCase();return q?options.filter(option=>option.label.toLowerCase().includes(q)):options;},[options,query]);
  function choose(option){onChange(option.value);setOpen(false);setQuery('');}
  const dropdown=open?<div className="search-select-menu portal" ref={menu} style={position}><div className="search-select-input"><Search size={14}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search..."/></div><div className="search-select-options">{visible.map(option=><button type="button" key={option.value} className={String(option.value)===String(value)?'selected':''} onClick={()=>choose(option)}><span>{option.label}</span>{String(option.value)===String(value)&&<Check size={14}/>}</button>)}{!visible.length&&<div className="search-select-empty">No matching option</div>}</div></div>:null;
  return <div className={`search-select ${open?'open':''}`} ref={root}><button type="button" disabled={disabled} className="search-select-trigger" onClick={()=>{if(!open)place();setOpen(x=>!x);}}><span className={selected?'':'placeholder'}>{selected?.label||placeholder}</span>{selected&&clearable?<X size={14} onClick={e=>{e.stopPropagation();onChange('');}}/>:<ChevronDown size={15}/>}</button>{dropdown&&createPortal(dropdown,document.body)}</div>;
}
