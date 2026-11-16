export const PURCHASE_TIMER_OPTIONS = [
  { label: '30 секунд', seconds: 30 },
  { label: '3 години', seconds: 3 * 60 * 60 },
  { label: '1 день', seconds: 24 * 60 * 60 },
  { label: '3 дні', seconds: 3 * 24 * 60 * 60 },
  { label: '7 днів', seconds: 7 * 24 * 60 * 60 },
  { label: '14 днів', seconds: 14 * 24 * 60 * 60 },
]

export function parseRemainingSeconds(value = '') {
  const text = String(value)
  const dayValue = Number(text.match(/(\d+)\s*д/i)?.[1] || 0)
  const clock = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!clock && dayValue === 0) return 0
  const hours = Number(clock?.[1] || 0)
  const minutes = Number(clock?.[2] || 0)
  const seconds = Number(clock?.[3] || 0)
  return Math.max(1, dayValue * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60 + seconds)
}

export function remainingSeconds(deadlineAt, now = Date.now()) {
  const deadline = Number(deadlineAt)
  if (!Number.isFinite(deadline) || deadline <= 0) return 0
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

export function purchaseRemainingSeconds(purchase = {}, now = Date.now()) {
  const deadline = purchase.expiresAt ?? purchase.deadlineAt
  if (Number.isFinite(Number(deadline)) && Number(deadline) > 0) {
    return remainingSeconds(deadline, now)
  }
  return parseRemainingSeconds(purchase.timeLeft)
}

export function formatCountdown(value = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
  return days > 0 ? `${days} д ${clock}` : clock
}

export function formatCountdownHours(value = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatTimerDuration(seconds) {
  return PURCHASE_TIMER_OPTIONS.find((option) => option.seconds === Number(seconds))?.label || '—'
}
