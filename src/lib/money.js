import { safeNumber } from '../utils/calculations.js'
export { calculateDeliveryShare, calculateSavings, percentOf, safeNumber } from '../utils/calculations.js'

export function formatMoney(value) {
  const amount = Math.round(safeNumber(value))
  return `${amount.toLocaleString('uk-UA')} грн`
}
