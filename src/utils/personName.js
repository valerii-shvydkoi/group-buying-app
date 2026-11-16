const NAME_LETTERS = 'A-Za-zА-Яа-яІіЇїЄєҐґ'
const NAME_ALLOWED_PATTERN = new RegExp(`^[${NAME_LETTERS}'-]+$`, 'u')
const NAME_LETTER_PATTERN = new RegExp(`[${NAME_LETTERS}]`, 'gu')

export function sanitizePersonName(value = '') {
  const filtered = String(value).replace(new RegExp(`[^${NAME_LETTERS}'-]`, 'gu'), '')
  if (!filtered) return ''
  return filtered[0].toLocaleUpperCase('uk-UA') + filtered.slice(1)
}

export function isValidPersonName(value = '') {
  const name = String(value)
  return NAME_ALLOWED_PATTERN.test(name) && (name.match(NAME_LETTER_PATTERN) || []).length >= 2
}

export function hasAtLeastTwoLetters(value = '') {
  return (String(value).match(NAME_LETTER_PATTERN) || []).length >= 2
}

export function namesMatchEitherOrder(storedFirst, storedLast, firstName, lastName) {
  const first = String(storedFirst || '').trim().toLocaleLowerCase('uk-UA')
  const last = String(storedLast || '').trim().toLocaleLowerCase('uk-UA')
  const expectedFirst = String(firstName || '').trim().toLocaleLowerCase('uk-UA')
  const expectedLast = String(lastName || '').trim().toLocaleLowerCase('uk-UA')
  return (first === expectedFirst && last === expectedLast)
    || (first === expectedLast && last === expectedFirst)
}

export function fullNameMatchesEitherOrder(storedName, firstName, lastName) {
  const fullName = String(storedName || '').trim().toLocaleLowerCase('uk-UA')
  const expectedFirst = String(firstName || '').trim().toLocaleLowerCase('uk-UA')
  const expectedLast = String(lastName || '').trim().toLocaleLowerCase('uk-UA')
  return fullName === `${expectedFirst} ${expectedLast}`
    || fullName === `${expectedLast} ${expectedFirst}`
}
