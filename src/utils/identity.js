export function initials(name = '', lastName = '') {
  if (lastName) return `${name.trim()[0] || ''}${lastName.trim()[0] || ''}`.toUpperCase()
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

const AVATAR_PAIRS = [
  ['#dbeafe', '#1d4ed8', '#172554', '#bfdbfe'],
  ['#fce7f3', '#be185d', '#500724', '#fbcfe8'],
  ['#fef3c7', '#a16207', '#451a03', '#fde68a'],
  ['#dcfce7', '#15803d', '#052e16', '#bbf7d0'],
  ['#ede9fe', '#6d28d9', '#2e1065', '#ddd6fe'],
  ['#ffedd5', '#c2410c', '#431407', '#fed7aa'],
]

export function getAvatarStyle(name = '', theme = 'light') {
  const seed = Array.from(String(name)).reduce((sum, character) => sum + character.codePointAt(0), 0)
  const [lightBackground, lightColor, darkBackground, darkColor] = AVATAR_PAIRS[seed % AVATAR_PAIRS.length]
  return {
    backgroundColor: theme === 'dark' ? darkBackground : lightBackground,
    color: theme === 'dark' ? darkColor : lightColor,
  }
}
