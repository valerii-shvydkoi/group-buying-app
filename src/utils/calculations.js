export function safeNumber(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const MAX_UNIT_PRICE = 999999999
const MAX_DELIVERY_TOTAL = 999999999
const MAX_ORDER_SUBTOTAL = MAX_UNIT_PRICE * 1000
const MAX_COLLECTION = MAX_ORDER_SUBTOTAL * 5000
const boundedNumber = (value, max) => Math.min(max, Math.max(0, safeNumber(value)))

export function getUniqueParticipantCount(participants) {
  if (!Array.isArray(participants)) return 0
  const identities = new Set()
  for (const participant of participants) {
    const identity = participant?.userId ?? participant?.email ?? participant?.id
    if (identity == null || String(identity).trim() === '') continue
    identities.add(String(identity).trim().toLocaleLowerCase('uk-UA'))
  }
  return identities.size
}

export function calculateDeliveryShare(deliveryTotal, subtotal, _threshold, collected = 0) {
  const baseAmount = boundedNumber(collected, MAX_COLLECTION)
  if (baseAmount <= 0) return 0
  const delivery = boundedNumber(deliveryTotal, MAX_DELIVERY_TOTAL)
  const share = Math.round(delivery * (boundedNumber(subtotal, MAX_ORDER_SUBTOTAL) / baseAmount))
  return Math.min(delivery, Math.max(0, share))
}

export function getPurchasePricing(purchase = {}) {
  const retailPrice = boundedNumber(purchase.retail, MAX_UNIT_PRICE)
  const wholesalePrice = boundedNumber(purchase.wholesale, MAX_UNIT_PRICE)
  const threshold = boundedNumber(purchase.target, MAX_UNIT_PRICE)
  const targetReached = threshold > 0 && boundedNumber(purchase.collected, MAX_COLLECTION) >= threshold
  const participants = Array.isArray(purchase.participants) ? purchase.participants.slice(0, 5000) : []
  const participantCount = getUniqueParticipantCount(participants)
  const reached = targetReached && participantCount >= 2
  const unitPrice = reached ? wholesalePrice : retailPrice
  const totalCollected = participants.reduce((total, participant) => {
    const quantity = Math.max(0, Math.min(100, Math.floor(Number(participant.quantity) || 0)))
    return Math.min(MAX_COLLECTION, total + quantity * unitPrice)
  }, 0)
  // Once the wholesale price is active, express the goal in that same price basis.
  // This keeps a fully funded, single-participant order responsible for all delivery.
  const thresholdAtCurrentPrice = reached && retailPrice > 0
    ? threshold * (wholesalePrice / retailPrice)
    : threshold
  // Allocate delivery over the actual baskets at the active price. Using the
  // target here overcharges early participants and makes preview totals drift.
  const deliveryBase = totalCollected

  return { reached, targetReached, participantCount, unitPrice, totalCollected, thresholdAtCurrentPrice, deliveryBase }
}

export function calculatePurchaseDeliveryShare(purchase = {}, userSubtotal = 0) {
  const pricing = getPurchasePricing(purchase)
  return calculateDeliveryShare(
    purchase.deliveryTotal ?? purchase.delivery,
    userSubtotal,
    pricing.thresholdAtCurrentPrice,
    pricing.totalCollected,
  )
}

export function calculatePurchaseDeliveryShares(purchase = {}, participants = []) {
  const pricing = getPurchasePricing(purchase)
  const deliveryTotal = boundedNumber(purchase.deliveryTotal ?? purchase.deliveryCost ?? purchase.delivery, MAX_DELIVERY_TOTAL)
  const allocations = participants.map((participant, index) => {
    const quantity = Math.max(1, Math.min(100, Math.floor(Number(participant.quantity) || 1)))
    const subtotal = boundedNumber(participant.subtotal ?? participant.amount ?? quantity * pricing.unitPrice, MAX_ORDER_SUBTOTAL)
    return {
      userId: participant.userId ?? participant.id ?? String(index),
      subtotal,
      deliveryShare: calculateDeliveryShare(deliveryTotal, subtotal, pricing.thresholdAtCurrentPrice, pricing.totalCollected),
    }
  })

  const allocatedSubtotal = allocations.reduce((total, entry) => total + entry.subtotal, 0)
  if (allocatedSubtotal > 0 && allocations.length) {
    let remainder = deliveryTotal - allocations.reduce((total, entry) => total + entry.deliveryShare, 0)
    const largestFirst = allocations
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => right.entry.subtotal - left.entry.subtotal)
    for (const { entry } of largestFirst) {
      if (remainder === 0) break
      if (remainder > 0) {
        entry.deliveryShare += remainder
        remainder = 0
      } else {
        const correction = Math.min(entry.deliveryShare, -remainder)
        entry.deliveryShare -= correction
        remainder += correction
      }
    }
  }

  return allocations.map(({ userId, deliveryShare }) => ({ userId, deliveryShare }))
}

export function percentOf(value, target) {
  const safeTarget = safeNumber(target)
  if (safeTarget <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((safeNumber(value) / safeTarget) * 100)))
}

export function calculateSavings(retailPrice, wholesalePrice, quantity = 1) {
  const safeQuantity = Math.max(0, Math.min(100, Math.floor(Number(quantity) || 0)))
  const retail = boundedNumber(retailPrice, MAX_UNIT_PRICE)
  const wholesale = boundedNumber(wholesalePrice, MAX_UNIT_PRICE)
  return Math.max(0, safeQuantity * (retail - wholesale))
}
