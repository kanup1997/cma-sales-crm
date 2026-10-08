import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Upload, UserCog, CalendarClock, LogOut, Menu, X, Bell, RefreshCw, PanelLeftClose, PanelLeftOpen, ChartNoAxesCombined, CircleUserRound, ReceiptIndianRupee, Database, PlugZap, Trash2, UserX, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import {enablePushNotifications,sendPushTest,syncPushSubscription} from '../notifications';
import {openNotificationSocket} from '../realtime';

const navClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

export default function Layout() {
  const { user, logout, can } = useAuth();
  const navigate=useNavigate();const location=useLocation();
  const [open, setOpen] = useState(false);
  const [noticeOpen,setNoticeOpen]=useState(false);const [notifications,setNotifications]=useState([]);const [unreadCount,setUnreadCount]=useState(0);
  const [fetchingLeads,setFetchingLeads]=useState(false);const [fetchError,setFetchError]=useState('');
  const [pushState,setPushState]=useState('checking');const [enablingPush,setEnablingPush]=useState(false);const [testingPush,setTestingPush]=useState(false);
  const notificationRequest=useRef(null);
  const knownNotificationIds=useRef(new Set());const notificationsPrimedFor=useRef(null);const notificationBaselineReady=useRef(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

  function toggleSidebar(){setCollapsed(value=>{localStorage.setItem('sidebar-collapsed',String(!value));return !value;});}
  function loadNotifications(){
    if(notificationRequest.current)return notificationRequest.current;
    if(notificationsPrimedFor.current!==user.id){knownNotificationIds.current=new Set();notificationsPrimedFor.current=user.id;notificationBaselineReady.current=false;}
    notificationRequest.current=api('/notifications').then(data=>{
      const next=data.notifications||[];
      const incoming=notificationBaselineReady.current?next.find(item=>!item.read_at&&!knownNotificationIds.current.has(item.id)):null;
      knownNotificationIds.current=new Set(next.map(item=>item.id));
      notificationBaselineReady.current=true;
      setNotifications(next);setUnreadCount(data.unreadCount||0);
      if(incoming){
        const leadSummary=[incoming.contact_name,incoming.phone].filter(Boolean).join(' · ');
        window.dispatchEvent(new CustomEvent('app:success',{detail:{message:`New lead assigned: ${leadSummary||'Open notifications to view it.'}`}}));
      }
    }).finally(()=>{notificationRequest.current=null;});
    return notificationRequest.current;
  }
  useEffect(()=>{
    const refresh=()=>{loadNotifications().catch(()=>{});};
    refresh();
    window.addEventListener('lead-notifications:refresh',refresh);
    const socket=openNotificationSocket(notification=>{
      if(!notification?.id||knownNotificationIds.current.has(notification.id))return;
      knownNotificationIds.current.add(notification.id);
      notificationBaselineReady.current=true;
      setNotifications(items=>[notification,...items.filter(item=>Number(item.id)!==Number(notification.id))].slice(0,40));
      if(!notification.read_at)setUnreadCount(count=>count+1);
      const leadSummary=[notification.contact_name,notification.phone].filter(Boolean).join(' · ');
      window.dispatchEvent(new CustomEvent('app:success',{detail:{message:`New lead assigned: ${leadSummary||'Open notifications to view it.'}`}}));
    });
    return()=>{window.removeEventListener('lead-notifications:refresh',refresh);socket.disconnect();};
  },[user.id]);
  useEffect(()=>{
    let active=true;
    syncPushSubscription().then(result=>{if(active)setPushState(result.state);}).catch(()=>{if(active)setPushState('unavailable');});
    const onPush=()=>{loadNotifications().catch(()=>{});};
    navigator.serviceWorker?.addEventListener('message',onPush);
    return()=>{active=false;navigator.serviceWorker?.removeEventListener('message',onPush);};
  },[user.id]);
  useEffect(()=>{
    const read=event=>{
      setUnreadCount(event.detail.unreadCount);
      setNotifications(items=>items.map(item=>Number(item.lead_id)===Number(event.detail.leadId)?{...item,read_at:item.read_at||new Date().toISOString()}:item));
    };
    window.addEventListener('lead-notifications:read',read);
    return()=>window.removeEventListener('lead-notifications:read',read);
  },[]);
  async function fetchLeads(){
    if(fetchingLeads)return;
    setFetchingLeads(true);setFetchError('');
    try{await loadNotifications();}
    catch(error){setFetchError(error.message||'Unable to refresh notifications');}
    finally{
      navigate('/leads',{state:{leadsRefresh:Date.now()}});
      setFetchingLeads(false);
    }
  }
  useEffect(()=>setNoticeOpen(false),[location.pathname,location.search]);
  function openLeadNotification(notification){setNoticeOpen(false);navigate(`/leads/${notification.lead_id}`);}
  async function markAllRead(){await api('/notifications/read-all',{method:'POST',silent:true});setUnreadCount(0);setNotifications(value=>value.map(item=>({...item,read_at:item.read_at||new Date().toISOString()})));}
  async function enableDeviceNotifications(){
    setEnablingPush(true);
    try{const result=await enablePushNotifications();setPushState(result.state);if(result.state==='enabled'){await sendPushTest();window.dispatchEvent(new CustomEvent('app:success',{detail:{message:'Alerts enabled. A test notification was sent to this device.'}}));}else if(result.state==='blocked')setFetchError('Notifications are blocked in this browser. Allow them in browser settings, then try again.');}
    catch(error){setFetchError(error.message||'Unable to enable notifications on this device.');}
    finally{setEnablingPush(false);}
  }
  async function testDeviceNotifications(){
    setTestingPush(true);setFetchError('');
    try{await sendPushTest();window.dispatchEvent(new CustomEvent('app:success',{detail:{message:'Test notification sent to this device.'}}));}
    catch(error){setFetchError(error.message||'Unable to send a test notification.');}
    finally{setTestingPush(false);}
  }

  const close = () => setOpen(false);
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark">CMA</div>
          <div className="brand-copy"><strong>ChocoManualART</strong><span>Sales CRM</span></div>
          <button className="icon-btn mobile-only" onClick={close}><X size={20}/></button>
        </div>

        <nav>
          <div className="nav-label">Workspace</div>
          {can('PAGE_DASHBOARD')&&<NavLink title="Dashboard" to="/" end className={navClass} onClick={close}><LayoutDashboard size={18}/><span>Dashboard</span></NavLink>}
          {can('PAGE_LEADS')&&<NavLink title="Leads" to="/leads" className={navClass} onClick={close}><Users size={18}/><span>Leads</span></NavLink>}
          {can('PAGE_NOT_INTERESTED')&&<NavLink title="Not Interested Leads" to="/not-interested-leads" className={navClass} onClick={close}><UserX size={18}/><span>Not Interested</span></NavLink>}
          {can('PAGE_FOLLOWUPS')&&<NavLink title="Follow-ups" to="/followups" className={navClass} onClick={close}><CalendarClock size={18}/><span>Follow-ups</span></NavLink>}
          {can('PAGE_REPORTS')&&<NavLink title="Order Reports" to="/reports" className={navClass} onClick={close}><ChartNoAxesCombined size={18}/><span>Order Reports</span></NavLink>}
          {can('PAGE_DAILY_WORK')&&<NavLink title="Daily Work Report" to="/daily-work-report" className={navClass} onClick={close}><ClipboardList size={18}/><span>Daily Work</span></NavLink>}
          {can('PAGE_PURCHASE_ORDERS')&&<NavLink title="Purchase Orders" to="/purchase-orders" className={navClass} onClick={close}><ReceiptIndianRupee size={18}/><span>Purchase Orders</span></NavLink>}
          {can('PAGE_TAX_INVOICES')&&<NavLink title="Tax Invoices" to="/tax-invoices" className={navClass} onClick={close}><ReceiptIndianRupee size={18}/><span>Tax Invoices</span></NavLink>}
          <NavLink title="My Profile" to="/profile" className={navClass} onClick={close}><CircleUserRound size={18}/><span>My Profile</span></NavLink>
          {can('PAGE_IMPORT') && <NavLink title="Import Leads" to="/import" className={navClass} onClick={close}><Upload size={18}/><span>Import Leads</span></NavLink>}
          {can('PAGE_USERS') && <NavLink title="Users" to="/users" className={navClass} onClick={close}><UserCog size={18}/><span>Users</span></NavLink>}
          {can('PAGE_MASTERS') && <NavLink title="Masters" to="/masters" className={navClass} onClick={close}><Database size={18}/><span>Masters</span></NavLink>}
          {can('PAGE_INTEGRATIONS') && <NavLink title="Integrations" to="/integrations" className={navClass} onClick={close}><PlugZap size={18}/><span>Integrations</span></NavLink>}
          {can('PAGE_DATA_RESET') && <NavLink title="Data Reset" to="/data-reset" className={navClass} onClick={close}><Trash2 size={18}/><span>Data Reset</span></NavLink>}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-copy"><strong>{user.name}</strong><span>{user.role}</span></div>
          <button title="Logout" className="btn btn-ghost full" onClick={logout}><LogOut size={17}/><span>Logout</span></button>
        </div>
      </aside>

      {open && <div className="sidebar-backdrop" onClick={close}/>}      
      <main className="content-area">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setOpen(true)}><Menu size={22}/></button>
          <button className="sidebar-toggle desktop-only" onClick={toggleSidebar} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button>
          <div>
            <strong>Sales workspace</strong>
            <span>{new Intl.DateTimeFormat('en-IN', { weekday:'long', day:'numeric', month:'long' }).format(new Date())}</span>
          </div>
          <div className="topbar-actions">
            {can('PAGE_LEADS')&&<button type="button" className="btn btn-ghost btn-sm fetch-leads-btn" disabled={fetchingLeads} onClick={fetchLeads} title="Fetch latest leads and notifications"><RefreshCw size={14} className={fetchingLeads?'spin':''}/>{fetchingLeads?'Fetching...':'Fetch Lead'}</button>}
            {pushState!=='enabled'?<button type="button" className="btn btn-ghost btn-sm enable-alerts-btn" disabled={enablingPush||pushState==='unsupported'||pushState==='unavailable'} onClick={enableDeviceNotifications} title={pushState==='blocked'?'Allow notifications in browser settings, then try again.':'Enable lead alerts on this device'}>{enablingPush?'Enabling...':pushState==='blocked'?'Alerts blocked':'Enable alerts'}</button>:<button type="button" className="btn btn-ghost btn-sm enable-alerts-btn" disabled={testingPush} onClick={testDeviceNotifications} title="Send a test system notification to this device">{testingPush?'Sending...':'Test alert'}</button>}
            <button className="topbar-icon" aria-label="Notifications" aria-expanded={noticeOpen} onClick={()=>setNoticeOpen(value=>!value)}><Bell size={18}/>{unreadCount>0&&<b>{unreadCount>99?'99+':unreadCount}</b>}</button>
            {noticeOpen&&<section className="notification-popover"><header><div><strong>Notifications</strong><span>{unreadCount} new assigned lead{unreadCount===1?'':'s'}</span></div>{unreadCount>0&&<button onClick={markAllRead}>Mark all read</button>}</header>{unreadCount>0&&can('PAGE_LEADS')&&<button className="notification-summary" onClick={()=>navigate('/leads?newAssigned=1')}><Bell size={15}/><span><strong>View new assigned leads</strong><small>Open all {unreadCount} unread lead{unreadCount===1?'':'s'}</small></span></button>}<div className="notification-list">{notifications.length?notifications.map(item=><button key={item.id} className={item.read_at?'':'unread'} onClick={()=>openLeadNotification(item)}><i>{String(item.contact_name||'L').slice(0,1).toUpperCase()}</i><span><strong>{item.contact_name}</strong><small>{[item.phone,item.company_name||item.source||'New lead'].filter(Boolean).join(' · ')} · {new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at.endsWith?.('Z')?item.created_at:`${item.created_at}Z`))}</small></span></button>):<p>No lead notifications yet.</p>}</div></section>}
            <div className="user-avatar">{user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
          </div>
        </header>
        <div className="page-wrap">{fetchError&&<div className="alert error" role="alert">{fetchError}</div>}<Outlet /></div>
      </main>
    </div>
  );
}
