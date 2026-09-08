export default function StatCard({ label, value, hint, icon: Icon, tone = 'neutral' }) {
  return <div className={`stat-card stat-${tone}`}>
    <div className="stat-top">
      <span>{label}</span>
      {Icon && <div className="stat-icon"><Icon size={17}/></div>}
    </div>
    <strong>{value ?? 0}</strong>
    <small>{hint || 'Current overview'}</small>
  </div>;
}
