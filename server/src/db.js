import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'cma-sales.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','SALES')),
  active INTEGER NOT NULL DEFAULT 1,
  phone TEXT,
  designation TEXT,
  city TEXT,
  bio TEXT,
  permissions_configured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT,
  contact_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  city TEXT,
  source TEXT,
  requirement TEXT,
  box_size TEXT,
  quantity INTEGER DEFAULT 0,
  quantity_range TEXT,
  per_box_budget REAL DEFAULT 0,
  finalized INTEGER NOT NULL DEFAULT 0,
  sample_sent INTEGER NOT NULL DEFAULT 0,
  order_sent INTEGER NOT NULL DEFAULT 0,
  quote_sent_at TEXT,
  finalized_at TEXT,
  sample_sent_at TEXT,
  order_sent_at TEXT,
  estimated_value REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'NEW_LEAD',
  assigned_to INTEGER,
  next_followup_at TEXT,
  last_followup_at TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'CALL',
  followup_status TEXT,
  outcome TEXT,
  note TEXT,
  followup_at TEXT NOT NULL,
  next_followup_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup_at ON leads(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_followups_lead_id ON followups(lead_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT NOT NULL UNIQUE,
  lead_id INTEGER NOT NULL,
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  place_of_supply TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  gst_rate REAL NOT NULL DEFAULT 5,
  tax_type TEXT NOT NULL DEFAULT 'IGST',
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  advance_amount REAL NOT NULL DEFAULT 0,
  pending_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS tax_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number INTEGER NOT NULL UNIQUE,
  purchase_order_id INTEGER NOT NULL UNIQUE,
  invoice_json TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS document_sequences (
  name TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL
);
INSERT OR IGNORE INTO document_sequences (name,next_value) VALUES ('invoice',10001);
INSERT OR IGNORE INTO document_sequences (name,next_value) VALUES ('purchase_order',1);
CREATE TABLE IF NOT EXISTS document_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category,code)
);
CREATE TABLE IF NOT EXISTS lead_progress (
  lead_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(lead_id,code),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lead_progress_code ON lead_progress(code);
CREATE TABLE IF NOT EXISTS sheet_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Google Ads Leads',
  sheet_url TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  gid TEXT NOT NULL DEFAULT '0',
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 5,
  default_source TEXT NOT NULL DEFAULT 'Google Ads',
  assigned_to INTEGER,
  assignment_mode TEXT NOT NULL DEFAULT 'FIXED',
  assignment_user_ids_json TEXT NOT NULL DEFAULT '[]',
  leads_per_user INTEGER NOT NULL DEFAULT 1,
  assignment_cursor INTEGER NOT NULL DEFAULT 0,
  mapping_json TEXT NOT NULL DEFAULT '{}',
  last_sync_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS sheet_imported_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_id INTEGER NOT NULL,
  row_key TEXT NOT NULL,
  row_number INTEGER,
  lead_id INTEGER,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (integration_id) REFERENCES sheet_integrations(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  UNIQUE(integration_id,row_key)
);
CREATE TABLE IF NOT EXISTS sheet_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_id INTEGER NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'MANUAL',
  status TEXT NOT NULL,
  rows_found INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (integration_id) REFERENCES sheet_integrations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sheet_imported_key ON sheet_imported_rows(integration_id,row_key);
CREATE INDEX IF NOT EXISTS idx_sheet_sync_logs_integration ON sheet_sync_logs(integration_id,created_at DESC);
CREATE TABLE IF NOT EXISTS lead_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_user ON lead_notifications(user_id,read_at,created_at DESC);
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  lead_id INTEGER,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_date ON activity_events(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id,permission),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

db.exec(schema);
const sheetIntegrationColumns=new Set(db.prepare('PRAGMA table_info(sheet_integrations)').all().map(column=>column.name));
if(!sheetIntegrationColumns.has('assignment_mode'))db.exec("ALTER TABLE sheet_integrations ADD COLUMN assignment_mode TEXT NOT NULL DEFAULT 'FIXED'");
if(!sheetIntegrationColumns.has('assignment_user_ids_json'))db.exec("ALTER TABLE sheet_integrations ADD COLUMN assignment_user_ids_json TEXT NOT NULL DEFAULT '[]'");
if(!sheetIntegrationColumns.has('leads_per_user'))db.exec("ALTER TABLE sheet_integrations ADD COLUMN leads_per_user INTEGER NOT NULL DEFAULT 1");
if(!sheetIntegrationColumns.has('assignment_cursor'))db.exec("ALTER TABLE sheet_integrations ADD COLUMN assignment_cursor INTEGER NOT NULL DEFAULT 0");
db.prepare(`INSERT INTO sheet_integrations(name,sheet_url,sheet_id,gid,enabled,interval_minutes,default_source,mapping_json)
  SELECT 'Google Ads Leads','https://docs.google.com/spreadsheets/d/1JMhUXLAp0zxmm45e_uQiYszggIsw0EEAg_leCsqRA3Q/edit?usp=sharing','1JMhUXLAp0zxmm45e_uQiYszggIsw0EEAg_leCsqRA3Q','0',1,5,'Google Ads','{}'
  WHERE NOT EXISTS(SELECT 1 FROM sheet_integrations)`).run();

const masterSeeds={
  LEAD_STATUS:[['NEW_LEAD','New Lead'],['CONTACTED','Contacted'],['REQUIREMENT_RECEIVED','Requirement Received'],['QUALIFIED','Qualified'],['NEED_SAMPLE','Need Sample'],['SAMPLE_SENT','Sample Sent'],['QUOTATION_SENT','Quotation Sent'],['NEGOTIATION','Negotiation'],['SAMPLE_DESIGN_APPROVAL','Sample / Design Approval'],['ORDER_CONFIRMED','Order Confirmed'],['PAYMENT_PENDING','Payment Pending'],['PAYMENT_RECEIVED','Payment Received'],['IN_PRODUCTION','In Production'],['READY_FOR_DISPATCH','Ready for Dispatch'],['DISPATCHED','Dispatched'],['DELIVERED','Delivered'],['NOT_INTERESTED','Not Interested'],['CLOSED_WON','Closed Won'],['CLOSED_LOST','Closed Lost']],
  LEAD_PROGRESS:[['NEED_SAMPLE','Need Sample'],['SAMPLE_SENT','Sample Sent'],['FINAL_QUOTE_SENT','Final Quote Sent'],['ORDER_FINAL','Order Final']],
  FOLLOWUP_TYPE:[['CALL','Call'],['WHATSAPP','WhatsApp'],['EMAIL','Email'],['MEETING','Meeting']],
  FOLLOWUP_STATUS:[['CALL_PENDING','Call Pending'],['WHATSAPP_PENDING','WhatsApp Pending'],['EMAIL_PENDING','Email Pending'],['NO_RESPONSE','No Response'],['CALL_BACK_LATER','Call Back Later'],['CALLBACK_SCHEDULED','Callback Scheduled'],['CATALOGUE_SHARED','Catalogue Shared'],['REQUIREMENT_AWAITED','Requirement Awaited'],['QUOTATION_PENDING','Quotation Pending'],['QUOTATION_FOLLOW_UP','Quotation Follow-up'],['INTERNAL_APPROVAL_PENDING','Internal Approval Pending'],['BUDGET_DISCUSSION','Budget Discussion'],['PRICE_NEGOTIATION','Price Negotiation'],['SAMPLE_FOLLOW_UP','Sample Follow-up'],['DESIGN_AWAITED','Design Awaited'],['DESIGN_APPROVAL_PENDING','Design Approval Pending'],['PO_AWAITED','PO Awaited'],['PAYMENT_FOLLOW_UP','Payment Follow-up'],['ON_HOLD','On Hold'],['NOT_INTERESTED','Not Interested'],['FOLLOW_UP_COMPLETED','Follow-up Completed']],
  LEAD_SOURCE:[['WEBSITE','Website'],['WHATSAPP','WhatsApp'],['REFERRAL','Referral'],['INSTAGRAM','Instagram'],['EXCEL_IMPORT','Excel Import'],['GOOGLE_ADS','Google Ads'],['MANUAL_PO','Manual PO']],
  CITY:[['DELHI','Delhi'],['NOIDA','Noida'],['GURUGRAM','Gurugram']],
  BOX_SIZE:[['6_PCS','6 pcs'],['12_PCS','12 pcs'],['24_PCS','24 pcs']],
  HSN_CODE:[['18069010','1806.90.10']],
  GST_RATE:[['5','5%'],['12','12%'],['18','18%']],
  TAX_TYPE:[['IGST','IGST'],['CGST_SGST','CGST + SGST']]
};
const seedMaster=db.prepare('INSERT OR IGNORE INTO masters(category,code,label,sort_order) VALUES(?,?,?,?)');
Object.entries(masterSeeds).forEach(([category,items])=>items.forEach(([code,label],index)=>seedMaster.run(category,code,label,index)));
db.exec(`
  INSERT OR IGNORE INTO lead_progress(lead_id,code) SELECT id,'ORDER_FINAL' FROM leads WHERE finalized=1;
  INSERT OR IGNORE INTO lead_progress(lead_id,code) SELECT id,'SAMPLE_SENT' FROM leads WHERE sample_sent=1;
  INSERT OR IGNORE INTO lead_progress(lead_id,code) SELECT id,'FINAL_QUOTE_SENT' FROM leads WHERE order_sent=1;
  DELETE FROM lead_progress WHERE code IN ('FINALIZED','ORDER_SENT');
  UPDATE masters SET active=0 WHERE category='LEAD_PROGRESS' AND code IN ('FINALIZED','ORDER_SENT');
  UPDATE leads SET status='NEED_SAMPLE' WHERE id IN (SELECT lead_id FROM lead_progress WHERE code='NEED_SAMPLE') AND status IN ('NEW_LEAD','CONTACTED','REQUIREMENT_RECEIVED','QUALIFIED');
  UPDATE leads SET status='SAMPLE_SENT' WHERE id IN (SELECT lead_id FROM lead_progress WHERE code='SAMPLE_SENT') AND status NOT IN ('ORDER_CONFIRMED','PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','CLOSED_WON');
  UPDATE leads SET status='QUOTATION_SENT' WHERE id IN (SELECT lead_id FROM lead_progress WHERE code='FINAL_QUOTE_SENT') AND status NOT IN ('ORDER_CONFIRMED','PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','CLOSED_WON');
  UPDATE leads SET status='ORDER_CONFIRMED' WHERE id IN (SELECT lead_id FROM lead_progress WHERE code='ORDER_FINAL') AND status NOT IN ('PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','CLOSED_WON');
  UPDATE masters SET active=0 WHERE category='LEAD_PROGRESS';
`);

const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
[['phone','TEXT'],['designation','TEXT'],['city','TEXT'],['bio','TEXT'],['permissions_configured','INTEGER NOT NULL DEFAULT 0']].forEach(([name,definition])=>{
  if(!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
});
const followupColumns = new Set(db.prepare('PRAGMA table_info(followups)').all().map(column => column.name));
if (!followupColumns.has('followup_status')) db.exec('ALTER TABLE followups ADD COLUMN followup_status TEXT');

// Keep existing installations compatible as new lead fields are introduced.
const leadColumns = new Set(db.prepare('PRAGMA table_info(leads)').all().map(column => column.name));
const leadMigrations = [
  ['box_size', 'TEXT'],
  ['quantity', 'INTEGER DEFAULT 0'],
  ['quantity_range', 'TEXT'],
  ['per_box_budget', 'REAL DEFAULT 0'],
  ['finalized', 'INTEGER NOT NULL DEFAULT 0'],
  ['sample_sent', 'INTEGER NOT NULL DEFAULT 0'],
  ['order_sent', 'INTEGER NOT NULL DEFAULT 0'],
  ['quote_sent_at', 'TEXT'],
  ['finalized_at', 'TEXT'],
  ['sample_sent_at', 'TEXT'],
  ['order_sent_at', 'TEXT']
];
leadMigrations.forEach(([name, definition]) => {
  if (!leadColumns.has(name)) db.exec(`ALTER TABLE leads ADD COLUMN ${name} ${definition}`);
});
const syncLogColumns = new Set(db.prepare('PRAGMA table_info(sheet_sync_logs)').all().map(column => column.name));
if (!syncLogColumns.has('updated_count')) db.exec('ALTER TABLE sheet_sync_logs ADD COLUMN updated_count INTEGER NOT NULL DEFAULT 0');
const poColumns=new Set(db.prepare('PRAGMA table_info(purchase_orders)').all().map(column=>column.name));
if(!poColumns.has('manual_invoice'))db.exec('ALTER TABLE purchase_orders ADD COLUMN manual_invoice INTEGER NOT NULL DEFAULT 0');
const maxPo=db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(po_number,4) AS INTEGER)),0)+1 next FROM purchase_orders WHERE po_number LIKE 'PO-%'").get().next;
db.prepare("UPDATE document_sequences SET next_value=MAX(next_value,?) WHERE name='purchase_order'").run(maxPo);
db.exec(`
  UPDATE leads SET status='NEW_LEAD' WHERE status='NEW';
  UPDATE leads SET status='QUALIFIED' WHERE status IN ('INTERESTED','FOLLOW_UP');
  UPDATE leads SET status='QUOTATION_SENT' WHERE status='QUOTE_SENT';
  UPDATE leads SET status='CLOSED_WON' WHERE status='WON';
  UPDATE leads SET status='CLOSED_LOST' WHERE status='LOST';
  UPDATE leads SET status='CONTACTED' WHERE status='NOT_REACHABLE';
  UPDATE masters SET active=0 WHERE category='LEAD_STATUS' AND code IN ('NEW','FOLLOW_UP','INTERESTED','QUOTE_SENT','WON','LOST','NOT_REACHABLE');
  UPDATE leads SET quote_sent_at = COALESCE(quote_sent_at, updated_at) WHERE status = 'QUOTATION_SENT';
  UPDATE leads SET finalized_at = COALESCE(finalized_at, updated_at) WHERE finalized = 1;
  UPDATE leads SET sample_sent_at = COALESCE(sample_sent_at, updated_at) WHERE sample_sent = 1;
  UPDATE leads SET order_sent_at = COALESCE(order_sent_at, updated_at) WHERE order_sent = 1;
`);

