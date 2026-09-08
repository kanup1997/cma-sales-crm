import { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, BriefcaseBusiness, ShieldCheck, Save, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Profile(){
  const {user,updateProfile}=useAuth(); const [form,setForm]=useState({name:'',email:'',phone:'',designation:'',city:'',bio:'',currentPassword:'',newPassword:'',confirmPassword:''}); const [error,setError]=useState(''); const [saving,setSaving]=useState(false);
  useEffect(()=>setForm(f=>({...f,name:user.name||'',email:user.email||'',phone:user.phone||'',designation:user.designation||'',city:user.city||'',bio:user.bio||''})),[user]);
  async function submit(e){e.preventDefault();setError('');if(form.newPassword!==form.confirmPassword)return setError('New passwords do not match');setSaving(true);try{await updateProfile(form);setForm(f=>({...f,currentPassword:'',newPassword:'',confirmPassword:''}));}catch(e){setError(e.message);}finally{setSaving(false);}}
  const initials=user.name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  return <>
    <div className="page-heading"><div><span className="eyebrow">Account settings</span><h1>My Profile</h1><p>Manage your personal information and account security.</p></div></div>
    {error&&<div className="alert error">{error}</div>}
    <form className="profile-layout" onSubmit={submit}>
      <aside className="panel profile-summary"><div className="profile-avatar">{initials}</div><h2>{user.name}</h2><p>{user.designation||'Team member'}</p><span className="profile-role"><ShieldCheck size={14}/>{user.role}</span><div className="profile-meta"><span><Mail size={14}/>{user.email}</span>{user.phone&&<span><Phone size={14}/>{user.phone}</span>}{user.city&&<span><MapPin size={14}/>{user.city}</span>}</div><small>Member since {user.created_at?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(user.created_at)):'-'}</small></aside>
      <div className="profile-main">
        <section className="panel"><div className="profile-section-head"><div><h2>Personal information</h2><p>Details visible across your CRM workspace.</p></div></div><div className="profile-fields"><label><span>Full Name</span><div><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div></label><label><span>Email Address</span><div><Mail size={15}/><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div></label><label><span>Phone Number</span><div><Phone size={15}/><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div></label><label><span>Designation</span><div><BriefcaseBusiness size={15}/><input placeholder="e.g. Sales Executive" value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})}/></div></label><label><span>City</span><div><MapPin size={15}/><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></div></label><label><span>Account Role</span><div><ShieldCheck size={15}/><input value={user.role} disabled/></div></label><label className="profile-span"><span>About / Bio</span><textarea placeholder="Add a short professional introduction" value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})}/></label></div></section>
        <section className="panel"><div className="profile-section-head"><div><h2>Password & security</h2><p>Leave these fields blank if you do not want to change your password.</p></div><KeyRound size={19}/></div><div className="profile-fields security-fields"><label><span>Current Password</span><input type="password" autoComplete="current-password" value={form.currentPassword} onChange={e=>setForm({...form,currentPassword:e.target.value})}/></label><label><span>New Password</span><input type="password" minLength="6" autoComplete="new-password" value={form.newPassword} onChange={e=>setForm({...form,newPassword:e.target.value})}/></label><label><span>Confirm New Password</span><input type="password" minLength="6" autoComplete="new-password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})}/></label></div></section>
        <div className="profile-save"><button className="btn btn-primary" disabled={saving}><Save size={15}/>{saving?'Saving profile...':'Save changes'}</button></div>
      </div>
    </form>
  </>;
}
