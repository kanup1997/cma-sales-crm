import db from './db.js';

export const PERMISSIONS=['PAGE_DASHBOARD','PAGE_LEADS','PAGE_FOLLOWUPS','PAGE_REPORTS','PAGE_ORDERS','SECTION_DASHBOARD_REVENUE','SECTION_DASHBOARD_FOLLOWUPS','ACTION_LEADS_CREATE','ACTION_LEADS_EDIT','ACTION_LEADS_DELETE','ACTION_LEADS_EXPORT','ACTION_FOLLOWUPS_MANAGE','ACTION_ORDERS_CREATE','ACTION_ORDERS_DOWNLOAD','ACTION_ORDERS_INVOICE','SECTION_REPORTS_TEAM'];
export const SALES_DEFAULTS=['PAGE_DASHBOARD','PAGE_LEADS','PAGE_FOLLOWUPS','PAGE_REPORTS','PAGE_ORDERS','SECTION_DASHBOARD_REVENUE','SECTION_DASHBOARD_FOLLOWUPS','ACTION_LEADS_CREATE','ACTION_LEADS_EDIT','ACTION_LEADS_EXPORT','ACTION_FOLLOWUPS_MANAGE','ACTION_ORDERS_CREATE','ACTION_ORDERS_DOWNLOAD','ACTION_ORDERS_INVOICE'];
export function permissionsFor(user){return user.role==='ADMIN'?[...PERMISSIONS]:db.prepare('SELECT permission FROM user_permissions WHERE user_id=?').all(user.id).map(row=>row.permission);}
export function hasPermission(user,permission){return user?.role==='ADMIN'||permissionsFor(user).includes(permission);}
export function requirePermission(permission){return(req,res,next)=>hasPermission(req.user,permission)?next():res.status(403).json({message:'You do not have permission to access this feature'});}
