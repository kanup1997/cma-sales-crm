import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadApi } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import LeadActions from '../components/LeadActions';
import { Download, SlidersHorizontal, Trash2, RotateCcw } from 'lucide-react';
import { useMasterOptions } from '../hooks/useMasterOptions';
import SearchableSelect from '../components/SearchableSelect';
import {SortableTh,useSortedRows} from '../components/SortableTable';
import FollowupStatusBadge from '../components/FollowupStatusBadge';
import {FOLLOWUP_STATUS_FALLBACK} from '../data/statusOptions';

const defaultForm = { companyName:'', contactName:'', phone:'', email:'', city:'', source:'', status:'NEW_LEAD', requirement:'', boxSize:'', quantity:'', perBoxBudget:'', estimatedValue:'', nextFollowupAt:'' };
function toIsoLocal(v) { return v ? new Date(v).toISOString() : null; }
function fmt(v) { return v ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)) : '-'; }

export default function Leads() {
  const { user,can } = useAuth();
  const initialQuery=useMemo(()=>new URLSearchParams(window.location.search),[]);
  const masterOptions=useMasterOptions();
  const [leads, setLeads] = useState([]); const [users, setUsers] = useState([]); const [statuses, setStatuses] = useState([]);
  const [q, setQ] = useState(initialQuery.get('q')||''); const [status, setStatus] = useState(initialQuery.get('status')||''); const [followupStatus,setFollowupStatus]=useState(initialQuery.get('followupStatus')||''); const [assignedTo, setAssignedTo] = useState(initialQuery.get('assignedTo')||'');
  const [newAssigned,setNewAssigned]=useState(initialQuery.get('newAssigned')==='1');
  const [dashboardFilter,setDashboardFilter]=useState({followup:initialQuery.get('followup')||'',pipeline:initialQuery.get('pipeline')||'',start:initialQuery.get('start')||'',end:initialQuery.get('end')||'',sampleFrom:initialQuery.get('sampleFrom')||'',sampleTo:initialQuery.get('sampleTo')||''});
  const [advanced,setAdvanced]=useState({city:'',source:'',boxSize:'',minQuantity:'',maxQuantity:'',minBudget:'',maxBudget:'',followupFrom:'',followupTo:''}); const [showFilters,setShowFilters]=useState(false); const [exporting,setExporting]=useState(false);
  const [selected, setSelected] = useState([]); const [bulkUser, setBulkUser] = useState('');
  const [showAdd, setShowAdd] = useState(false); const [form, setForm] = useState(defaultForm); const [error, setError] = useState('');

  async function load() {
    const params = buildParams();
    try { const d = await api(`/leads?${params}`); setLeads(d.leads); setStatuses(d.statuses); }
    catch(e){ setError(e.message); }
  }
  useEffect(() => { const t=setTimeout(load,250); return()=>clearTimeout(t); }, [q,status,followupStatus,assignedTo,newAssigned,advanced,dashboardFilter]);
  useEffect(() => { if(user.role==='ADMIN') api('/users').then(d=>setUsers(d.users)).catch(()=>{}); },[user.role]);

  const allSelected = useMemo(() => leads.length && leads.every(l=>selected.includes(l.id)),[leads,selected]);
  const sortedLeadRows=useSortedRows(leads,'created_at','desc');const leadSort={...sortedLeadRows,rows:[...sortedLeadRows.rows].sort((a,b)=>Number(b.status==='NEW_LEAD')-Number(a.status==='NEW_LEAD'))};
  function toggleAll(){ setSelected(allSelected ? [] : leads.map(l=>l.id)); }
  function buildParams(includeFilters=true){const params=new URLSearchParams();params.set('excludeNotInterested','1');if(!includeFilters)return params;if(q)params.set('q',q);if(status)params.set('status',status);if(followupStatus)params.set('followupStatus',followupStatus);if(assignedTo)params.set('assignedTo',assignedTo);if(newAssigned)params.set('newAssigned','1');Object.entries(dashboardFilter).forEach(([key,value])=>{if(value)params.set(key,value);});Object.entries(advanced).forEach(([key,value])=>{if(!value)return;if(key==='followupFrom')params.set(key,new Date(`${value}T00:00:00`).toISOString());else if(key==='followupTo'){const d=new Date(`${value}T00:00:00`);d.setDate(d.getDate()+1);params.set(key,d.toISOString());}else params.set(key,value);});return params;}
  function resetFilters(){setQ('');setStatus('');setFollowupStatus('');setAssignedTo('');setNewAssigned(false);setDashboardFilter({followup:'',pipeline:'',start:'',end:'',sampleFrom:'',sampleTo:''});setAdvanced({city:'',source:'',boxSize:'',minQuantity:'',maxQuantity:'',minBudget:'',maxBudget:'',followupFrom:'',followupTo:''});}
  async function exportLeads(filtered){setExporting(true);setError('');try{const params=buildParams(filtered);await downloadApi(`/leads/actions/export?${params}`);}catch(e){setError(e.message);}finally{setExporting(false);}}
  async function deleteLead(lead){if(!window.confirm(`Delete ${lead.contact_name}'s lead permanently? This will also remove its follow-up history.`))return;try{await api(`/leads/${lead.id}`,{method:'DELETE'});setSelected(s=>s.filter(id=>id!==lead.id));load();}catch(e){setError(e.message);}}
  async function bulkDelete(){if(!selected.length||!window.confirm(`Delete ${selected.length} selected leads permanently?`))return;try{await api('/leads/actions/bulk-delete',{method:'POST',body:JSON.stringify({leadIds:selected})});setSelected([]);load();}catch(e){setError(e.message);}}

  async function addLead(e){ e.preventDefault(); setError(''); try { await api('/leads',{method:'POST',body:JSON.stringify({...form,nextFollowupAt:toIsoLocal(form.nextFollowupAt)})}); setForm(defaultForm); setShowAdd(false); load(); } catch(e){setError(e.message);} }
  async function bulkAssign(){ if(!selected.length) return; await api('/leads/actions/bulk-assign',{method:'POST',body:JSON.stringify({leadIds:selected,userId:bulkUser||null})}); setSelected([]); load(); }

  return <>
    <div className="page-heading"><div><h1>Leads</h1><p>{user.role==='ADMIN'?'Manage and assign every incoming lead.':'Only leads assigned to you are visible.'}</p></div><div className="inline-actions">{can('ACTION_LEADS_EXPORT')&&<><button className="btn btn-ghost" disabled={exporting} onClick={()=>exportLeads(true)}><Download size={15}/>Export filtered</button><button className="btn btn-ghost" disabled={exporting} onClick={()=>exportLeads(false)}>Export all</button></>}{can('ACTION_LEADS_CREATE')&&<button className="btn btn-primary" onClick={()=>setShowAdd(v=>!v)}>+ Add Lead</button>}</div></div>
    {error && <div className="alert error">{error}</div>}
    {showAdd && <section className="panel add-lead-panel"><div className="panel-head"><div><h2>Add New Lead</h2><p>Enter contact, order and follow-up information.</p></div></div><form className="form-grid add-lead-form" onSubmit={addLead}>
      <label>Company Name<input value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})}/></label>
      <label>Contact Name *<input required value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})}/></label>
      <label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
      <label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
      <label>Location<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Enter city or location"/></label>
      <label>Source<select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}><option value="">Select source</option>{(masterOptions.LEAD_SOURCE||[]).map(x=><option key={x.code} value={x.label}>{x.label}</option>)}</select></label>
      <label>Lead Status<SearchableSelect clearable={false} value={form.status} onChange={value=>setForm({...form,status:value})} placeholder="Select lead status" options={(masterOptions.LEAD_STATUS||[]).map(x=>({value:x.code,label:x.label}))}/></label>
      <label>Box Size<select value={form.boxSize} onChange={e=>setForm({...form,boxSize:e.target.value})}><option value="">Select box size</option>{(masterOptions.BOX_SIZE||[]).map(x=><option key={x.code} value={x.label}>{x.label}</option>)}</select></label>
      <label>Quantity<input type="number" min="0" placeholder="0" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
      <label>Per Box Budget<input type="number" min="0" step="0.01" placeholder="₹ 0" value={form.perBoxBudget} onChange={e=>setForm({...form,perBoxBudget:e.target.value})}/></label>
      <label>Estimated Value<input type="number" value={form.estimatedValue} onChange={e=>setForm({...form,estimatedValue:e.target.value})}/></label>
      <label>Next Follow-up<input className="date-time-input" type="datetime-local" value={form.nextFollowupAt} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>setForm({...form,nextFollowupAt:e.target.value})}/></label>
      <label className="span-3">Requirement<textarea value={form.requirement} onChange={e=>setForm({...form,requirement:e.target.value})}/></label>
      <div className="span-3 inline-actions form-actions"><button className="btn btn-primary">Save Lead</button><button type="button" className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button></div>
    </form></section>}

    <section className="panel">
      <div className="filters">
        <input placeholder="Search name, company, phone, requirement..." value={q} onChange={e=>setQ(e.target.value)}/>
        <SearchableSelect value={status} onChange={setStatus} placeholder="All lead statuses" options={statuses.filter(s=>s!=='NOT_INTERESTED').map(s=>({value:s,label:masterOptions.LEAD_STATUS?.find(x=>x.code===s)?.label||s.replaceAll('_',' ')}))}/>
        <SearchableSelect value={followupStatus} onChange={setFollowupStatus} placeholder="All follow-up statuses" options={(masterOptions.FOLLOWUP_STATUS?.length?masterOptions.FOLLOWUP_STATUS:FOLLOWUP_STATUS_FALLBACK).map(x=>({value:x.code,label:x.label}))}/>
        {user.role==='ADMIN' && <select value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}><option value="">All owners</option><option value="unassigned">Unassigned</option>{users.filter(u=>u.active).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select>}
      </div>
      <div className="filter-controls"><button className={`advanced-toggle ${showFilters?'active':''}`} onClick={()=>setShowFilters(v=>!v)}><SlidersHorizontal size={14}/>Advanced filters</button><span>{leads.length} results</span>{newAssigned&&<button className="applied-filter-pill" onClick={()=>setNewAssigned(false)}>New assigned leads ×</button>}{Object.values(dashboardFilter).some(Boolean)&&<span className="applied-filter-pill">Dashboard filter applied</span>}<button className="reset-lead-filters" onClick={resetFilters}><RotateCcw size={13}/>Reset all</button></div>
      {showFilters&&<div className="advanced-filters"><label>City<select value={advanced.city} onChange={e=>setAdvanced({...advanced,city:e.target.value})}><option value="">Any city</option>{(masterOptions.CITY||[]).map(x=><option key={x.code} value={x.label}>{x.label}</option>)}</select></label><label>Source<select value={advanced.source} onChange={e=>setAdvanced({...advanced,source:e.target.value})}><option value="">Any source</option>{(masterOptions.LEAD_SOURCE||[]).map(x=><option key={x.code} value={x.label}>{x.label}</option>)}</select></label><label>Box Size<select value={advanced.boxSize} onChange={e=>setAdvanced({...advanced,boxSize:e.target.value})}><option value="">Any size</option>{(masterOptions.BOX_SIZE||[]).map(x=><option key={x.code} value={x.label}>{x.label}</option>)}</select></label><label>Min Quantity<input type="number" min="0" value={advanced.minQuantity} onChange={e=>setAdvanced({...advanced,minQuantity:e.target.value})}/></label><label>Max Quantity<input type="number" min="0" value={advanced.maxQuantity} onChange={e=>setAdvanced({...advanced,maxQuantity:e.target.value})}/></label><label>Min Box Budget<input type="number" min="0" value={advanced.minBudget} onChange={e=>setAdvanced({...advanced,minBudget:e.target.value})}/></label><label>Max Box Budget<input type="number" min="0" value={advanced.maxBudget} onChange={e=>setAdvanced({...advanced,maxBudget:e.target.value})}/></label><label>Follow-up From<input type="date" value={advanced.followupFrom} max={advanced.followupTo||undefined} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>setAdvanced({...advanced,followupFrom:e.target.value})}/></label><label>Follow-up To<input type="date" value={advanced.followupTo} min={advanced.followupFrom||undefined} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>setAdvanced({...advanced,followupTo:e.target.value})}/></label></div>}
      {user.role==='ADMIN' && selected.length>0 && <div className="bulk-bar"><strong>{selected.length} selected</strong><select value={bulkUser} onChange={e=>setBulkUser(e.target.value)}><option value="">Unassign</option>{users.filter(u=>u.active).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select><button className="btn btn-primary btn-sm" onClick={bulkAssign}>Assign</button><button className="btn btn-danger btn-sm" onClick={bulkDelete}><Trash2 size={13}/>Delete</button></div>}
      <div className="table-wrap"><table className="leads-table"><thead><tr>{user.role==='ADMIN'&&<th><input type="checkbox" checked={!!allSelected} onChange={toggleAll}/></th>}<SortableTh label="Lead / Company" field="contact_name" sort={leadSort.sort} onSort={leadSort.toggle}/><SortableTh label="Contact" field="phone" sort={leadSort.sort} onSort={leadSort.toggle}/><SortableTh label="Order Details" field="quantity" sort={leadSort.sort} onSort={leadSort.toggle}/><SortableTh label="Next Follow-up" field="next_followup_at" sort={leadSort.sort} onSort={leadSort.toggle}/>{user.role==='ADMIN'&&<SortableTh label="Owner" field="assigned_name" sort={leadSort.sort} onSort={leadSort.toggle}/>}<SortableTh label="Lead Status" field="status" sort={leadSort.sort} onSort={leadSort.toggle}/><SortableTh label="Follow-up Status" field="latest_followup_status" sort={leadSort.sort} onSort={leadSort.toggle}/><th>Action</th><SortableTh label="Follow-up Note" field="latest_followup_note" sort={leadSort.sort} onSort={leadSort.toggle}/><SortableTh label="Created At" field="created_at" sort={leadSort.sort} onSort={leadSort.toggle}/><SortableTh label="Updated At" field="updated_at" sort={leadSort.sort} onSort={leadSort.toggle}/></tr></thead>
      <tbody>{leadSort.rows.map(l=><tr key={l.id}>{user.role==='ADMIN'&&<td><input type="checkbox" checked={selected.includes(l.id)} onChange={()=>setSelected(s=>s.includes(l.id)?s.filter(id=>id!==l.id):[...s,l.id])}/></td>}
        <td><Link className="lead-link" to={`/leads/${l.id}`}>{l.contact_name}</Link><span className="cell-sub">{l.company_name||'Individual lead'}</span></td>
        <td>{l.phone||l.email||'-'}<span className="cell-sub">{l.city||''}</span></td><td><strong className="order-detail">{l.box_size||'Size not set'} · Qty: {l.quantity_range||Number(l.quantity||0).toLocaleString('en-IN')}</strong><span className="cell-sub">₹{Number(l.per_box_budget||0).toLocaleString('en-IN')} per box · {l.requirement||'No requirement'}</span></td><td>{fmt(l.next_followup_at)}</td>
        {user.role==='ADMIN'&&<td>{l.assigned_name||<span className="danger-text">Unassigned</span>}</td>}<td><StatusBadge status={l.status}/></td><td><FollowupStatusBadge status={l.latest_followup_status} label={masterOptions.FOLLOWUP_STATUS?.find(x=>x.code===l.latest_followup_status)?.label}/></td><td><div className="row-actions"><LeadActions phone={l.phone} compact/>{can('ACTION_LEADS_DELETE')&&<button className="delete-lead-btn" title="Delete lead" onClick={()=>deleteLead(l)}><Trash2 size={14}/></button>}</div></td><td><span className="cell-sub" title={l.latest_followup_note||''}>{l.latest_followup_note||'-'}</span></td><td className="date-cell">{fmt(l.created_at)}</td><td className="date-cell">{fmt(l.updated_at)}</td></tr>)}</tbody></table></div>
      {!leads.length&&<div className="empty">No leads found.</div>}
    </section>
  </>;
}
