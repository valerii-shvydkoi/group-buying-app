const NETWORK_ERROR = 'Відсутнє з’єднання з інтернетом. Перевірте мережу та спробуйте ще раз.'

export function localizeErrorMessage(error, fallback = 'Не вдалося виконати операцію. Спробуйте ще раз.') {
  const rawMessage = typeof error === 'string' ? error : error?.message
  const message = String(rawMessage || '').trim()
  const normalized = message.toLowerCase()

  if (!message) return fallback
  if (/failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout|timed out|etimedout|econnreset|err_network/.test(normalized)) {
    return NETWORK_ERROR
  }
  if (/too many requests|rate limit|429/.test(normalized)) return 'Забагато запитів. Зачекайте трохи та спробуйте ще раз.'
  if (/internal server error|bad gateway|service unavailable|gateway timeout|\b50[0234]\b/.test(normalized)) {
    return 'Сервер тимчасово недоступний. Спробуйте ще раз трохи пізніше.'
  }
  if (/[А-Яа-яІіЇїЄєҐґ]/.test(message)) return message
  return fallback
}