function seedUser({ name, email, password, role }) {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return;
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run(name, email, passwordHash, role);
}

seedUser({
  name: 'CMA Admin',
  email: 'admin@chocomanualart.com',
  password: 'Admin@123',
  role: 'ADMIN'
});

seedUser({
  name: 'Demo Sales',
  email: 'sales@chocomanualart.com',
  password: 'Sales@123',
  role: 'SALES'
});

const defaultPermissions=['PAGE_DASHBOARD','PAGE_LEADS','PAGE_FOLLOWUPS','PAGE_REPORTS','PAGE_ORDERS','SECTION_DASHBOARD_REVENUE','SECTION_DASHBOARD_FOLLOWUPS','ACTION_LEADS_CREATE','ACTION_LEADS_EDIT','ACTION_LEADS_EXPORT','ACTION_FOLLOWUPS_MANAGE','ACTION_ORDERS_CREATE','ACTION_ORDERS_DOWNLOAD','ACTION_ORDERS_INVOICE'];
const seedPermission=db.prepare('INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)');
db.prepare("SELECT id FROM users WHERE role='SALES' AND permissions_configured=0").all().forEach(user=>{defaultPermissions.forEach(permission=>seedPermission.run(user.id,permission));db.prepare('UPDATE users SET permissions_configured=1 WHERE id=?').run(user.id);});

export default db;
