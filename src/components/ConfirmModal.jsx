import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

export default function ConfirmModal({
  open = false,
  title = 'Підтвердіть дію',
  message = '',
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  danger = false,
  busy = false,
  onConfirm = () => {},
  onClose = () => {},
}) {
  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, busy, onClose])

  if (!open) return null

  if (typeof document === 'undefined') return null

  return createPortal(<div className="confirm-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
      <span className={`confirm-modal-icon ${danger ? 'danger' : ''}`}><AlertTriangle size={22} /></span>
      <h2 id="confirm-modal-title">{title}</h2>
      <p id="confirm-modal-message">{message}</p>
      <div className="confirm-modal-actions">
        <button type="button" className="confirm-modal-cancel" disabled={busy} onClick={onClose}>{cancelLabel}</button>
        <button type="button" className={`confirm-modal-confirm${danger ? ' danger' : ''}`} disabled={busy} onClick={onConfirm}>{busy ? 'Обробляємо…' : confirmLabel}</button>
      </div>
    </section>
  </div>, document.body)
}
