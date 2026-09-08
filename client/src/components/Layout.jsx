import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Upload, UserCog, CalendarClock, LogOut, Menu, X, Bell, PanelLeftClose, PanelLeftOpen, ChartNoAxesCombined, CircleUserRound, ReceiptIndianRupee, Database, PlugZap, Trash2, UserX, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const navClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

export default function Layout() {
  const { user, logout, can } = useAuth();
  const navigate=useNavigate();const location=useLocation();
  const [open, setOpen] = useState(false);
  const [noticeOpen,setNoticeOpen]=useState(false);const [notifications,setNotifications]=useState([]);const [unreadCount,setUnreadCount]=useState(0);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

  function toggleSidebar(){setCollapsed(value=>{localStorage.setItem('sidebar-collapsed',String(!value));return !value;});}
  async function loadNotifications(){try{const data=await api('/notifications');setNotifications(data.notifications||[]);setUnreadCount(data.unreadCount||0);}catch{}}
  useEffect(()=>{loadNotifications();const timer=setInterval(loadNotifications,30000);const refresh=()=>loadNotifications();window.addEventListener('lead-notifications:refresh',refresh);return()=>{clearInterval(timer);window.removeEventListener('lead-notifications:refresh',refresh);};},[user.id]);
  useEffect(()=>setNoticeOpen(false),[location.pathname,location.search]);
  async function openLeadNotification(notification){await api(`/notifications/leads/${notification.lead_id}/read`,{method:'POST',silent:true});setUnreadCount(value=>Math.max(0,value-(!notification.read_at?1:0)));navigate(`/leads/${notification.lead_id}`);}
  async function markAllRead(){await api('/notifications/read-all',{method:'POST',silent:true});setUnreadCount(0);setNotifications(value=>value.map(item=>({...item,read_at:item.read_at||new Date().toISOString()})));}

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
          {can('PAGE_LEADS')&&<NavLink title="Not Interested Leads" to="/not-interested-leads" className={navClass} onClick={close}><UserX size={18}/><span>Not Interested</span></NavLink>}
          {can('PAGE_FOLLOWUPS')&&<NavLink title="Follow-ups" to="/followups" className={navClass} onClick={close}><CalendarClock size={18}/><span>Follow-ups</span></NavLink>}
          {can('PAGE_REPORTS')&&<NavLink title="Order Reports" to="/reports" className={navClass} onClick={close}><ChartNoAxesCombined size={18}/><span>Order Reports</span></NavLink>}
          {can('PAGE_REPORTS')&&<NavLink title="Daily Work Report" to="/daily-work-report" className={navClass} onClick={close}><ClipboardList size={18}/><span>Daily Work</span></NavLink>}
          {can('PAGE_ORDERS')&&<NavLink title="Purchase Orders" to="/purchase-orders" className={navClass} onClick={close}><ReceiptIndianRupee size={18}/><span>Purchase Orders</span></NavLink>}
          {can('PAGE_ORDERS')&&<NavLink title="Tax Invoices" to="/tax-invoices" className={navClass} onClick={close}><ReceiptIndianRupee size={18}/><span>Tax Invoices</span></NavLink>}
          <NavLink title="My Profile" to="/profile" className={navClass} onClick={close}><CircleUserRound size={18}/><span>My Profile</span></NavLink>
          {user.role === 'ADMIN' && <NavLink title="Import Leads" to="/import" className={navClass} onClick={close}><Upload size={18}/><span>Import Leads</span></NavLink>}
          {user.role === 'ADMIN' && <NavLink title="Users" to="/users" className={navClass} onClick={close}><UserCog size={18}/><span>Users</span></NavLink>}
          {user.role === 'ADMIN' && <NavLink title="Masters" to="/masters" className={navClass} onClick={close}><Database size={18}/><span>Masters</span></NavLink>}
          {user.role === 'ADMIN' && <NavLink title="Integrations" to="/integrations" className={navClass} onClick={close}><PlugZap size={18}/><span>Integrations</span></NavLink>}
          {user.role === 'ADMIN' && <NavLink title="Data Reset" to="/data-reset" className={navClass} onClick={close}><Trash2 size={18}/><span>Data Reset</span></NavLink>}
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
            <button className="topbar-icon" aria-label="Notifications" aria-expanded={noticeOpen} onClick={()=>setNoticeOpen(value=>!value)}><Bell size={18}/>{unreadCount>0&&<b>{unreadCount>99?'99+':unreadCount}</b>}</button>
            {noticeOpen&&<section className="notification-popover"><header><div><strong>Notifications</strong><span>{unreadCount} new assigned lead{unreadCount===1?'':'s'}</span></div>{unreadCount>0&&<button onClick={markAllRead}>Mark all read</button>}</header>{unreadCount>0&&can('PAGE_LEADS')&&<button className="notification-summary" onClick={()=>navigate('/leads?newAssigned=1')}><Bell size={15}/><span><strong>View new assigned leads</strong><small>Open all {unreadCount} unread lead{unreadCount===1?'':'s'}</small></span></button>}<div className="notification-list">{notifications.length?notifications.map(item=><button key={item.id} className={item.read_at?'':'unread'} onClick={()=>openLeadNotification(item)}><i>{String(item.contact_name||'L').slice(0,1).toUpperCase()}</i><span><strong>{item.contact_name}</strong><small>{item.company_name||item.source||'New lead'} · {new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at.endsWith?.('Z')?item.created_at:`${item.created_at}Z`))}</small></span></button>):<p>No lead notifications yet.</p>}</div></section>}
            <div className="user-avatar">{user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
          </div>
        </header>
        <div className="page-wrap"><Outlet /></div>
      </main>
    </div>
  );
}
