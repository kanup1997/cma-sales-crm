export const performanceIndexes=[
  // Latest follow-up lookups run for every lead in the list.
  'CREATE INDEX IF NOT EXISTS idx_followups_latest ON followups(lead_id,followup_at DESC,id DESC)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_latest ON lead_notifications(user_id,created_at DESC,id DESC)',
  'CREATE INDEX IF NOT EXISTS idx_orders_created_time ON purchase_orders(datetime(created_at))',
  'CREATE INDEX IF NOT EXISTS idx_invoices_created_time ON tax_invoices(datetime(created_at))',
  'CREATE INDEX IF NOT EXISTS idx_activity_created_time ON activity_events(datetime(created_at),id DESC)'
];
