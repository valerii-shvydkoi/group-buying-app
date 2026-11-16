import { safeNumber } from './calculations.js'

const EARNING_STATUSES = new Set(['Точка видачі', 'Отримано', 'Завершено', 'pickup', 'received'])

function normalizedEmail(value) {
  return String(value || '').trim().toLocaleLowerCase('uk-UA')
}

export function calculateCourierEarnings(purchases, courierId) {
  if (!Array.isArray(purchases) || !courierId) return 0
  return purchases.reduce((total, purchase) => {
    if (purchase?.courierId !== courierId || !EARNING_STATUSES.has(purchase.status)) return total
    return total + Math.max(0, safeNumber(purchase.deliveryTotal ?? purchase.delivery))
  }, 0)
}

export function calculateConfirmedCourierPayouts(payouts) {
  if (!Array.isArray(payouts)) return 0
  return payouts.reduce((total, payout) => {
    if (payout?.status && payout.status !== 'Виплачено') return total
    const amount = safeNumber(payout?.amount)
    return total + Math.max(0, Math.round(amount))
  }, 0)
}

export function calculateCourierAvailableBalance(purchases, courierId, payouts) {
  return Math.max(0, calculateCourierEarnings(purchases, courierId) - calculateConfirmedCourierPayouts(payouts))
}

/** Pure finance calculation shared by the service and its unit tests. */
export function calculateCourierFinanceSummary(purchases, user, payouts = [], includeUnassignedDelivered = false) {
  const courierId = String(user?.id || '')
  const courierEmail = normalizedEmail(user?.email)
  const delivered = Array.isArray(purchases) ? purchases.filter((purchase) => {
    if (!EARNING_STATUSES.has(purchase?.status)) return false
    const assignedId = String(purchase?.courierId || '')
    const assignedEmail = normalizedEmail(purchase?.courierEmail)
    if (courierId && assignedId === courierId) return true
    if (courierEmail && assignedEmail === courierEmail) return true
    return includeUnassignedDelivered && !assignedId && !assignedEmail
  }) : []
  const totalEarned = delivered.reduce((total, purchase) => (
    total + Math.max(0, safeNumber(purchase.deliveryCost ?? purchase.deliveryTotal ?? purchase.delivery))
  ), 0)
  const userPayouts = Array.isArray(payouts) ? payouts.filter((payout) => {
    const ownerId = String(payout?.userId || payout?.courierId || payout?.courier_id || '')
    return !ownerId || !courierId || ownerId === courierId
  }) : []
  const totalWithdrawn = calculateConfirmedCourierPayouts(userPayouts)
  return {
    totalEarned,
    totalWithdrawn,
    availableBalance: Math.max(0, totalEarned - totalWithdrawn),
  }
}
