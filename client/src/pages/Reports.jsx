import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, PackageCheck, BadgeCheck, Send, Filter, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const metrics=[
  {key:'quote',label:'Quotes Sent',icon:FileText,tone:'blue'},
  {key:'sample',label:'Samples Sent',icon:PackageCheck,tone:'gold'},
  {key:'final',label:'Final Orders',icon:BadgeCheck,tone:'green'},
  {key:'order',label:'Orders Sent',icon:Send,tone:'violet'}
];
function isoStart(value){return value?new Date(`${value}T00:00:00`).toISOString():'';}
function isoEnd(value){if(!value)return'';const d=new Date(`${value}T00:00:00`);d.setDate(d.getDate()+1);return d.toISOString();}
function fmt(value){return value?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(value)):'-';}

export default function Reports(){
  const {user}=useAuth(); const [data,setData]=useState({totals:{},people:[],leads:[]}); const [users,setUsers]=useState([]); const [owner,setOwner]=useState(''); const [from,setFrom]=useState(''); const [to,setTo]=useState(''); const [active,setActive]=useState('all'); const [error,setError]=useState('');
  useEffect(()=>{if(user.role==='ADMIN')api('/users').then(d=>setUsers(d.users)).catch(()=>{});},[user.role]);
  useEffect(()=>{const p=new URLSearchParams();if(owner)p.set('owner',owner);if(from)p.set('from',isoStart(from));if(to)p.set('to',isoEnd(to));api(`/reports?${p}`).then(setData).catch(e=>setError(e.message));},[owner,from,to]);
  const visible=useMemo(()=>active==='all'?data.leads:data.leads.filter(lead=>lead.events[active]),[data.leads,active]);
  function reset(){setOwner('');setFrom('');setTo('');setActive('all');}
  return <>
    <div className="page-heading"><div><span className="eyebrow">Sales intelligence</span><h1>Order Reports</h1><p>Overall and person-wise performance from quotation to dispatch.</p></div></div>
    {error&&<div className="alert error">{error}</div>}
    <div className="report-toolbar"><div><Filter size={14}/><strong>Report filters</strong></div>{user.role==='ADMIN'&&<select aria-label="Owner" value={owner} onChange={e=>setOwner(e.target.value)}><option value="">All team members</option><option value="unassigned">Unassigned</option>{users.filter(u=>u.active).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select>}<input aria-label="From date" title="From date" type="date" value={from} max={to||undefined} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>setFrom(e.target.value)}/><span>to</span><input aria-label="To date" title="To date" type="date" value={to} min={from||undefined} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>setTo(e.target.value)}/><button onClick={reset}><RotateCcw size={13}/> Reset</button></div>
    <div className="report-metrics">{metrics.map(item=>{const Icon=item.icon;return <button key={item.key} className={`report-metric ${item.tone} ${active===item.key?'active':''}`} onClick={()=>setActive(active===item.key?'all':item.key)}><span><Icon size={18}/></span><div><small>{item.label}</small><strong>{data.totals[item.key]||0}</strong><em>View clients</em></div></button>;})}</div>
    {user.role==='ADMIN'&&<section className="panel"><div className="panel-head"><div><h2>Person-wise performance</h2><p>Activity for each owner during the selected period.</p></div></div><div className="table-wrap"><table className="report-table"><thead><tr><th>Salesperson</th><th>Clients</th><th>Quotes Sent</th><th>Samples Sent</th><th>Final Orders</th><th>Orders Sent</th><th>Conversion</th></tr></thead><tbody>{data.people.map(person=><tr key={person.id||'unassigned'}><td><strong>{person.name}</strong></td><td>{person.totalClients}</td><td>{person.quote}</td><td>{person.sample}</td><td>{person.final}</td><td>{person.order}</td><td><strong>{person.quote?Math.round((person.final/person.quote)*100):0}%</strong></td></tr>)}</tbody></table></div>{!data.people.length&&<div className="empty">No activity found for this period.</div>}</section>}
    <section className="panel"><div className="panel-head"><div><h2>{active==='all'?'All activity':metrics.find(m=>m.key===active)?.label}</h2><p>{visible.length} client record{visible.length===1?'':'s'} found.</p></div>{active!=='all'&&<button className="clear-report-filter" onClick={()=>setActive('all')}>Show all</button>}</div><div className="table-wrap"><table className="report-detail-table"><thead><tr><th>Client / Company</th>{user.role==='ADMIN'&&<th>Owner</th>}<th>Order Value</th><th>Quote Sent</th><th>Sample Sent</th><th>Finalized</th><th>Order Sent</th></tr></thead><tbody>{visible.map(lead=><tr key={lead.id}><td><Link className="lead-link" to={`/leads/${lead.id}`}>{lead.contact_name}</Link><span className="cell-sub">{lead.company_name||'Individual lead'} · {lead.box_size||'No box size'} · Qty {lead.quantity||0}</span></td>{user.role==='ADMIN'&&<td>{lead.assigned_name||'Unassigned'}</td>}<td>₹{Number(lead.estimated_value||0).toLocaleString('en-IN')}</td><td className={lead.events.quote?'event-done':''}>{fmt(lead.quote_sent_at)}</td><td className={lead.events.sample?'event-done':''}>{fmt(lead.sample_sent_at)}</td><td className={lead.events.final?'event-done':''}>{fmt(lead.finalized_at)}</td><td className={lead.events.order?'event-done':''}>{fmt(lead.order_sent_at)}</td></tr>)}</tbody></table></div>{!visible.length&&<div className="empty">No matching client activity.</div>}</section>
  </>;
}
