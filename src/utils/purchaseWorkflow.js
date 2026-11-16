const COLLECTION_STATUS = 'Збір учасників'

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function normalizeQuantity(value, maximum = 100) {
  const parsed = Number(value)
  const integer = Number.isFinite(parsed) ? Math.floor(parsed) : 1
  const limit = Math.max(1, Math.min(100, Math.floor(finiteNumber(maximum)) || 100))
  return Math.max(1, Math.min(limit, integer || 1))
}

export function haveAllParticipantsPaid(purchase, orders = []) {
  const participants = Array.isArray(purchase?.participants) ? purchase.participants : []
  return participants.length > 0 && participants.every((participant) => {
    const order = orders.find((entry) => entry.purchaseId === purchase.id && entry.userId === participant.userId)
    return ['Оплачено', 'Отримано'].includes(participant.payment)
      && order?.paymentStatus === 'Оплачено'
      && !order.cancelled
  })
}

export function getPurchaseStatusAfterReceipt(purchase, allParticipantsReceived) {
  if (purchase?.status !== 'Точка видачі') return purchase?.status ?? null
  return allParticipantsReceived ? 'Завершено' : 'Точка видачі'
}

export function getPurchaseTransition({
  action,
  role,
  purchase,
  userId = '',
  order = null,
  allParticipantsPaid = false,
  hasPaidOrders = false,
  now = Date.now(),
} = {}) {
  if (!purchase) return null

  const collected = finiteNumber(purchase.collected)
  const target = finiteNumber(purchase.target)
  const discountFixed = Boolean(purchase.isDiscountFixed ?? purchase.discountFixed)
  const orderStep = order
    ? finiteNumber(order.currentStep ?? (order.statusIndex == null ? 1 : finiteNumber(order.statusIndex) + 1))
    : Number.POSITIVE_INFINITY

  switch (action) {
    case 'join_purchase':
      return role === 'participant' && purchase.status === COLLECTION_STATUS && !discountFixed
        && target > 0 && (collected >= target || finiteNumber(purchase.expiresAt ?? purchase.deadlineAt) > now)
        ? COLLECTION_STATUS : null
    case 'leave_purchase':
      return role === 'participant' && purchase.status === COLLECTION_STATUS && !discountFixed
        && order && orderStep <= 1
        && order.paymentStatus !== 'Оплачено' && order.status !== 'Отримано'
        ? COLLECTION_STATUS : null
    case 'fix_discount':
      return role === 'organizer' && purchase.organizerId === userId
        && purchase.status === COLLECTION_STATUS && !discountFixed && target > 0 && collected >= target
        ? 'Оплата' : null
    case 'form_batch':
      return role === 'organizer' && purchase.organizerId === userId
        && purchase.status === 'Оплата' && discountFixed && allParticipantsPaid
        ? 'Оформлення' : null
    case 'accept_delivery':
      return role === 'courier' && purchase.status === 'Оформлення' && allParticipantsPaid
        && (!purchase.courierId || purchase.courierId === userId)
        ? 'Доставка' : null
    case 'deliver_to_pickup':
      return role === 'courier' && purchase.status === 'Доставка' && purchase.courierId === userId
        ? 'Точка видачі' : null
    case 'confirm_receipt':
      return role === 'participant' && purchase.status === 'Точка видачі'
        && order?.userId === userId && order.status === 'Точка видачі'
        ? 'Отримано' : null
    case 'cancel_purchase':
      return role === 'organizer' && purchase.organizerId === userId
        && purchase.status === COLLECTION_STATUS && !discountFixed && !hasPaidOrders
        ? 'Скасовано' : null
    case 'expire_purchase': {
      const deadline = finiteNumber(purchase.expiresAt ?? purchase.deadlineAt)
      return purchase.status === COLLECTION_STATUS && target > 0 && collected < target
        && deadline > 0 && deadline <= now ? 'Скасовано' : null
    }
    default:
      return null
  }
}
