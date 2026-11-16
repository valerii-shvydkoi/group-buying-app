import { hasAtLeastTwoLetters } from './personName.js'

const VALID_CATEGORIES = new Set(['Продукти', 'Побутова хімія', 'Дитячі товари', 'Для тварин', 'Інше'])
const VALID_TIMER_SECONDS = new Set([30, 10800, 86400, 259200, 604800, 1209600])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value) {
  const email = String(value ?? '').trim()
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

export function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64
}

export function parseNonNegativeInteger(value) {
  if (typeof value !== 'string' || value.trim() === '' || !/^(0|[1-9]\d*)$/.test(value.trim())) return null
  const parsed = Number(value.trim())
  return Number.isSafeInteger(parsed) ? parsed : null
}

function validateIntegerField(value, emptyMessage, invalidMessage, zeroMessage, allowZero = false) {
  if (!String(value ?? '').trim()) return emptyMessage
  const parsed = parseNonNegativeInteger(value)
  if (parsed === null) return invalidMessage
  if (parsed > 999999999) return 'Значення не може перевищувати 999 999 999'
  if (!allowZero && parsed === 0) return zeroMessage
  return ''
}

export function validateOrganizerForm(values = {}) {
  const retail = parseNonNegativeInteger(values.retail)
  const wholesale = parseNonNegativeInteger(values.wholesale)
  const retailError = validateIntegerField(values.retail, 'Введіть роздрібну ціну', 'Використовуйте лише ціле невід’ємне число', 'Ціна має бути більшою за 0')
  const wholesaleError = validateIntegerField(values.wholesale, 'Введіть гуртову ціну', 'Використовуйте лише ціле невід’ємне число', 'Ціна має бути більшою за 0')
  const name = typeof values.name === 'string' ? values.name.trim() : ''
  const supplier = typeof values.supplier === 'string' ? values.supplier.trim() : ''
  const category = String(values.category ?? '').trim()
  const timerValue = String(values.timer ?? '').trim()
  const timerError = !timerValue ? 'Оберіть тривалість збору' : VALID_TIMER_SECONDS.has(Number(timerValue)) ? '' : 'Оберіть коректну тривалість збору'
  const pickupAddress = String(values.pickupAddress ?? '').trim()
  const deliveryValue = String(values.delivery ?? '').trim()
  const description = String(values.description ?? '')
  const pickupHours = String(values.pickupHours ?? '').trim()
  const validateMeasure = (value) => {
    const text = String(value ?? '').trim().replace(',', '.')
    if (!text) return ''
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return 'Введіть невід’ємне число до 2 знаків після коми'
    const number = Number(text)
    return Number.isFinite(number) && number <= 999999999 ? '' : 'Значення завелике'
  }
  return {
    name: !name ? 'Введіть назву товару' : name.length < 3 ? 'Мінімум 3 символи' : name.length > 80 ? 'Максимум 80 символів' : !hasAtLeastTwoLetters(name) ? 'Назва має містити щонайменше 2 літери' : '',
    category: VALID_CATEGORIES.has(category) ? '' : 'Оберіть категорію',
    supplier: !supplier ? 'Введіть магазин або постачальника' : supplier.length < 2 ? 'Мінімум 2 символи' : supplier.length > 80 ? 'Максимум 80 символів' : '',
    retail: retailError,
    wholesale: wholesaleError || (retail !== null && wholesale !== null && wholesale >= retail ? 'Має бути нижчою за роздрібну' : ''),
    target: validateIntegerField(values.target, 'Введіть поріг збору', 'Використовуйте лише ціле невід’ємне число', 'Сума має бути більшою за 0'),
    delivery: !deliveryValue ? 'Введіть вартість доставки' : deliveryValue.startsWith('-') ? 'Вартість не може бути від’ємною' : validateIntegerField(values.delivery, 'Введіть вартість доставки', 'Використовуйте лише ціле невід’ємне число', 'Вартість не може бути від’ємною', true),
    timer: timerError,
    pickupAddress: !pickupAddress ? 'Введіть точку видачі' : pickupAddress.length < 4 ? 'Вкажіть точнішу адресу' : pickupAddress.length > 90 ? 'Максимум 90 символів' : !hasAtLeastTwoLetters(pickupAddress) ? 'Адреса має містити щонайменше 2 літери' : '',
    pickupHours: pickupHours.length > 40 ? 'Максимум 40 символів' : '',
    description: description.length > 300 ? 'Максимум 300 символів' : '',
    totalWeightKg: validateMeasure(values.totalWeightKg),
    totalVolumeL: validateMeasure(values.totalVolumeL),
  }
}

export function expiryIsValid(value = '') {
  if (!/^\d{2}\/\d{2}$/.test(value)) return false
  const [month, shortYear] = value.split('/').map(Number)
  if (month < 1 || month > 12) return false
  return shortYear >= 26 && shortYear <= 35
}
