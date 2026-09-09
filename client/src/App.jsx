import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import FollowUps from './pages/FollowUps';
import ImportLeads from './pages/ImportLeads';
import Users from './pages/Users';
import ToastViewport from './components/ToastViewport';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Orders from './pages/Orders';
import Invoice from './pages/Invoice';
import PurchaseOrder from './pages/PurchaseOrder';
import Masters from './pages/Masters';
import Integrations from './pages/Integrations';
import Invoices from './pages/Invoices';
import DataReset from './pages/DataReset';
import NotInterestedLeads from './pages/NotInterestedLeads';
import DailyWorkReport from './pages/DailyWorkReport';
import GlobalLoader from './components/GlobalLoader';

export default function App(){return <BrowserRouter><AuthProvider><ToastViewport/><GlobalLoader/><Routes>
  <Route path="/login" element={<Login/>}/>
  <Route element={<ProtectedRoute><Layout/></ProtectedRoute>}>
    <Route index element={<ProtectedRoute permission="PAGE_DASHBOARD"><Dashboard/></ProtectedRoute>}/>
    <Route path="leads" element={<ProtectedRoute permission="PAGE_LEADS"><Leads/></ProtectedRoute>}/>
    <Route path="leads/:id" element={<ProtectedRoute permission="PAGE_LEADS"><LeadDetail/></ProtectedRoute>}/>
    <Route path="not-interested-leads" element={<ProtectedRoute permission="PAGE_NOT_INTERESTED"><NotInterestedLeads/></ProtectedRoute>}/>
    <Route path="followups" element={<ProtectedRoute permission="PAGE_FOLLOWUPS"><FollowUps/></ProtectedRoute>}/>
    <Route path="reports" element={<ProtectedRoute permission="PAGE_REPORTS"><Reports/></ProtectedRoute>}/>
    <Route path="daily-work-report" element={<ProtectedRoute permission="PAGE_DAILY_WORK"><DailyWorkReport/></ProtectedRoute>}/>
    <Route path="profile" element={<Profile/>}/>
    <Route path="orders" element={<ProtectedRoute permission="PAGE_PURCHASE_ORDERS"><Orders/></ProtectedRoute>}/>
    <Route path="purchase-orders" element={<ProtectedRoute permission="PAGE_PURCHASE_ORDERS"><Orders/></ProtectedRoute>}/>
    <Route path="tax-invoices" element={<ProtectedRoute permission="PAGE_TAX_INVOICES"><Invoices/></ProtectedRoute>}/>
    <Route path="purchase-orders/:id" element={<ProtectedRoute permission="PAGE_PURCHASE_ORDERS"><PurchaseOrder/></ProtectedRoute>}/>
    <Route path="invoices/:id" element={<ProtectedRoute permission="PAGE_TAX_INVOICES"><Invoice/></ProtectedRoute>}/>
    <Route path="import" element={<ProtectedRoute permission="PAGE_IMPORT"><ImportLeads/></ProtectedRoute>}/>
    <Route path="users" element={<ProtectedRoute permission="PAGE_USERS"><Users/></ProtectedRoute>}/>
    <Route path="masters" element={<ProtectedRoute permission="PAGE_MASTERS"><Masters/></ProtectedRoute>}/>
    <Route path="integrations" element={<ProtectedRoute permission="PAGE_INTEGRATIONS"><Integrations/></ProtectedRoute>}/>
    <Route path="data-reset" element={<ProtectedRoute permission="PAGE_DATA_RESET"><DataReset/></ProtectedRoute>}/>
  </Route>
</Routes></AuthProvider></BrowserRouter>}
