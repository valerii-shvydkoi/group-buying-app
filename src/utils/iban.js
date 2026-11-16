export function normalizeUkrainianIban(value = '') {
  const characters = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 29)
  if (!characters) return ''
  if (characters.length === 1) return characters === 'U' ? 'U' : ''
  const prefix = characters.slice(0, 2)
  if (prefix !== 'UA') return prefix.startsWith('U') ? 'U' : ''
  return `UA${characters.slice(2).replace(/\D/g, '').slice(0, 27)}`
}

export function normalizeIbanInput(value = '', { deleting = false } = {}) {
  const raw = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (deleting && ['', 'U', 'UA', 'A'].includes(raw)) return ''
  if (!raw) return ''
  if (raw === 'U') return 'UA'
  const digits = (raw.startsWith('UA') ? raw.slice(2) : raw).replace(/\D/g, '').slice(0, 27)
  return `UA${digits}`
}

export function formatUkrainianIban(value = '') {
  const normalized = normalizeUkrainianIban(value)
  return normalized.match(/.{1,4}/g)?.join(' ') || ''
}

export function isValidUkrainianIban(value = '') {
  return /^UA\d{27}$/.test(normalizeUkrainianIban(value))
}

export function formatIbanPreview(value = '') {
  const normalized = normalizeUkrainianIban(value)
  const prefix = normalized.slice(0, 4).padEnd(4, '•')
  const suffix = normalized.length > 25 ? normalized.slice(-4).padStart(4, '•') : '••••'
  return `${prefix} •••• •••• •••• ${suffix}`
}

export function formatSavedIban(last4 = '') {
  const suffix = String(last4).replace(/\D/g, '').slice(-4)
  return `IBAN •••• ${suffix || '••••'}`
}
