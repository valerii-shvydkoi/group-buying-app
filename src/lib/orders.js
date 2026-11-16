import { STATUS_LABELS } from '../data/statuses.js'
import { safeNumber } from './money.js'

function cleanOrderName(value) {
  return typeof value === 'string'
    ? value.replace(/\s*[·•]\s*\d+\s*шт\.?\s*$/iu, '').trim().slice(0, 80)
    : ''
}

const MAX_UNIT_PRICE = 999999999
const MAX_ORDER_SUBTOTAL = MAX_UNIT_PRICE * 1000
const MAX_ORDER_TOTAL = MAX_ORDER_SUBTOTAL + MAX_UNIT_PRICE

function historyTimestamp(entry) {
  const timestamp = Date.parse(entry.timestamp || entry.createdAt || '')
  if (Number.isFinite(timestamp)) return timestamp
  const localized = String(entry.time || '').match(/^(\d{2})\.(\d{2}),\s*(\d{2}):(\d{2})$/)
  if (!localized) return Number.NaN
  const [, day, month, hour, minute] = localized
  return new Date(new Date().getFullYear(), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime()
}

function normalizeLegacyCourierMessage(status, message, courierName, pickupAddress) {
  const isLegacyCourierMessage = /етап доставки.*(?:оновлюється|оновлювався|оновлювалася).*кур.?єр.*розділі.*доставки/i.test(message)
  const courierNameValue = String(courierName || '').trim()
  const isCourierFallback = /^Кур’єр сервісу (?:прийняв замовлення на доставку|доставив замовлення на точку видачі)/u.test(message)
  if (!isLegacyCourierMessage && !(isCourierFallback && courierNameValue)) return message

  const courier = courierNameValue ? `Кур’єр ${courierNameValue}` : 'Кур’єр сервісу'
  const normalizedStatus = String(status || '').toLocaleLowerCase('uk-UA')
  if (normalizedStatus === 'delivery' || normalizedStatus.includes('доставка')) {
    return `${courier} прийняв замовлення на доставку та вирушив до точки видачі.`
  }
  if (normalizedStatus === 'pickup' || normalizedStatus.includes('точка видачі')) {
    const address = String(pickupAddress || '').trim() || 'адресу не вказано'
    return `${courier} доставив замовлення на точку видачі (${address}). Товар очікує на отримання.`
  }
  return message
}

export function normalizeOrderHistory(value, { courierName = '', pickupAddress = '' } = {}) {
  if (!Array.isArray(value)) return []
  const unique = new Map()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const normalized = {
      status: typeof entry.status === 'string' ? entry.status.slice(0, 60) : 'Оновлення',
      message: typeof entry.message === 'string'
        ? normalizeLegacyCourierMessage(entry.status, entry.message, courierName, pickupAddress).slice(0, 500)
        : 'Статус замовлення оновлено.',
      time: typeof entry.time === 'string' ? entry.time.slice(0, 40) : '',
      timestamp: typeof (entry.timestamp || entry.createdAt) === 'string' ? (entry.timestamp || entry.createdAt).slice(0, 40) : '',
    }
    const key = `${normalized.time || normalized.timestamp}\u0000${normalized.status}\u0000${normalized.message}`
    if (!unique.has(key)) unique.set(key, normalized)
  }
  const entries = [...unique.values()]
  const parsed = entries.map(historyTimestamp)
  if (parsed.every(Number.isFinite)) {
    return entries.map((entry, index) => ({ entry, timestamp: parsed[index] }))
      .sort((left, right) => left.timestamp - right.timestamp)
      .map(({ entry }) => entry)
  }
  return entries
}

export function newestOrderHistoryFirst(value, context) {
  return normalizeOrderHistory(value, context).reverse()
}

