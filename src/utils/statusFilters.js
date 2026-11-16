import { getPurchasePricing } from './calculations.js'
import { haveAllParticipantsPaid } from './purchaseWorkflow.js'

function canonicalStatus(status = '') {
  const labels = {
    collecting: 'Збір учасників',
    payment: 'Оплата',
    preparing: 'Оформлення',
    delivery: 'Доставка',
    pickup: 'Точка видачі',
    received: 'Отримано',
    completed: 'Завершено',
    cancelled: 'Скасовано',
  }
  return labels[String(status).toLowerCase()] || status
}

export function getOrganizerPurchaseCategory(purchase, orders = []) {
  const status = canonicalStatus(purchase?.status)
  if (['Завершено', 'Отримано', 'Скасовано'].includes(status)) return 'completed'
  const discountEligible = getPurchasePricing(purchase).reached
  const discountFixed = Boolean(purchase?.isDiscountFixed ?? purchase?.discountFixed)
  if (status === 'Збір учасників' && discountEligible && !discountFixed) return 'action'
  if (status === 'Оплата' && haveAllParticipantsPaid(purchase, orders)) return 'action'
  return 'active'
}

export function getParticipantOrderCategory(order) {
  const status = canonicalStatus(order?.status)
  if (order?.cancelled || ['Отримано', 'Завершено', 'Скасовано'].includes(status)) return 'completed'
  const step = Number(order?.currentStep) || Number(order?.statusIndex) + 1
  const waitingForAction = (step === 2 && order?.paymentStatus !== 'Оплачено')
    || (step === 5 && status !== 'Отримано')
  return waitingForAction ? 'action' : 'active'
}

export function getLogisticsPurchaseCategory(purchase) {
  const status = canonicalStatus(purchase?.status)
  if (status === 'Оформлення') return 'action'
  if (status === 'Доставка') return 'active'
  if (['Точка видачі', 'Отримано', 'Завершено'].includes(status)) return 'completed'
  return null
}

export function getFilterCounts(items, categoryForItem, categories = ['active', 'action', 'completed']) {
  return Object.fromEntries([
    ['all', items.length],
    ...categories.map((category) => [category, items.filter((item) => categoryForItem(item) === category).length]),
  ])
}
