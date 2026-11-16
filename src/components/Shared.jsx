import { CheckCircle2, Search, X } from 'lucide-react'

export function Notice({ message = '', onClose = () => {} }) {
  if (!message) return null
  return <div className="notice-banner" role="status"><CheckCircle2 size={18} /><span>{message}</span><button aria-label="Закрити повідомлення" onClick={onClose}><X size={18} /></button></div>
}

export function Toast({ message = '', onClose = () => {} }) {
  return <div className="toast-card" role="status" aria-live="polite"><span className="toast-icon"><CheckCircle2 size={18} /></span><p>{message}</p><button className="toast-dismiss" aria-label="Закрити сповіщення" onClick={onClose}><X size={18} /></button></div>
}

export function PageIntro({ label = '', description = '' }) {
  return <div className="page-intro"><span className="eyebrow"><span className="eyebrow-dot" /> {label}</span><p>{description}</p></div>
}

export function EmptyState({ title = 'Поки що порожньо', message = '', onReset = null, resetLabel = 'Повернутися' }) {
  return <div className="empty-state"><div className="empty-icon"><Search size={23} /></div><h3>{title}</h3><p className="max-w-[460px] text-balance">{message}</p>{onReset && <button className="secondary-button" onClick={onReset}>{resetLabel}</button>}</div>
}

export function ConditionRow({ label = '', value = '', success = false, urgent = false }) {
  return <div className="condition-row"><span>{label}</span><strong className={`${success ? 'success-text' : ''} ${urgent ? 'urgent-text' : ''}`}>{value}</strong></div>
}