export function normalizeOrders(value) {
  if (!Array.isArray(value)) return []
  const normalized = value
    .filter((order) => order && typeof order === 'object' && !Array.isArray(order))
    .map((order, index) => {
      const name = cleanOrderName(order.name) || cleanOrderName(order.title) || cleanOrderName(order.productName)
      const rawStep = Math.max(1, Math.min(5, Math.trunc(safeNumber(order.currentStep)) || Math.trunc(safeNumber(order.statusIndex)) + 1))
      const rawStatus = typeof order.status === 'string' ? order.status : ''
      const isCancelled = Boolean(order.cancelled || rawStatus === 'Скасовано')
      const isReceived = rawStatus === 'Отримано' || order.statusBadge === 'Отримано' || order.statusBadge === 'Отримано · Завершено'
      let step = rawStep
      if (rawStatus === 'В дорозі') step = 4
      else if (rawStatus === 'Доставка') step = 4
      else if (rawStatus === 'Точка видачі') step = 5
      else if (rawStatus === 'Оплачено') step = 2
      else if (rawStatus === 'Збір коштів') step = 1
      if (isReceived) step = 5
      const paymentStatus = order.paymentStatus === 'Оплачено'
        || Boolean(order.paidAt)
        || ['Оплачено', 'В дорозі', 'Доставка', 'Точка видачі', 'Отримано'].includes(rawStatus)
        ? 'Оплачено'
        : 'Очікує'
      const status = isCancelled ? 'Скасовано' : isReceived ? 'Отримано' : STATUS_LABELS[step - 1]
      const quantity = Math.max(1, Math.min(100, Math.floor(Number(order.quantity) || 1)))
      const unitPrice = Math.min(MAX_UNIT_PRICE, Math.max(0, safeNumber(order.unitPrice)))
      const subtotal = Math.min(MAX_ORDER_SUBTOTAL, quantity * unitPrice)
      const deliveryShare = Math.min(MAX_UNIT_PRICE, Math.max(0, safeNumber(order.deliveryShare)))
      return {
        ...order,
        id: typeof order.id === 'string' && order.id ? order.id : `order-${index}`,
        purchaseId: typeof order.purchaseId === 'string' ? order.purchaseId : '',
        userId: typeof order.userId === 'string' ? order.userId : '',
        userName: typeof order.userName === 'string' ? order.userName : '',
        name,
        quantity,
        unitPrice,
        subtotal,
        deliveryShare,
        total: Math.min(MAX_ORDER_TOTAL, subtotal + deliveryShare),
        status,
        cancelled: isCancelled,
        paymentStatus,
        currentStep: step,
        statusIndex: step - 1,
        statusBadge: isCancelled
          ? (typeof order.statusBadge === 'string' && order.statusBadge.trim() ? order.statusBadge : 'Скасовано')
          : isReceived ? 'Отримано' : STATUS_LABELS[step - 1],
        supplier: typeof order.supplier === 'string' ? order.supplier.slice(0, 80) : '',
        pickupAddress: typeof order.pickupAddress === 'string' ? order.pickupAddress.slice(0, 90) : '',
        pickupHours: typeof order.pickupHours === 'string' ? order.pickupHours.slice(0, 40) : '09:00 – 21:00',
        history: normalizeOrderHistory(order.history, {
          courierName: order.courierName,
          pickupAddress: order.pickupAddress,
        }),
      }
    })
    // Exclude records that cannot be linked to a real account and purchase.
    .filter((order) => order.name.length >= 2 && order.purchaseId.length > 0 && order.userId.length > 0)

  const byPurchaseAndUser = new Map()
  for (const order of normalized) {
    const key = `${order.purchaseId}\u0000${order.userId}`
    const previous = byPurchaseAndUser.get(key)
    if (!previous) {
      byPurchaseAndUser.set(key, order)
      continue
    }
    const previousRank = previous.currentStep + (previous.cancelled && previous.currentStep < STATUS_LABELS.length ? 0.5 : 0)
    const orderRank = order.currentStep + (order.cancelled && order.currentStep < STATUS_LABELS.length ? 0.5 : 0)
    const preferred = orderRank >= previousRank ? order : previous
    const history = [...previous.history, ...order.history]
    const uniqueHistory = normalizeOrderHistory(history, {
      courierName: preferred.courierName,
      pickupAddress: preferred.pickupAddress,
    })
    byPurchaseAndUser.set(key, { ...preferred, history: uniqueHistory })
  }
  return [...byPurchaseAndUser.values()]
}
