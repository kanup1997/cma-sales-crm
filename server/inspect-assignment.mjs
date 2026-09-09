import {queryAll} from './src/db.js';
import {run} from './src/db.js';
await run(`INSERT OR IGNORE INTO lead_notifications(user_id,lead_id,event_key) SELECT l.assigned_to,l.id,'assignment-repair:'||l.id||':user:'||l.assigned_to FROM leads l WHERE l.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM lead_notifications n WHERE n.user_id=l.assigned_to AND n.lead_id=l.id)`);
const rows=await queryAll(`SELECT u.id,u.name,u.email,u.active,COUNT(l.id) lead_count FROM users u LEFT JOIN leads l ON l.assigned_to=u.id WHERE u.name LIKE ? GROUP BY u.id,u.name,u.email,u.active ORDER BY u.id`,['%Demo Sales%']);
console.log(JSON.stringify(rows,null,2));
console.log(JSON.stringify(await queryAll(`SELECT l.id,l.contact_name,l.status,l.assigned_to,u.name owner FROM leads l LEFT JOIN users u ON u.id=l.assigned_to ORDER BY l.id DESC`),null,2));
console.log(JSON.stringify(await queryAll('SELECT id,user_id,lead_id,read_at,event_key FROM lead_notifications ORDER BY id DESC'),null,2));
process.exit(0);
