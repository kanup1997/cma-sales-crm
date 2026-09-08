import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil, Save, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import LeadActions from '../components/LeadActions';
import StatusBadge from '../components/StatusBadge';
import { useMasterOptions } from '../hooks/useMasterOptions';
import SearchableSelect from '../components/SearchableSelect';
import {FOLLOWUP_STATUS_FALLBACK} from '../data/statusOptions';

function localInput(iso){if(!iso)return'';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function fmt(v){return v?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'-';}
function detailValues(lead){return{companyName:lead.company_name||'',phone:lead.phone||'',email:lead.email||'',city:lead.city||'',requirement:lead.requirement||'',notes:lead.notes||'',estimatedValue:lead.estimated_value??'',boxSize:lead.box_size||'',quantity:lead.quantity??'',perBoxBudget:lead.per_box_budget??'',nextFollowupAt:localInput(lead.next_followup_at),progressCodes:lead.progress_codes||[]};}

export default function LeadDetail(){
  const {id}=useParams(); const {user}=useAuth();
  const masterOptions=useMasterOptions();
  const [lead,setLead]=useState(null); const [followups,setFollowups]=useState([]); const [statuses,setStatuses]=useState([]); const [users,setUsers]=useState([]); const [error,setError]=useState('');
  const [form,setForm]=useState({type:'CALL',followupStatus:'CALL_PENDING',outcome:'',note:'',nextFollowupAt:'',status:'NEW_LEAD'});
  const [detailsForm,setDetailsForm]=useState({companyName:'',phone:'',email:'',city:'',requirement:'',notes:'',estimatedValue:'',boxSize:'',quantity:'',perBoxBudget:'',nextFollowupAt:'',progressCodes:[]});
  const [editing,setEditing]=useState(false); const [saving,setSaving]=useState(false);

  async function load(){try{const d=await api(`/leads/${id}`);setLead(d.lead);setFollowups(d.followups);setStatuses(d.statuses);setDetailsForm(detailValues(d.lead));setForm(f=>({...f,status:d.lead.status,nextFollowupAt:localInput(d.lead.next_followup_at)}));}catch(e){setError(e.message);}}
  useEffect(()=>{load();api(`/notifications/leads/${id}/read`,{method:'POST',silent:true}).then(()=>window.dispatchEvent(new Event('lead-notifications:refresh'))).catch(()=>{});if(user.role==='ADMIN')api('/users').then(d=>setUsers(d.users));},[id,user.role]);
  async function saveFollowup(e){e.preventDefault();try{await api(`/leads/${id}/followups`,{method:'POST',body:JSON.stringify({...form,nextFollowupAt:form.nextFollowupAt?new Date(form.nextFollowupAt).toISOString():null})});setForm(f=>({...f,outcome:'',note:''}));load();}catch(e){setError(e.message);}}
  async function assign(userId){await api(`/leads/${id}/assign`,{method:'PATCH',body:JSON.stringify({userId:userId||null})});load();}
  async function saveDetails(e){e.preventDefault();setSaving(true);setError('');try{await api(`/leads/${id}`,{method:'PATCH',body:JSON.stringify({...detailsForm,status:form.status,nextFollowupAt:detailsForm.nextFollowupAt?new Date(detailsForm.nextFollowupAt).toISOString():null})});await load();setEditing(false);}catch(e){setError(e.message);}finally{setSaving(false);}}
  function cancelEdit(){setDetailsForm(detailValues(lead));setEditing(false);}
  function toggleProgress(code){setDetailsForm(value=>({...value,progressCodes:value.progressCodes.includes(code)?value.progressCodes.filter(x=>x!==code):[...value.progressCodes,code]}));}
  async function quickUpdate(payload){try{setError('');await api(`/leads/${id}`,{method:'PATCH',body:JSON.stringify(payload)});await load();}catch(e){setError(e.message);}}

  if(!lead)return <div className="panel">{error||'Loading lead...'}</div>;
  return <>
    <div className="page-heading"><div><Link to="/leads" className="back-link">← Back to leads</Link><h1>{lead.contact_name}</h1><p>{lead.company_name||'Individual lead'} · {lead.city||'Location not added'}</p></div><LeadActions phone={lead.phone}/></div>
    {error&&<div className="alert error">{error}</div>}
    <div className="detail-grid">
      <section className={`panel ${editing?'inline-editing':''}`}><div className="panel-head"><h2>Lead Details</h2><div className="inline-actions">{editing?<><button className="btn btn-primary btn-sm" disabled={saving} onClick={saveDetails}><Save size={13}/>{saving?'Saving...':'Save'}</button><button className="btn btn-ghost btn-sm" onClick={cancelEdit}><X size={13}/>Cancel</button></>:<button className="edit-detail-btn" onClick={()=>setEditing(true)}><Pencil size={13}/> Edit</button>}</div></div>
        <div className="details-list editable-details">
          <div><span>Company Name</span>{editing?<input value={detailsForm.companyName} onChange={e=>setDetailsForm({...detailsForm,companyName:e.target.value})}/>:<strong>{lead.company_name||'-'}</strong>}</div>
          <div><span>Phone</span>{editing?<input value={detailsForm.phone} onChange={e=>setDetailsForm({...detailsForm,phone:e.target.value})}/>:<strong>{lead.phone||'-'}</strong>}</div>
          <div><span>Email</span>{editing?<input type="email" value={detailsForm.email} onChange={e=>setDetailsForm({...detailsForm,email:e.target.value})}/>:<strong>{lead.email||'-'}</strong>}</div>
          <div><span>Location</span>{editing?<input value={detailsForm.city} onChange={e=>setDetailsForm({...detailsForm,city:e.target.value})} placeholder="Enter city or location"/>:<strong>{lead.city||'-'}</strong>}</div>
          <div><span>Box Size</span>{editing?<input value={detailsForm.boxSize} onChange={e=>setDetailsForm({...detailsForm,boxSize:e.target.value})}/>:<strong>{lead.box_size||'-'}</strong>}</div>
          <div><span>Quantity</span>{editing?<input type="number" min="0" value={detailsForm.quantity} onChange={e=>setDetailsForm({...detailsForm,quantity:e.target.value})}/>:<strong>{lead.quantity_range||Number(lead.quantity||0).toLocaleString('en-IN')}</strong>}</div>
          <div><span>Per Box Budget</span>{editing?<input type="number" min="0" step="0.01" value={detailsForm.perBoxBudget} onChange={e=>setDetailsForm({...detailsForm,perBoxBudget:e.target.value})}/>:<strong>₹{Number(lead.per_box_budget||0).toLocaleString('en-IN')}</strong>}</div>
          <div><span>Estimated Value</span>{editing?<input type="number" min="0" value={detailsForm.estimatedValue} onChange={e=>setDetailsForm({...detailsForm,estimatedValue:e.target.value})}/>:<strong>₹{Number(lead.estimated_value||0).toLocaleString('en-IN')}</strong>}</div>
          <div><span>Next Follow-up</span>{editing?<input className="date-time-input full-click-field" type="datetime-local" value={detailsForm.nextFollowupAt} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>setDetailsForm({...detailsForm,nextFollowupAt:e.target.value})}/>:<strong>{fmt(lead.next_followup_at)}</strong>}</div>
          <div><span>Lead Status</span>{editing?<SearchableSelect clearable={false} value={form.status} onChange={status=>setForm({...form,status})} options={statuses.map(s=>({value:s,label:masterOptions.LEAD_STATUS?.find(x=>x.code===s)?.label||s.replaceAll('_',' ')}))}/>:<StatusBadge status={lead.status}/>}</div>
        </div>
        <div className="text-block editable-text"><span>Requirement</span>{editing?<textarea placeholder="Add customer requirement" value={detailsForm.requirement} onChange={e=>setDetailsForm({...detailsForm,requirement:e.target.value})}/>:<p>{lead.requirement||'No requirement added.'}</p>}</div>
        <div className="text-block editable-text"><span>Notes</span>{editing?<textarea placeholder="Add internal notes" value={detailsForm.notes} onChange={e=>setDetailsForm({...detailsForm,notes:e.target.value})}/>:<p>{lead.notes||'No notes added.'}</p>}</div>
        {user.role==='ADMIN'&&<label className="assign-field">Assigned to<select value={lead.assigned_to||''} onChange={e=>assign(e.target.value)}><option value="">Unassigned</option>{users.filter(u=>u.active).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label>}
      </section>
      <section className="panel"><h2>Add Follow-up</h2><p className="muted">Log what happened and schedule the next action.</p><form className="form-stack" onSubmit={saveFollowup}>
        <div className="form-grid compact"><label>Type<SearchableSelect clearable={false} value={form.type} onChange={value=>setForm({...form,type:value})} options={(masterOptions.FOLLOWUP_TYPE||[{code:'CALL',label:'Call'},{code:'WHATSAPP',label:'WhatsApp'},{code:'EMAIL',label:'Email'},{code:'MEETING',label:'Meeting'}]).map(x=>({value:x.code,label:x.label}))}/></label><label>Follow-up Status<SearchableSelect clearable={false} value={form.followupStatus} onChange={value=>setForm({...form,followupStatus:value})} options={(masterOptions.FOLLOWUP_STATUS?.length?masterOptions.FOLLOWUP_STATUS:FOLLOWUP_STATUS_FALLBACK).map(x=>({value:x.code,label:x.label}))}/></label></div>
        <label>Outcome<input placeholder="e.g. Interested, no answer, quote requested" value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}/></label>
        <label>Follow-up Note<textarea required placeholder="What did the customer say?" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
        <label>Next Follow-up Date & Time<input className="date-time-input" type="datetime-local" value={form.nextFollowupAt} onClick={e=>e.currentTarget.showPicker?.()} onChange={e=>setForm({...form,nextFollowupAt:e.target.value})}/></label>
        <button className="btn btn-primary">Save Follow-up</button>
      </form></section>
    </div>
    <section className="panel"><div className="panel-head"><div><h2>Follow-up History</h2><p>Complete chronological activity for this lead.</p></div></div>
      {!followups.length?<div className="empty">No follow-up has been logged yet.</div>:<div className="timeline">{followups.map(f=><div className="timeline-item" key={f.id}><div className="timeline-dot"/><div><div className="timeline-head"><strong>{f.type} · {f.outcome||'Follow-up'}</strong><span>{fmt(f.followup_at)}</span></div><p>{f.note}</p><small>By {f.user_name}{f.next_followup_at?` · Next: ${fmt(f.next_followup_at)}`:''}</small></div></div>)}</div>}
    </section>
  </>;
}
