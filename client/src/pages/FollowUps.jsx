import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import LeadActions from '../components/LeadActions';
import { CalendarDays, CalendarCheck, CircleAlert, CalendarRange, Filter, RotateCcw } from 'lucide-react';

function bounds(){const s=new Date();s.setHours(0,0,0,0);const e=new Date(s);e.setDate(e.getDate()+1);return{start:s.toISOString(),end:e.toISOString()};}
function fmt(v){return v?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'-';}
function inputDate(date=new Date()){const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,10);}
function rangeBounds(from,to){const s=new Date(`${from}T00:00:00`);const e=new Date(`${to||from}T00:00:00`);e.setDate(e.getDate()+1);return{start:s.toISOString(),end:e.toISOString()};}
export default function FollowUps(){
  const {user}=useAuth(); const today=inputDate(); const [tab,setTab]=useState('today'); const [leads,setLeads]=useState([]); const [allLeads,setAllLeads]=useState([]); const [users,setUsers]=useState([]); const [owner,setOwner]=useState(''); const [from,setFrom]=useState(today); const [to,setTo]=useState(today); const [error,setError]=useState('');
  useEffect(()=>{if(user.role==='ADMIN')api('/users').then(d=>setUsers(d.users)).catch(()=>{});},[user.role]);
  useEffect(()=>{const p=new URLSearchParams();if(owner)p.set('assignedTo',owner);api(`/leads?${p}`).then(d=>setAllLeads(d.leads)).catch(e=>setError(e.message));},[owner]);
  useEffect(()=>{const dates=tab==='range'?rangeBounds(from,to):bounds();const p=new URLSearchParams({followup:tab,start:dates.start,end:dates.end});if(owner)p.set('assignedTo',owner);setError('');api(`/leads?${p}`).then(d=>setLeads(d.leads)).catch(e=>setError(e.message));},[tab,owner,from,to]);
  const counts=useMemo(()=>{const {start,end}=bounds();const s=new Date(start),e=new Date(end);const active=allLeads.filter(l=>l.next_followup_at&&!['CLOSED_WON','CLOSED_LOST'].includes(l.status));return{total:active.length,today:active.filter(l=>new Date(l.next_followup_at)>=s&&new Date(l.next_followup_at)<e).length,overdue:active.filter(l=>new Date(l.next_followup_at)<s).length,upcoming:active.filter(l=>new Date(l.next_followup_at)>=e).length};},[allLeads]);
  function reset(){setOwner('');setFrom(today);setTo(today);setTab('today');}
  return <><div className="page-heading"><div><span className="eyebrow">Activity planner</span><h1>Follow-ups</h1><p>Track pending conversations by date and team member.</p></div></div>{error&&<div className="alert error">{error}</div>}
  <div className="followup-stats">
    <button className={tab==='all'?'active':''} onClick={()=>setTab('all')}><span className="followup-stat-icon"><CalendarDays size={17}/></span><span><small>Total scheduled</small><strong>{counts.total}</strong></span></button>
    <button className={tab==='today'?'active':''} onClick={()=>setTab('today')}><span className="followup-stat-icon today"><CalendarCheck size={17}/></span><span><small>Due today</small><strong>{counts.today}</strong></span></button>
    <button className={tab==='overdue'?'active':''} onClick={()=>setTab('overdue')}><span className="followup-stat-icon overdue"><CircleAlert size={17}/></span><span><small>Overdue</small><strong>{counts.overdue}</strong></span></button>
    <button className={tab==='upcoming'?'active':''} onClick={()=>setTab('upcoming')}><span className="followup-stat-icon upcoming"><CalendarRange size={17}/></span><span><small>Upcoming</small><strong>{counts.upcoming}</strong></span></button>
  </div>
  <section className="panel followup-panel">
  <div className="followup-list-head"><div><h2>{tab==='range'?`${new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(`${from}T00:00:00`))} – ${new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(`${to}T00:00:00`))}`:`${tab[0].toUpperCase()+tab.slice(1)} follow-ups`}</h2><p>{leads.length} record{leads.length===1?'':'s'} found{owner&&user.role==='ADMIN'?' for selected owner':''}</p></div><div className="followup-filterbar"><Filter size={14}/>{user.role==='ADMIN'&&<select aria-label="Filter by owner" title="Owner" value={owner} onChange={e=>setOwner(e.target.value)}><option value="">All owners</option><option value="unassigned">Unassigned</option>{users.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}<input aria-label="From date" title="From date" type="date" value={from} max={to} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>{setFrom(e.target.value);setTab('range');}}/><span className="date-separator">to</span><input aria-label="To date" title="To date" type="date" value={to} min={from} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>{setTo(e.target.value);setTab('range');}}/><button title="Reset filters" className="compact-reset" onClick={reset}><RotateCcw size={13}/></button></div></div>
  <div className="followup-cards">{leads.map(l=><article className="follow-card" key={l.id}><div><span className="follow-time">{fmt(l.next_followup_at)}</span><Link to={`/leads/${l.id}`}><h3>{l.contact_name}</h3></Link><p>{l.company_name||l.requirement||'No company/requirement added'}</p>{user.role==='ADMIN'&&<small>Owner: {l.assigned_name||'Unassigned'}</small>}</div><div className="follow-card-actions"><StatusBadge status={l.status}/><LeadActions phone={l.phone} compact/><Link className="btn btn-ghost btn-sm" to={`/leads/${l.id}`}>Open</Link></div></article>)}</div>
  {!leads.length&&<div className="empty">No {tab} follow-ups.</div>}</section></>;
}
