export default function StatusBadge({ status }) {
  return <span className={`status-badge status-${String(status || '').toLowerCase()}`}>{String(status || '').replaceAll('_',' ')}</span>;
}
