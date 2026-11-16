export function getPaymentCardBrand(value = '') {
  const digits = String(value).replace(/\D/g, '')
  if (digits.startsWith('4')) return 'Visa'
  if (/^[25]/.test(digits)) return 'Mastercard'
  if (digits.startsWith('9')) return 'Простір'
  return 'Банківська картка'
}

export function getPaymentCardBrandLabel(brand = '') {
  if (brand === 'Visa') return 'VISA'
  if (brand === 'Простір') return 'ПРОСТІР'
  return brand || 'Банківська картка'
}

export function formatPaymentCardInput(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, 16)
  return digits.match(/.{1,4}/g)?.join(' ') || ''
}

export function formatBinLastFourPreview(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, 16)
  const firstGroup = `${digits.slice(0, 4)}${'•'.repeat(Math.max(0, 4 - Math.min(digits.length, 4)))}`
  const lastDigits = digits.length > 12 ? digits.slice(12, 16) : ''
  const lastGroup = `${lastDigits}${'•'.repeat(4 - lastDigits.length)}`
  return `${firstGroup} •••• •••• ${lastGroup}`
}

export function formatSavedCardNumber(lastFour = '') {
  const digits = String(lastFour).replace(/\D/g, '').slice(-4).padStart(4, '•')
  return `•••• •••• •••• ${digits}`
}
