const columns = {
  contact_name: 'l.contact_name',
  phone: 'l.phone',
  quantity: 'l.quantity',
  next_followup_at: 'julianday(l.next_followup_at)',
  assigned_name: 'u.name',
  status: 'l.status',
  latest_followup_status: 'latest_followup_status',
  latest_followup_note: 'latest_followup_note',
  created_at: 'julianday(l.created_at)',
  updated_at: 'julianday(l.updated_at)'
};

export function leadOrderBy(query) {
  // Preserve the existing priority order for callers without explicit sorting.
  if (!query.sortBy) return "CASE WHEN l.status='NEW_LEAD' THEN 0 ELSE 1 END, CASE WHEN l.status='NEW_LEAD' THEN datetime(l.created_at) END DESC, CASE WHEN l.next_followup_at IS NULL THEN 1 ELSE 0 END, l.next_followup_at ASC, l.updated_at DESC, l.id DESC";
  const key = Object.hasOwn(columns, query.sortBy) ? query.sortBy : 'created_at';
  const column = columns[key];
  const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
  const numeric = key === 'quantity' || key.endsWith('_at');
  return `${column} IS NULL ASC, ${column} = '' ASC, ${column}${numeric ? '' : ' COLLATE NOCASE'} ${direction}, l.id ${direction}`;
}
