export function sanitizeImageUrl(value = '') {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}
