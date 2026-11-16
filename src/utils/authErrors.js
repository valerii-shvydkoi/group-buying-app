const FALLBACK_AUTH_ERROR = 'Не вдалося виконати операцію. Перевірте введені дані'

const AUTH_ERROR_TRANSLATIONS = [
  [/invalid login credentials|invalid_credentials/i, 'Невірний email або пароль'],
  [/user already registered|already been registered|user_already_exists/i, 'Користувач із такою електронною поштою вже зареєстрований'],
  [/email not confirmed|email_not_confirmed/i, 'Електронну пошту не підтверджено'],
  [/password should be at least|password_too_short/i, 'Пароль має містити щонайменше 8 символів'],
  [/unable to validate email address|invalid email|email address is invalid/i, 'Введіть коректну адресу електронної пошти'],
  [/rate limit|only request this after/i, 'Забагато спроб. Зачекайте трохи та спробуйте ще раз'],
  [/failed to fetch|networkerror|fetch failed|network request failed|failed to connect/i, 'Помилка з’єднання з сервером. Перевірте інтернет-підключення'],
  [/could not find the function|function\s+[^\n]*\s+does not exist|does not exist/i, 'Оновіть SQL-функцію reset_user_password у Supabase SQL Editor'],
]

export function localizeAuthError(error) {
  const message = typeof error === 'string'
    ? error.trim()
    : String(error?.message || error?.error_description || error?.msg || '').trim()

  if (!message) return FALLBACK_AUTH_ERROR
  if (/[А-Яа-яІіЇїЄєҐґ]/.test(message)) return message

  const translation = AUTH_ERROR_TRANSLATIONS.find(([pattern]) => pattern.test(message))
  return translation?.[1] || FALLBACK_AUTH_ERROR
}

export { FALLBACK_AUTH_ERROR }
