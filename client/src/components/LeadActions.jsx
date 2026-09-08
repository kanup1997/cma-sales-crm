import { Phone, MessageCircle } from 'lucide-react';

function digits(phone = '') {
  let d = String(phone).replace(/\D/g, '');
  if(d.length===11&&d.startsWith('0'))d=d.slice(1);
  if (d.length === 10) return `91${d}`;
  return d;
}

export default function LeadActions({ phone, compact = false }) {
  if (!phone) return <span className="muted">No phone</span>;
  return <div className="inline-actions">
    <a className={`btn btn-primary ${compact ? 'btn-sm' : ''}`} href={`tel:+${digits(phone)}`}><Phone size={16}/> Call</a>
    <a className={`btn btn-secondary ${compact ? 'btn-sm' : ''}`} href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/> WhatsApp</a>
  </div>;
}
